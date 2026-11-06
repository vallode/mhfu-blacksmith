/**
 * Generates data/item-ids.json: the material names used in data/ recipes
 * mapped to the game's item IDs (the ones a save file's item box stores), so
 * a recipe can be checked against a hunter's items.
 *
 * Item IDs come from the ItemID table in IncognitoMan/mhp2g-patterns'
 * `items.enum` (MIT, vendored at tools/mhfu-extract/vendor/mhp2g-patterns),
 * which names the materials of the EBOOT's crafting recipes. Each material
 * name is resolved, in order, by an alias in scripts/item-id-aliases.json
 * (which also records the enum name it expects), an exact name match, or a
 * case/space/punctuation-insensitive match.
 *
 * Weapon and decoration recipes must resolve completely, except names listed
 * under "unmapped" with a reason; a recipe using one of those is never
 * reported as craftable. Armor recipes spell many materials differently
 * from the enum (vallode/mhfu-blacksmith#34), so unresolved armor-only names
 * are only reported. Several data/ spellings can share one ID.
 *
 * Rerun after changing recipes: `pnpm generate-item-ids`.
 */
import fs from "fs";
import path from "path";
import { isPlaceholder, loose, readEnumFile } from "./lib/mhp2g-enum";

const root = process.cwd();
const ALIAS_FILE = path.join(root, "scripts/item-id-aliases.json");
const OUT_FILE = path.join(root, "data/item-ids.json");

interface AliasFile {
  aliases: Record<string, { id: number; enum: string }>;
  unmapped: Record<string, string>;
}

type Recipe = { name?: string }[] | null | undefined;

let failures = 0;
function fail(msg: string) {
  console.error(`  ✗ ${msg}`);
  failures++;
}

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf-8")) as T;
}

/** Material names used by a set of recipe fields, across one or more data files. */
function materialNames(files: string[], key: string, fields: string[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    for (const entry of readJson<Record<string, Record<string, unknown>[]>>(file)[key]) {
      for (const field of fields) {
        for (const m of (entry[field] as Recipe) ?? []) if (m.name) names.add(m.name);
      }
    }
  }
  return names;
}

const dir = (sub: string) =>
  fs.readdirSync(path.join(root, "data", sub)).filter((f) => f.endsWith(".json")).map((f) => `data/${sub}/${f}`);

const required = new Set([
  ...materialNames(dir("weapons"), "weapons", ["create_mats", "improve_mats", "alternative_create_mats"]),
  ...materialNames(["data/decorations.json"], "decorations", ["create_mats"]),
]);
const armorOnly = [...materialNames(dir("armor"), "armor", ["create_mats", "alternative_create_mats"])].filter(
  (n) => !required.has(n)
);

const items = readEnumFile("items.enum").get("ItemID");
if (!items) throw new Error("items.enum has no ItemID table");
const byName = new Map<string, number>();
const byLoose = new Map<string, number>();
items.forEach((name, id) => {
  if (isPlaceholder(name)) return;
  if (!byName.has(name)) byName.set(name, id);
  if (!byLoose.has(loose(name))) byLoose.set(loose(name), id);
});

const { aliases, unmapped } = readJson<AliasFile>("scripts/item-id-aliases.json");
for (const [name, alias] of Object.entries(aliases)) {
  if (items[alias.id] !== alias.enum) fail(`alias "${name}": expected ID ${alias.id} to be "${alias.enum}", found "${items[alias.id]}"`);
  if (!required.has(name) && !armorOnly.includes(name)) fail(`alias "${name}" isn't used by any recipe in data/`);
  if (byName.has(name)) fail(`alias "${name}" already matches exactly, drop the alias`);
}
for (const name of Object.keys(unmapped)) {
  if (!required.has(name)) fail(`unmapped "${name}" isn't used by any weapon or decoration recipe`);
  if (aliases[name]) fail(`"${name}" is both aliased and unmapped`);
}

const resolve = (name: string): number | undefined =>
  aliases[name]?.id ?? byName.get(name) ?? byLoose.get(loose(name));

const ids = new Map<string, number>();
for (const name of required) {
  const id = unmapped[name] ? undefined : resolve(name);
  if (id !== undefined) ids.set(name, id);
  else if (unmapped[name] === undefined) fail(`"${name}" (weapon/decoration recipe) has no item ID; add an alias or an "unmapped" reason`);
}
const armorMissing: string[] = [];
for (const name of armorOnly) {
  const id = resolve(name);
  if (id !== undefined) ids.set(name, id);
  else armorMissing.push(name);
}

console.log("Mapping item IDs…");
console.log(`  weapon/decoration materials: ${[...required].filter((n) => ids.has(n)).length}/${required.size} mapped (${Object.keys(unmapped).length} deliberately unmapped)`);
console.log(`  armor-only materials: ${armorOnly.length - armorMissing.length}/${armorOnly.length} mapped`);

if (failures > 0) {
  console.error(`\n✗ ${failures} problem(s); data/item-ids.json was not written`);
  process.exit(1);
}

// Sorted by ID, then name, one per line, so diffs show exactly which names changed.
const sorted = [...ids].sort(([a, x], [b, y]) => x - y || a.localeCompare(b));
const body = sorted.map(([name, id]) => `  ${JSON.stringify(name)}: ${id}`).join(",\n");
fs.writeFileSync(OUT_FILE, `{\n${body}\n}\n`);
console.log(`\n✓ Wrote ${path.relative(root, OUT_FILE)}`);
