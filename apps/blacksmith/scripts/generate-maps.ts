/**
 * Writes the crafting trees (content/**\/map.json) from data/.
 *
 * Weapons: one tree per type, following improve_to. Armor: a flat list per
 * slot and rank. Decorations: grouped by category.
 */
import fs from "fs";
import path from "path";
import { slugify, armorSlugs } from "../src/lib/slug";
import { DATA_DIR } from "../src/lib/paths";

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

/**
 * `path` holds the names above this weapon: some upgrades run both ways (Azure
 * Ogre Sword <-> Ultimus Heaven&Earth), so a child already on the path is
 * skipped rather than followed forever.
 */
function weaponNode(
  weapon: Weapon,
  own: Weapon[],
  sibling: Weapon[],
  path: readonly string[] = [],
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

  if (weapon.improve_to) {
    node.children = [];
    const here = [...path, weapon.name];
    for (const childName of weapon.improve_to) {
      if (here.includes(childName)) continue;
      const child =
        own.find((w) => w.name === childName) ??
        sibling.find((w) => w.name === childName && w.type !== weapon.type);
      if (child) node.children.push(weaponNode(child, own, sibling, here));
    }
  }
  return node;
}

for (const [type, siblingType] of WEAPON_PAIRS) {
  const weapons = readJson<{ weapons: Weapon[] }>(dataDir, "weapons", `${type}.json`).weapons;
  const sibling = siblingType
    ? readJson<{ weapons: Weapon[] }>(dataDir, "weapons", `${siblingType}.json`).weapons
    : [];

  let roots = weapons.filter((w) => !w.improve_from);
  // Sibling-type weapons that upgrade into this type start trees here too.
  roots = roots.concat(
    sibling.filter((w) => w.improve_to?.some((child) => weapons.some((o) => o.name === child))),
  );

  const isDeadEnd = (w: Weapon) => !w.improve_from && !w.improve_to;
  const sorted = roots.toSorted((a, b) => rarityOf(a) - rarityOf(b));
  roots = [...sorted.filter((w) => !isDeadEnd(w)), ...sorted.filter(isDeadEnd)];

  writeMap(
    path.join(contentDir, "blacksmith", type, "map.json"),
    roots.map((w) => weaponNode(w, weapons, sibling)),
  );
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

const decorations = readJson<{
  decorations: (Weapon & { category?: string })[];
}>(dataDir, "decorations.json").decorations;
const categories = new Map<string, MapNode[]>();
for (const d of decorations) {
  if (!d.category) continue;
  const list = categories.get(d.category) ?? [];
  list.push({
    slug: slugify(d.name),
    type: d.type,
    name: d.name,
    rarity: d.rarity,
    ...(d.color && { color: d.color }),
  });
  categories.set(d.category, list);
}
writeMap(
  path.join(contentDir, "decorations", "map.json"),
  [...categories].map(([name, children]) => ({
    slug: slugify(name),
    type: "",
    name,
    rarity: null,
    children,
  })),
);
