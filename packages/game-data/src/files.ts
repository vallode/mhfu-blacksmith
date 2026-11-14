/**
 * The one way into `data/`. Every reader of the game data (the site, its
 * scripts and tests, mhfu-extract) loads a file with `readData`, and
 * mhfu-extract's build-data writes one with `writeData`.
 *
 * `readData` returns the named view (model.ts): records as they were before
 * names moved into `data/strings/`, with English names where the files now
 * hold IDs. `readRawData` returns a file as it is on disk.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ARMOR_SLOTS,
  dehydrate,
  equipmentIds,
  fileKind,
  hydrate,
  mergeStrings,
  stringResolver,
  type Doc,
} from "./model.js";
import {
  clearStringsCache,
  DEFAULT_LANG,
  readStringsDoc,
  serializeStrings,
  stringsPath,
  StringTable,
  type StringsDoc,
} from "./strings.js";

/** A data file's content. */
export type DataDoc = Doc;

const relPath = (rel: string[]) =>
  path
    .join(...rel)
    .split(path.sep)
    .join("/");

/** A data file as it is on disk. */
export function readRawData<T = DataDoc>(dataDir: string, ...rel: string[]): T {
  return JSON.parse(readFileSync(path.join(dataDir, ...rel), "utf-8")) as T;
}

/** English strings, and Japanese for items' `name_jp` (no fallback: an item without one has none). */
function hydrateStrings(dataDir: string) {
  return {
    en: new StringTable(readStringsDoc(dataDir, DEFAULT_LANG)),
    ja: new StringTable(readStringsDoc(dataDir, "ja")),
  };
}

/** The weapon type of each `weapons/*.json` file. */
function weaponTypes(dataDir: string): string[] {
  const dir = path.join(dataDir, "weapons");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => f.slice(0, -".json".length));
}

/**
 * Reads a data file's named view, given `dataDir` and its path inside it,
 * whole (`"weapons/bow.json"`) or in segments as for `path.join`
 * (`"weapons", "bow.json"`). `"equipment-ids.json"` isn't a file: it's
 * built from the weapon and armor records (`equipmentIds`).
 */
export function readData<T = DataDoc>(dataDir: string, ...rel: string[]): T {
  const p = relPath(rel);
  const kind = fileKind(p);
  if (!kind) return readRawData<T>(dataDir, p);
  const strings = hydrateStrings(dataDir);
  if (kind.kind === "equipment-ids") {
    const weapons = weaponTypes(dataDir).map((type) => ({
      type,
      raw: readRawData(dataDir, "weapons", `${type}.json`),
    }));
    const armor = ARMOR_SLOTS.filter((slot) =>
      existsSync(path.join(dataDir, "armor", `${slot}.json`)),
    ).map((slot) => ({ slot, raw: readRawData(dataDir, "armor", `${slot}.json`) }));
    return equipmentIds(weapons, armor, strings.en) as T;
  }
  return hydrate(kind, readRawData(dataDir, p), strings) as T;
}

/** A data file's text: two-space JSON and a final newline. */
export function serializeData(doc: DataDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export interface WriteOptions {
  /** Work out what would change, but write nothing. */
  dryRun?: boolean;
}

function readTextOrNull(file: string): string | null {
  try {
    return readFileSync(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function writeIfChanged(file: string, text: string, dryRun: boolean | undefined): boolean {
  if (readTextOrNull(file) === text) return false;
  if (!dryRun) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text, "utf-8");
  }
  return true;
}

/**
 * Writes a data file from its named view: the records with IDs where the
 * view has names, and their names into `data/strings/` (English, and
 * Japanese for items' `name_jp`). References must name things the string
 * tables already have; a file's own records keep the IDs they have.
 * Returns the paths (relative to `dataDir`) whose content changed; with
 * unchanged input, none, so a rebuild is a no-op.
 */
export function writeData(
  dataDir: string,
  rel: string,
  named: DataDoc,
  options: WriteOptions = {},
): string[] {
  const kind = fileKind(rel);
  const file = path.join(dataDir, rel);
  if (!kind) {
    return writeIfChanged(file, serializeData(named), options.dryRun) ? [relPath([rel])] : [];
  }
  const en = readStringsDoc(dataDir, DEFAULT_LANG);
  const current = existsSync(file) ? readRawData(dataDir, rel) : undefined;
  const { raw, strings } = dehydrate(kind, named, stringResolver(new StringTable(en), current));

  const changed: string[] = [];
  if (writeIfChanged(file, serializeData(raw), options.dryRun)) changed.push(relPath([rel]));
  for (const [lang, add] of [
    [DEFAULT_LANG, strings.en],
    ["ja", strings.ja],
  ] as [string, StringsDoc][]) {
    if (Object.keys(add).length === 0) continue;
    const doc = structuredClone(readStringsDoc(dataDir, lang));
    mergeStrings(doc, add);
    const target = stringsPath(dataDir, lang);
    if (writeIfChanged(target, serializeStrings(doc), options.dryRun))
      changed.push(path.relative(dataDir, target).split(path.sep).join("/"));
  }
  if (!options.dryRun) clearStringsCache();
  return changed;
}
