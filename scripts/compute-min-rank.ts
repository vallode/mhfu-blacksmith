/**
 * Prototype: derives the earliest quest progress needed for each weapon and
 * armor piece from quest drops and recipes (see src/lib/min-rank.ts), and
 * writes a report. Usage: tsx scripts/compute-min-rank.ts [out.json]
 */
import fs from "fs";
import path from "path";
import { buildItemNameIndex, normalizeItemName, type ItemRecord } from "../src/lib/items";
import {
  earliestSources,
  either,
  GATHERED_TYPES,
  recipeProgress,
  weaponProgress,
  type Progress,
  type MonsterLike,
  type QuestLike,
  type RecipeLike,
  type WeaponLike,
} from "../src/lib/min-rank";

type RecipeHolder = Record<
  "create_mats" | "improve_mats" | "alternative_create_mats",
  RecipeLike[] | undefined
>;

const dataDir = path.join(process.cwd(), "data");
const readJson = <T>(...p: string[]): T =>
  JSON.parse(fs.readFileSync(path.join(dataDir, ...p), "utf-8"));

const { index } = buildItemNameIndex(readJson<{ items: ItemRecord[] }>("items.json").items);
const key = (name: string): string | undefined => {
  const id = index.get(normalizeItemName(name));
  return id === undefined ? undefined : String(id);
};

const quests = fs
  .readdirSync(path.join(dataDir, "quests"))
  .flatMap((f) => readJson<{ quests: QuestLike[] }>("quests", f).quests);
const monsters = fs
  .readdirSync(path.join(dataDir, "monsters"))
  .flatMap((f) => readJson<{ monsters: MonsterLike[] }>("monsters", f).monsters);

// Item keys whose recipes call them a gathered category (ore, insect, ...).
const gathered = new Set<string>();
for (const dir of ["weapons", "armor"])
  for (const file of fs.readdirSync(path.join(dataDir, dir)))
    for (const piece of Object.values(readJson<Record<string, RecipeHolder[]>>(dir, file))[0])
      for (const m of [
        ...(piece.create_mats ?? []),
        ...(piece.improve_mats ?? []),
        ...(piece.alternative_create_mats ?? []),
      ]) {
        const k = key(m.name);
        if (k !== undefined && m.type && GATHERED_TYPES.has(m.type)) gathered.add(k);
      }
const sources = earliestSources(quests, monsters, key, gathered);

const unsourced = new Set<string>();
const unresolved = new Set<string>();

const allWeapons = fs.readdirSync(path.join(dataDir, "weapons")).flatMap((file) => {
  const type = file.replace(/\.json$/, "");
  return readJson<{ weapons: WeaponLike[] }>("weapons", file).weapons.map((w) => ({ ...w, type }));
});
const weapons: Record<string, Record<string, Progress>> = {};
for (const [id, p] of weaponProgress(allWeapons, sources, key, unsourced)) {
  const [type, ...rest] = id.split("/");
  (weapons[type] ??= {})[rest.join("/")] = p;
}

const armor: Record<string, Record<string, Progress>> = {};
for (const file of fs.readdirSync(path.join(dataDir, "armor"))) {
  const slot = file.replace(/\.json$/, "");
  const list = readJson<{ armor: (WeaponLike & { hr?: string | number })[] }>("armor", file).armor;
  armor[slot] = {};
  for (const p of list) {
    const mats = [...(p.create_mats ?? [])];
    const prog = recipeProgress(mats, sources, key, unsourced);
    armor[slot][p.name] = p.alternative_create_mats?.length
      ? either(prog, recipeProgress(p.alternative_create_mats, sources, key, unsourced))
      : prog;
  }
}
for (const n of unsourced) if (key(n) === undefined) unresolved.add(n);

const summarize = (group: Record<string, Record<string, Progress>>) => {
  const counts: Record<string, number> = {};
  for (const items of Object.values(group))
    for (const p of Object.values(items)) {
      const r = p?.rank ?? "unreachable";
      counts[r] = (counts[r] ?? 0) + 1;
    }
  return counts;
};

console.log("sources:", sources.size, "items with a quest drop");
console.log("weapons by minRank:", summarize(weapons));
console.log("armor by minRank:", summarize(armor));
console.log(
  "materials with no quest source:",
  unsourced.size,
  "(of which name doesn't resolve:",
  unresolved.size + ")",
);

const out = process.argv[2];
if (out) {
  fs.writeFileSync(
    out,
    JSON.stringify(
      { weapons, armor, unsourced: [...unsourced].sort(), unresolved: [...unresolved].sort() },
      null,
      1,
    ),
  );
  console.log("wrote", out);
}
