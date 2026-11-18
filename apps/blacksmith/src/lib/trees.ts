/**
 * The crafting trees, built from data/: one per weapon type, one flat list per
 * armor slot and rank, and one flat list of decorations.
 *
 * Weapons: one tree per type, following improve_to; a weapon with several
 * parents has its branch under the first and an alias row under the rest.
 * Armor: a flat list per slot and rank. Decorations: one flat list, in the
 * game's crafting order (data/decorations.json's order).
 */
import { readData } from "game-data";
import { type ArmorRank, type ArmorSlot, type WeaponType } from "./constants";
import { cached } from "./data-cache";
import { DATA_DIR } from "./paths";
import { armorSlugs, slugify } from "./slug";
import type { WeaponTreeNode } from "./types";

interface Row {
  name: string;
  type: string;
  rarity: number;
  color?: string;
  elements?: { name: string }[];
  improve_from?: unknown;
  improve_to?: string[];
}

type ArmorRow = Row & { rank: string; sex?: string };

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
const armorCache = new Map<string, ArmorRow[]>();

const readWeapons = (type: string) =>
  cached(
    weaponCache,
    type,
    () => readData<{ weapons: Row[] }>(DATA_DIR, "weapons", `${type}.json`).weapons,
  );

/** `parseInt` semantics of Ruby's `to_i`: non-numeric rarity sorts as 0. */
const rarityOf = (item: { rarity: number | string }) => parseInt(String(item.rarity), 10) || 0;

const weaponKey = (weapon: Row) => `${weapon.type}|${weapon.name}`;

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
    slug: slugify(weapon.name),
    type: weapon.type,
    name: weapon.name,
    rarity: weapon.rarity,
  };
  if (weapon.color) node.color = weapon.color;
  if (weapon.elements?.length) {
    const elements = weapon.elements.map((e) => e.name.toLowerCase());
    node.element = elements[0];
    if (elements.length > 1) node.elements = elements;
  }

  if (placed.has(weaponKey(weapon))) {
    node.alias = true;
    return node;
  }
  placed.add(weaponKey(weapon));

  if (weapon.improve_to) {
    node.children = [];
    for (const childName of weapon.improve_to) {
      const child =
        own.find((w) => w.name === childName) ??
        sibling.find((w) => w.name === childName && w.type !== weapon.type);
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
    sibling.filter((w) => w.improve_to?.some((child) => weapons.some((o) => o.name === child))),
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
  const armor = cached(
    armorCache,
    slot,
    () => readData<{ armor: ArmorRow[] }>(DATA_DIR, "armor", `${slot}.json`).armor,
  );
  const pieces = armor.filter((a) => a.rank === rank).toSorted((a, b) => rarityOf(a) - rarityOf(b));
  // Pieces that exist as separate Male and Female entries get a sex suffix.
  const slugs = armorSlugs(pieces);
  return pieces.map((a, i) => ({
    slug: slugs[i],
    type: a.type,
    name: a.name,
    rarity: a.rarity,
  }));
}

export function buildDecorationTree(): WeaponTreeNode[] {
  const { decorations } = readData<{ decorations: Row[] }>(DATA_DIR, "decorations.json");
  return decorations.map((d) => ({
    slug: slugify(d.name),
    type: d.type,
    name: d.name,
    rarity: d.rarity,
    ...(d.color && { color: d.color }),
  }));
}
