/**
 * MHF2's names and descriptions, from its own message files
 * (strings/messages.ts), found with `message-probe` on the EU disc
 * (ULES00851): DATA.BIN 3-7 are one 23-table file per language. Its tables
 * come in pairs whose sizes match the equipment tables exactly, one string
 * per entry: blademaster weapons (tables 3/4), gunner weapons (5/6), head
 * (7/8), chest (9/10), arm (11/12), waist (13/14) and leg armor (15/16,
 * 312 strings for 311 entries), and items (1/2, 960 strings: the 713 items
 * with stats, then the decorations, as MHFU's item IDs run on into its
 * decorations). Which table of a pair holds the names is told by length:
 * names are the shorter strings.
 *
 * The language order isn't confirmed; MHFU's EU disc has English first. The
 * English file is picked as the one whose weapon names have the fewest
 * non-ASCII bytes, and the checks say whether that's the first.
 */
import { readMessageFile, type MessageTable } from "../strings/messages.js";

/** DATA.BIN indices of the five message files, in disc order. */
export const MHP2_EU_MESSAGE_FILES = [3, 4, 5, 6, 7] as const;

/** Table pairs (names and descriptions, in either order) per kind of thing. */
export const MHP2_EU_TEXT_TABLES = {
  items: [1, 2],
  blademaster: [3, 4],
  gunner: [5, 6],
  head: [7, 8],
  chest: [9, 10],
  arm: [11, 12],
  waist: [13, 14],
  leg: [15, 16],
} as const;

export type Mhp2TextKind = keyof typeof MHP2_EU_TEXT_TABLES;

export interface Mhp2Text {
  names: string[];
  descriptions: string[];
  /** Which table of the pair held the names. */
  nameTable: number;
}

export interface Mhp2TextResult {
  /** Index into MHP2_EU_MESSAGE_FILES of the file read (the English one). */
  language: number;
  text: Record<Mhp2TextKind, Mhp2Text>;
  checks: { name: string; ok: boolean; detail: string }[];
}

function decode(table: MessageTable): string[] {
  return table.strings.map((s) => s.bytes.toString("utf8"));
}

function meanLength(strings: readonly string[]): number {
  return strings.reduce((n, s) => n + s.length, 0) / Math.max(1, strings.length);
}

function nonAsciiBytes(table: MessageTable): number {
  let n = 0;
  for (const s of table.strings) for (const b of s.bytes) if (b >= 0x80) n++;
  return n;
}

/**
 * Reads the names from the five message files (in disc order). Throws if
 * a file isn't a message file or lacks a name table; everything else is a
 * check, so a surprise shows up in EXTRACTION.json rather than stopping
 * the run.
 */
export function readMhp2Text(
  files: readonly Buffer[],
  entryCounts: Record<Mhp2TextKind, number>,
): Mhp2TextResult {
  const parsed = files.map((buf, i) => {
    const tables = readMessageFile(buf);
    if (!tables) {
      throw new Error(`DATA.BIN ${MHP2_EU_MESSAGE_FILES[i]} isn't a message file.`);
    }
    return tables;
  });
  const [bmA, bmB] = MHP2_EU_TEXT_TABLES.blademaster;
  const asciiScores = parsed.map(
    (tables) => nonAsciiBytes(tables[bmA]!) + nonAsciiBytes(tables[bmB]!),
  );
  const language = asciiScores.indexOf(Math.min(...asciiScores));
  const tables = parsed[language]!;

  const checks: Mhp2TextResult["checks"] = [
    {
      name: "the first message file is the English one",
      ok: language === 0,
      detail: `non-ASCII bytes in weapon text per file: ${asciiScores.join(", ")}; read file ${MHP2_EU_MESSAGE_FILES[language]}`,
    },
  ];
  const text = {} as Record<Mhp2TextKind, Mhp2Text>;
  for (const [kind, [a, b]] of Object.entries(MHP2_EU_TEXT_TABLES) as [
    Mhp2TextKind,
    readonly [number, number],
  ][]) {
    const ta = tables[a];
    const tb = tables[b];
    if (!ta || !tb) throw new Error(`The message file has no table ${a} or ${b} (${kind}).`);
    const sa = decode(ta);
    const sb = decode(tb);
    const namesFirst = meanLength(sa) <= meanLength(sb);
    const names = namesFirst ? sa : sb;
    text[kind] = { names, descriptions: namesFirst ? sb : sa, nameTable: namesFirst ? a : b };
    const empty = names.flatMap((n, i) => (n.length === 0 ? [i] : []));
    const expected = entryCounts[kind];
    const shown = empty.slice(0, 8).map((i) => `#${i}`);
    checks.push({
      name: `${kind} names: one per entry`,
      ok: kind === "items" ? names.length >= expected : names.length === expected,
      detail:
        `${names.length} names (table ${text[kind].nameTable}) for ${expected} entries; ` +
        (empty.length
          ? `${empty.length} empty: ${shown.join(" ")}${empty.length > 8 ? " …" : ""}`
          : "none empty"),
    });
  }
  return { language, text, checks };
}
