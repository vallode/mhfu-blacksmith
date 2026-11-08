/**
 * Loads the game data and answers "what is the earliest quest progress at which
 * this weapon / armor piece can be made?" (see src/lib/min-rank.ts for the
 * rules). Shared by scripts/generate-data.ts and scripts/compute-min-rank.ts.
 */
import fs from "fs";
import path from "path";
import { buildItemNameIndex, normalizeItemName, type ItemRecord } from "../../src/lib/items";
import {
  earliestSources,
  either,
  GATHER_TIERS,
  GATHERED_TYPES,
  recipeProgress,
  weaponKey,
  weaponProgress,
  type MonsterLike,
  type Progress,
  type QuestLike,
  type RecipeLike,
  type WeaponLike,
} from "../../src/lib/min-rank";

export type Recipes = Partial<
  Record<"create_mats" | "improve_mats" | "alternative_create_mats", RecipeLike[] | null>
>;

export interface MinRanks {
  /** Progress for a weapon by type (file name in data/weapons) and name. */
  weapon(type: string, name: string): Progress;
  /** Progress for an armor piece, from its create recipes. */
  armor(piece: Recipes): Progress;
  /** Progress for a decoration, from its create recipes. */
  decoration(deco: Recipes): Progress;
  /** Materials no quest, monster or ore tier covers; they gate nothing. */
  unsourced: ReadonlySet<string>;
  /** Number of items with a known source. */
  sourceCount: number;
}

export function loadMinRanks(dataDir: string): MinRanks {
  const readJson = <T>(...p: string[]): T =>
    JSON.parse(fs.readFileSync(path.join(dataDir, ...p), "utf-8"));
  const list = (dir: string) => fs.readdirSync(path.join(dataDir, dir));

  const { index } = buildItemNameIndex(readJson<{ items: ItemRecord[] }>("items.json").items);
  const key = (name: string): string | undefined => {
    const id = index.get(normalizeItemName(name));
    return id === undefined ? undefined : String(id);
  };

  const quests = list("quests").flatMap(
    (f) => readJson<{ quests: QuestLike[] }>("quests", f).quests,
  );
  const monsters = list("monsters").flatMap(
    (f) => readJson<{ monsters: MonsterLike[] }>("monsters", f).monsters,
  );
  const weaponFiles = list("weapons").map((file) => ({
    type: file.replace(/\.json$/, ""),
    weapons: readJson<{ weapons: (WeaponLike & Recipes)[] }>("weapons", file).weapons,
  }));
  const armorPieces = list("armor").flatMap(
    (file) => readJson<{ armor: Recipes[] }>("armor", file).armor,
  );
  const decorations = readJson<{ decorations: Recipes[] }>("decorations.json").decorations;

  // Items gathered in the field, from the category their recipes give them.
  // Decorations count too: some materials (Power Seed) only appear in theirs.
  const gathered = new Set<string>();
  const recipes = [...weaponFiles.flatMap((f) => f.weapons), ...armorPieces, ...decorations];
  for (const piece of recipes)
    for (const m of [
      ...(piece.create_mats ?? []),
      ...(piece.improve_mats ?? []),
      ...(piece.alternative_create_mats ?? []),
    ]) {
      const k = key(m.name);
      if (k !== undefined && m.type && GATHERED_TYPES.has(m.type)) gathered.add(k);
    }
  for (const name of Object.keys(GATHER_TIERS)) {
    const k = key(name);
    if (k === undefined) throw new Error(`GATHER_TIERS: "${name}" is not in data/items.json`);
    gathered.add(k);
  }

  const sources = earliestSources(quests, monsters, key, gathered);
  const unsourced = new Set<string>();
  const weapons = weaponProgress(
    weaponFiles.flatMap((f) => f.weapons.map((w) => ({ ...w, type: f.type }))),
    sources,
    key,
    unsourced,
  );

  // Armor and decorations: the earlier of their create recipes.
  const created = (item: Recipes): Progress => {
    const main = recipeProgress(item.create_mats, sources, key, unsourced);
    return item.alternative_create_mats?.length
      ? either(main, recipeProgress(item.alternative_create_mats, sources, key, unsourced))
      : main;
  };

  return {
    weapon: (type, name) => weapons.get(weaponKey(type, name)) ?? null,
    armor: created,
    decoration: created,
    unsourced,
    sourceCount: sources.size,
  };
}
