/**
 * Per-language string tables: `data/strings/<lang>.json`.
 *
 * Records in `data/` hold no display text. Each name lives here, keyed by
 * the kind of thing it names and that thing's game ID:
 *
 * ```json
 * { "item": { "1": "Book of Combos 1" }, "melee": { "0": "Buster Sword" }, … }
 * ```
 *
 * English (`en`) is complete. Another language lists what it has and falls
 * back to English for the rest (`StringTable.name`).
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Every kind of string, with what its keys are. */
export const STRING_KINDS = {
  /** Items: the item ID (the u16 in a save's item box). */
  item: "item ID",
  /** Decorations whose name isn't their item's name: the item ID. Falls back to `item`. */
  decoration: "item ID",
  /** Blademaster weapons: index into the game's melee weapon table. */
  melee: "melee weapon ID",
  /** Gunner weapons (bows and bowguns): index into the game's ranged weapon table. */
  ranged: "ranged weapon ID",
  /** Armor, one table per slot: the slot's armor ID. */
  helmet: "helmet ID",
  plate: "plate ID",
  gauntlets: "gauntlets ID",
  waist: "waist ID",
  leggings: "leggings ID",
  /** Skill trees: the game's skill ID (`SkillID`). */
  skill: "skill ID",
  /** A skill tree's skills: `<skill ID>:<points>`, e.g. `"1:20"`. */
  skill_activation: "skill ID:points",
  /** Monsters: the game's monster ID (`emID`). */
  monster: "emID",
  /** The site's own description of a monster (hand-written). */
  monster_description: "emID",
  /** Maps: the quest header's map ID. */
  map: "map ID",
  /** Quest text, from the disc: the quest ID. */
  quest: "quest ID",
  quest_goal: "quest ID",
  quest_details: "quest ID",
  quest_fail: "quest ID",
  quest_client: "quest ID",
} as const;

export type StringKind = keyof typeof STRING_KINDS;
export const KINDS = Object.keys(STRING_KINDS) as StringKind[];

/** Kinds whose entries can have aliases: other spellings of the same thing. */
export const ALIAS_KINDS = ["item", "skill", "monster"] as const satisfies readonly StringKind[];
export type AliasKind = (typeof ALIAS_KINDS)[number];

/** The content of one `data/strings/<lang>.json`. */
export type StringsDoc = { $comment?: string | string[] } & {
  [K in StringKind]?: Record<string, string>;
} & {
  /**
   * Other spellings, in the order records refer to them (a record's
   * `alias: n` means the n-th one). English keeps the site's legacy
   * spellings here; they're also matched by search.
   */
  aliases?: { [K in AliasKind]?: Record<string, string[]> };
};

/** The languages the site has strings for. English must be complete. */
export const DEFAULT_LANG = "en";

/** Where a language's strings live. The one place the path is spelled out. */
export function stringsPath(dataDir: string, lang: string = DEFAULT_LANG): string {
  return path.join(dataDir, "strings", `${lang}.json`);
}

const fileCache = new Map<string, { mtimeMs: number; size: number; doc: StringsDoc }>();

/** Reads a language's strings, or `{}` if it has none. Re-read when the file changes. */
export function readStringsDoc(dataDir: string, lang: string = DEFAULT_LANG): StringsDoc {
  const file = stringsPath(dataDir, lang);
  let stat;
  try {
    stat = statSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const hit = fileCache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.doc;
  const doc = JSON.parse(readFileSync(file, "utf-8")) as StringsDoc;
  fileCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, doc });
  return doc;
}

/** Forgets cached string files (after writing one). */
export function clearStringsCache(): void {
  fileCache.clear();
}

/** Name lookups for one language, falling back to English. */
export class StringTable {
  constructor(
    readonly doc: StringsDoc,
    /** English, for anything `doc` doesn't have. Omit when `doc` is English. */
    readonly fallback?: StringsDoc,
  ) {}

  static read(dataDir: string, lang: string = DEFAULT_LANG): StringTable {
    const en = readStringsDoc(dataDir, DEFAULT_LANG);
    return lang === DEFAULT_LANG
      ? new StringTable(en)
      : new StringTable(readStringsDoc(dataDir, lang), en);
  }

  /** The name of `kind` `key`, or undefined if no language has one. */
  find(kind: StringKind, key: number | string): string | undefined {
    return this.doc[kind]?.[String(key)] ?? this.fallback?.[kind]?.[String(key)];
  }

  /** The name of `kind` `key`; throws if there is none. */
  name(kind: StringKind, key: number | string): string {
    const name = this.find(kind, key);
    if (name === undefined) throw new Error(`strings: no ${kind} name for ${key}`);
    return name;
  }

  aliases(kind: AliasKind, key: number | string): string[] | undefined {
    return this.doc.aliases?.[kind]?.[String(key)] ?? this.fallback?.aliases?.[kind]?.[String(key)];
  }

  /** The name, or with `alias` set, that alias of it (a record's own spelling). */
  spelling(kind: AliasKind, key: number | string, alias: number | undefined): string {
    if (alias === undefined) return this.name(kind, key);
    const name = this.aliases(kind, key)?.[alias];
    if (name === undefined) throw new Error(`strings: ${kind} ${key} has no alias ${alias}`);
    return name;
  }
}

/** Numeric order for keys like `"12"` and `"3:-10"`. */
export function compareKeys(a: string, b: string): number {
  const pa = a.split(":").map(Number);
  const pb = b.split(":").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -Infinity) - (pb[i] ?? -Infinity);
    if (d !== 0 && !Number.isNaN(d)) return d;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

const sortedEntries = <T>(o: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => compareKeys(a, b)));

/** A strings file's text: kinds in `STRING_KINDS` order, keys in numeric order. */
export function serializeStrings(doc: StringsDoc): string {
  const out: Record<string, unknown> = {};
  if (doc.$comment !== undefined) out.$comment = doc.$comment;
  for (const kind of KINDS) {
    const table = doc[kind];
    if (table && Object.keys(table).length > 0) out[kind] = sortedEntries(table);
  }
  const aliases: Record<string, unknown> = {};
  for (const kind of ALIAS_KINDS) {
    const table = doc.aliases?.[kind];
    if (table && Object.keys(table).length > 0) aliases[kind] = sortedEntries(table);
  }
  if (Object.keys(aliases).length > 0) out.aliases = aliases;
  return `${JSON.stringify(out, null, 2)}\n`;
}
