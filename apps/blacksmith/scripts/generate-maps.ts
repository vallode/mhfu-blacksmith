/**
 * Writes the crafting trees (content/**\/map.json) from data/.
 *
 * Weapons: one tree per type, following improve_to; a weapon with several
 * parents has its branch under the first and an alias row under the rest.
 * Armor: a flat list per slot and rank. Decorations: one flat list, in the
 * game's crafting order (data/decorations.json's order).
 */
import fs from "fs";
import path from "path";
import { slugify, armorSlugs } from "../src/lib/slug";
import { DATA_DIR } from "../src/lib/paths";
import { readData } from "game-data";

const root = process.cwd();
const dataDir = DATA_DIR;
const contentDir = path.join(root, "content");

interface Weapon {
  name: string;
  type: string;
  rarity: number | string;
  color?: string;
  elements?: { name: string }[];
  improve_from?: unknown;
  improve_to?: string[];
}

interface MapNode {
  slug: string;
  type: string;
  name: string;
  rarity: number | string | null;
  color?: string;
  element?: string;
  /**
   * A weapon that can be upgraded from more than one weapon is listed under
   * each of them, but its own upgrades only under the first: here it is a leaf
   * that points back up to that row.
   */
  alias?: true;
  children?: MapNode[];
}

// Each type is paired with the type whose weapons can upgrade into it.
const WEAPON_PAIRS: [string, string | null][] = [
  ["great-sword", "long-sword"],
  ["long-sword", "great-sword"],
  ["sword-and-shield", "dual-blades"],
  ["dual-blades", "sword-and-shield"],
  ["hammer", "hunting-horn"],
  ["hunting-horn", "hammer"],
  ["lance", "gunlance"],
  ["gunlance", "lance"],
  ["light-bowgun", null],
  ["heavy-bowgun", null],
  ["bow", null],
];

const ARMOR_SLOTS = ["helmet", "plate", "gauntlets", "waist", "leggings"];
const ARMOR_RANKS = ["low-rank", "high-rank", "g-rank"];

function readJson<T>(...parts: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(...parts), "utf8")) as T;
}

function writeMap(file: string, map: MapNode[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `{\n  "map": ${JSON.stringify(map, null, 2)}\n}\n`);
}

/** `parseInt` semantics of Ruby's `to_i`: non-numeric rarity sorts as 0. */
const rarityOf = (item: { rarity: number | string }) => parseInt(String(item.rarity), 10) || 0;

const weaponKey = (weapon: Weapon) => `${weapon.type}|${weapon.name}`;

/**
 * `placed` holds every weapon already in this tree (by type and name), in the
 * order the tree is read. A weapon with several parents gets its branch under
 * the first one; under the others it is an alias row with no children, so the
 * same branch isn't listed twice. Upgrades that run both ways (Azure Ogre
 * Sword <-> Ultimus Heaven&Earth) end the same way: the weapon above is
 * already placed, so the way back up is an alias row.
 */
function weaponNode(
  weapon: Weapon,
  own: Weapon[],
  sibling: Weapon[],
  placed: Set<string>,
): MapNode {
  const node: MapNode = {
    slug: slugify(weapon.name),
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
    for (const childName of weapon.improve_to) {
      const child =
        own.find((w) => w.name === childName) ??
        sibling.find((w) => w.name === childName && w.type !== weapon.type);
      if (child) node.children.push(weaponNode(child, own, sibling, placed));
    }
  }
  return node;
}

for (const [type, siblingType] of WEAPON_PAIRS) {
  const weapons = readData<{ weapons: Weapon[] }>(dataDir, "weapons", `${type}.json`).weapons;
  const sibling = siblingType
    ? readData<{ weapons: Weapon[] }>(dataDir, "weapons", `${siblingType}.json`).weapons
    : [];

  let roots = weapons.filter((w) => !w.improve_from);
  // Sibling-type weapons that upgrade into this type start trees here too.
  roots = roots.concat(
    sibling.filter((w) => w.improve_to?.some((child) => weapons.some((o) => o.name === child))),
  );

  const isDeadEnd = (w: Weapon) => !w.improve_from && !w.improve_to;
  const sorted = roots.toSorted((a, b) => rarityOf(a) - rarityOf(b));
  roots = [...sorted.filter((w) => !isDeadEnd(w)), ...sorted.filter(isDeadEnd)];

  // A root already listed under a weapon above it (a paired-type weapon that
  // this type also upgrades into) has its branch there.
  const placed = new Set<string>();
  const map: MapNode[] = [];
  for (const w of roots) {
    if (!placed.has(weaponKey(w))) map.push(weaponNode(w, weapons, sibling, placed));
  }
  writeMap(path.join(contentDir, "blacksmith", type, "map.json"), map);
}

for (const slot of ARMOR_SLOTS) {
  const armor = readJson<{ armor: (Weapon & { rank: string; sex?: string })[] }>(
    dataDir,
    "armor",
    `${slot}.json`,
  ).armor;
  for (const rank of ARMOR_RANKS) {
    const pieces = armor
      .filter((a) => a.rank === rank)
      .toSorted((a, b) => rarityOf(a) - rarityOf(b));
    // Pieces that exist as separate Male and Female entries get a sex suffix.
    const slugs = armorSlugs(pieces);
    writeMap(
      path.join(contentDir, "armorsmith", slot, rank, "map.json"),
      pieces.map((a, i) => ({ slug: slugs[i], type: a.type, name: a.name, rarity: a.rarity })),
    );
  }
}

const decorations = readData<{ decorations: Weapon[] }>(dataDir, "decorations.json").decorations;
writeMap(
  path.join(contentDir, "decorations", "map.json"),
  decorations.map((d) => ({
    slug: slugify(d.name),
    type: d.type,
    name: d.name,
    rarity: d.rarity,
    ...(d.color && { color: d.color }),
  })),
);
