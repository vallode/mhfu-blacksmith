/**
 * Names for what the game reports by ID, from data/ through game-data:
 * quests from `readData`'s named view (which keeps quest IDs), the weapon
 * records' classes and rarities from `readRawData` (the named view drops
 * their IDs), and every other name from the string tables
 * (data/strings/<lang>.json).
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "blacksmith/src/lib/slug";
import { RANGED_TYPES, StringTable, readData, readRawData } from "game-data";

/** The repository's data/ directory. */
export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data");

export interface QuestName {
  title: string;
  /** data/'s board: village, guild, event, challenge, training-school, treasure-hunting. */
  hub: string;
  rank: string | null;
}

export interface WeaponName {
  name: string;
  /** The weapon class, as data/ and the site's images name it: `great-sword`, `bow`, … */
  type: string;
  rarity: number | null;
}

export interface MonsterName {
  name: string;
  /** The monster page's slug, which names its picture. */
  slug: string;
}

export interface Names {
  quest(id: number): QuestName | undefined;
  monster(id: number): MonsterName | undefined;
  /** By equipment table (5 melee, 6 ranged) and ID. */
  weapon(table: number, id: number): WeaponName | undefined;
  map(id: number): string | undefined;
}

interface NamedRecord {
  id: number;
  name?: string;
  title?: string;
  type?: string;
  rarity?: number;
  hub?: string;
  rank?: string | null;
}

const files = (dataDir: string, dir: string) =>
  readdirSync(path.join(dataDir, dir)).filter((f) => f.endsWith(".json"));

export function loadNames(dataDir = DATA_DIR, lang = "en"): Names {
  const quests = new Map<number, QuestName>();
  for (const file of files(dataDir, "quests")) {
    for (const q of readData<{ quests: NamedRecord[] }>(dataDir, "quests", file).quests) {
      if (q.title) quests.set(q.id, { title: q.title, hub: q.hub ?? "", rank: q.rank ?? null });
    }
  }
  const types = new Map<string, { type: string; rarity: number | null }>();
  for (const file of files(dataDir, "weapons")) {
    for (const w of readRawData<{ weapons: NamedRecord[] }>(dataDir, "weapons", file).weapons) {
      if (!w.type) continue;
      const table = (RANGED_TYPES as readonly string[]).includes(w.type) ? "ranged" : "melee";
      types.set(`${table}:${w.id}`, { type: w.type, rarity: w.rarity ?? null });
    }
  }
  const strings = StringTable.read(dataDir, lang);
  const weapon = (table: "melee" | "ranged", id: number): WeaponName | undefined => {
    const name = strings.find(table, id);
    const record = types.get(`${table}:${id}`);
    return name && record ? { name, ...record } : undefined;
  };
  return {
    quest: (id) => quests.get(id),
    monster: (id) => {
      // English names make the slugs, whatever language the names are in.
      const english = strings.fallback?.monster?.[String(id)] ?? strings.doc.monster?.[String(id)];
      const name = strings.find("monster", id);
      return name && english ? { name, slug: slugify(english) } : undefined;
    },
    weapon: (table, id) =>
      table === 5 ? weapon("melee", id) : table === 6 ? weapon("ranged", id) : undefined,
    map: (id) => strings.find("map", id),
  };
}
