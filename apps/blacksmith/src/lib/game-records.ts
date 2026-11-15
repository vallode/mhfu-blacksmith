/**
 * A copy of the site's game data, read by ID: the records as `data/<game>/`
 * stores them (game-data's `readRawData`, game IDs and references by ID),
 * named through a language's string table (`StringTable`), not through
 * game-data's English-only `readData`.
 *
 * - `named(file)` is the file with the copy's language's names (and English
 *   where the language has none): what pages and bundles show.
 * - `english(file)` is the same records named in English. Slugs come from it
 *   in every language, so a page's URL is the same whatever its language;
 *   so do keys that tools outside the site share (minimum ranks, monster
 *   hitboxes).
 *
 * Records keep their order in both, so a record's English twin is at the
 * same index. In English they're named through the same table.
 *
 * A language switch (step 3) is only another string table here: nothing
 * else reads names.
 *
 * Server-only (fs): pages' static params and metadata, and the build scripts.
 */
import fs from "fs";
import path from "path";
import {
  ARMOR_SLOTS,
  DEFAULT_LANG,
  equipmentIds,
  fileKind,
  gameDataDir,
  hydrate,
  readRawData,
  StringTable,
  type DataDoc,
} from "game-data";
import { DATA_DIR } from "./paths";
import { DEFAULT_SITE, type Site } from "./site";

export interface GameRecords {
  site: Site;
  /** Names in the copy's language, falling back to English. */
  strings: StringTable;
  /** English names. */
  englishStrings: StringTable;
  /** A data file as stored: records with IDs. */
  raw<T = DataDoc>(file: string): T;
  /** A data file's records, named in the copy's language. */
  named<T = DataDoc>(file: string): T;
  /** A data file's records, named in English: for slugs. */
  english<T = DataDoc>(file: string): T;
  /** The data files in a directory of the game's data (`"weapons"`), sorted. */
  list(dir: string): string[];
  /** Whether the game has a data file. */
  has(file: string): boolean;
}

const copies = new Map<string, GameRecords>();

/** The game data of a copy of the site; the default copy (English, MHFU) when left out. */
export function gameRecords(site: Site = DEFAULT_SITE): GameRecords {
  const key = `${site.lang}/${site.game}`;
  let records = copies.get(key);
  if (!records) copies.set(key, (records = load(site)));
  return records;
}

function load(site: Site): GameRecords {
  const gameDir = gameDataDir(DATA_DIR, site.game);
  const englishStrings = StringTable.read(DATA_DIR, site.game, DEFAULT_LANG);
  const strings =
    site.lang === DEFAULT_LANG ? englishStrings : StringTable.read(DATA_DIR, site.game, site.lang);
  // Items' Japanese names (`name_jp`), whatever the copy's language.
  const ja = new StringTable(StringTable.read(DATA_DIR, site.game, "ja").doc);

  // Every read is a fresh document, as readData's are: callers may change them.
  const raw = <T>(file: string): T => readRawData<T>(DATA_DIR, site.game, file);
  const list = (dir: string) =>
    fs
      .readdirSync(path.join(gameDir, dir))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => `${dir}/${f}`);
  const has = (file: string) => fs.existsSync(path.join(gameDir, file));

  /** The records named through a table; `equipment-ids.json` is built from the weapon and armor records. */
  const name = (table: StringTable, file: string): DataDoc => {
    const kind = fileKind(file);
    if (!kind) return raw(file);
    if (kind.kind === "equipment-ids") {
      const weapons = list("weapons").map((f) => ({
        type: path.basename(f, ".json"),
        raw: raw(f),
      }));
      const armor = ARMOR_SLOTS.filter((slot) => has(`armor/${slot}.json`)).map((slot) => ({
        slot,
        raw: raw(`armor/${slot}.json`),
      }));
      return equipmentIds(weapons, armor, table) as DataDoc;
    }
    return hydrate(kind, raw(file), { en: table, ja });
  };
  const english = <T>(file: string): T => name(englishStrings, file) as T;
  const named = <T>(file: string): T => name(strings, file) as T;
  return { site, strings, englishStrings, raw, named, english, list, has };
}
