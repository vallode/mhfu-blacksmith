/**
 * The crafting trees, built from data/: one per weapon type, one flat list per
 * armor slot and rank, and one flat list of decorations.
 *
 * Weapons: one tree per type, following improve_to; a weapon with several
 * parents has its branch under the first and an alias row under the rest.
 * Armor: a flat list per slot and rank. Decorations: one flat list, in the
 * game's crafting order (data/<game>/decorations.json's order).
 *
 * Read by ID (game-records.ts): upgrades join weapons by their IDs in the
 * game's weapon table, names come from the page's language, and slugs from
 * the English names.
 */
import { weaponTable } from "game-data";
import { type ArmorRank, type ArmorSlot, type WeaponType } from "./constants";
import { cached } from "./data-cache";
import { gameRecords } from "./game-records";
import { armorSlugs, slugify } from "./slug";
import type { WeaponTreeNode } from "./types";

/** A weapon as stored: upgrades are IDs in its table (melee or ranged). */
interface RawWeapon {
  id: number;
  type: string;
  rarity: number;
  color?: string;
  elements?: { name: string }[] | null;
  improve_from?: number | number[] | null;
  improve_to?: number[] | null;
}

/** A weapon with its names: in the page's language, and the English one its slug comes from. */
type Row = RawWeapon & { name: string; slug: string };

interface Named {
  name: string;
  type: string;
  rarity: number;
  color?: string;
}

type ArmorRow = Named & { rank: string; sex?: string };

// Each type is paired with the type whose weapons can upgrade into it.
const SIBLING_TYPES: Record<WeaponType, WeaponType | null> = {
  "great-sword": "long-sword",
  "long-sword": "great-sword",
  "sword-and-shield": "dual-blades",
  "dual-blades": "sword-and-shield",
  hammer: "hunting-horn",
  "hunting-horn": "hammer",
  lance: "gunlance",
  gunlance: "lance",
  "light-bowgun": null,
  "heavy-bowgun": null,
  bow: null,
};

const weaponCache = new Map<string, Row[]>();
const armorCache = new Map<string, { pieces: ArmorRow[]; english: ArmorRow[] }>();

const readWeapons = (type: string) =>
  cached(weaponCache, type, () => {
    const records = gameRecords();
    const table = weaponTable(type);
    return records.raw<{ weapons: RawWeapon[] }>(`weapons/${type}.json`).weapons.map((w) => ({
      ...w,
      name: records.strings.name(table, w.id),
      slug: slugify(records.englishStrings.name(table, w.id)),
    }));
  });

/** `parseInt` semantics of Ruby's `to_i`: non-numeric rarity sorts as 0. */
const rarityOf = (item: { rarity: number | string }) => parseInt(String(item.rarity), 10) || 0;

const weaponKey = (weapon: Row) => `${weapon.type}|${weapon.id}`;

/**
 * `placed` holds every weapon already in this tree (by type and name), in the
 * order the tree is read. A weapon with several parents gets its branch under
 * the first one; under the others it is an alias row with no children, so the
 * same branch isn't listed twice. Upgrades that run both ways (Azure Ogre
 * Sword <-> Ultimus Heaven&Earth) end the same way: the weapon above is
 * already placed, so the way back up is an alias row.
 */
function weaponNode(weapon: Row, own: Row[], sibling: Row[], placed: Set<string>): WeaponTreeNode {
  const node: WeaponTreeNode = {
    slug: weapon.slug,
    type: weapon.type,
    name: weapon.name,
    rarity: weapon.rarity,
  };
  if (weapon.color) node.color = weapon.color;
  // TODO: Adjust to use both elements in dual element weapons.
  if (weapon.elements) node.element = weapon.elements[0].name.toLowerCase();

  if (placed.has(weaponKey(weapon))) {
    node.alias = true;
    return node;
  }
  placed.add(weaponKey(weapon));

  if (weapon.improve_to) {
    node.children = [];
    for (const childId of weapon.improve_to) {
      const child =
        own.find((w) => w.id === childId) ??
        sibling.find((w) => w.id === childId && w.type !== weapon.type);
      if (child) node.children.push(weaponNode(child, own, sibling, placed));
    }
  }
  return node;
}

export function buildWeaponTree(type: string): WeaponTreeNode[] {
  const weapons = readWeapons(type);
  const siblingType = SIBLING_TYPES[type as WeaponType];
  const sibling = siblingType ? readWeapons(siblingType) : [];

  let roots = weapons.filter((w) => !w.improve_from);
  // Sibling-type weapons that upgrade into this type start trees here too.
  roots = roots.concat(
    sibling.filter((w) => w.improve_to?.some((child) => weapons.some((o) => o.id === child))),
  );

  const isDeadEnd = (w: Row) => !w.improve_from && !w.improve_to;
  const sorted = roots.toSorted((a, b) => rarityOf(a) - rarityOf(b));
  roots = [...sorted.filter((w) => !isDeadEnd(w)), ...sorted.filter(isDeadEnd)];

  // A root already listed under a weapon above it (a paired-type weapon that
  // this type also upgrades into) has its branch there.
  const placed = new Set<string>();
  const map: WeaponTreeNode[] = [];
  for (const w of roots) {
    if (!placed.has(weaponKey(w))) map.push(weaponNode(w, weapons, sibling, placed));
  }
  return map;
}

export function buildArmorTree(slot: ArmorSlot, rank: ArmorRank): WeaponTreeNode[] {
  const { pieces: armor, english } = cached(armorCache, slot, () => {
    const records = gameRecords();
    const file = `armor/${slot}.json`;
    return {
      pieces: records.named<{ armor: ArmorRow[] }>(file).armor,
      english: records.english<{ armor: ArmorRow[] }>(file).armor,
    };
  });
  const atRank = armor
    .flatMap((a, i) => (a.rank === rank ? [i] : []))
    .toSorted((a, b) => rarityOf(armor[a]!) - rarityOf(armor[b]!));
  // Pieces that exist as separate Male and Female entries get a sex suffix;
  // slugs from the English names.
  const slugs = armorSlugs(atRank.map((i) => english[i]!));
  return atRank.map((i, j) => ({
    slug: slugs[j]!,
    type: armor[i]!.type,
    name: armor[i]!.name,
    rarity: armor[i]!.rarity,
  }));
}

export function buildDecorationTree(): WeaponTreeNode[] {
  const records = gameRecords();
  const { decorations } = records.named<{ decorations: Named[] }>("decorations.json");
  const english = records.english<{ decorations: Named[] }>("decorations.json").decorations;
  return decorations.map((d, i) => ({
    slug: slugify(english[i]!.name),
    type: d.type,
    name: d.name,
    rarity: d.rarity,
    ...(d.color && { color: d.color }),
  }));
}
