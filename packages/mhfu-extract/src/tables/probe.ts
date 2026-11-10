/**
 * Finds where another game's EBOOT keeps the tables MHFU's does, by
 * searching it for MHFU's own entries. The first step towards a
 * `GameProfile` for MHF2 (MHFU's base game, so many weapons, armor and
 * items should carry over byte for byte) and, less likely, MHF1.
 *
 * Each entry of each reference table is searched for whole; tables with
 * entries shorter than `MIN_NEEDLE` bytes are searched a run of entries at
 * a time. An entry found exactly once implies a table base (where it was
 * found, less its index times the entry size). Inserted or removed entries
 * split a table into runs with different implied bases, so the report
 * lists the most common bases, not just one.
 *
 * Only offsets and counts come out: no game data.
 */

/** One table to look for: where it is in the reference buffer, and its shape. */
export interface ProbeTable {
  name: string;
  /** File offset in the reference buffer. */
  offset: number;
  entrySize: number;
  count: number;
}

export interface ProbeBase {
  /** Implied file offset of the table's first entry in the target. */
  offset: number;
  /** Reference entries found exactly once and agreeing on this base. */
  entries: number;
  /** Lowest and highest such entry index. */
  firstIndex: number;
  lastIndex: number;
}

export interface ProbeResult {
  table: string;
  entrySize: number;
  count: number;
  /** Bytes per needle (a run of entries when entries are short). */
  needleSize: number;
  /** Needles searched: entries that aren't a single repeated byte. */
  searched: number;
  /** Found exactly once in the target. */
  unique: number;
  /** Found more than once (ambiguous, not counted towards a base). */
  ambiguous: number;
  /** Bases with the most support, best first (at most `maxBases`). */
  bases: ProbeBase[];
}

/** Needles shorter than this match by chance too often to mean anything. */
export const MIN_NEEDLE = 16;

/** Up to `limit` occurrences of `needle` in `haystack` (stops counting after that). */
function occurrences(haystack: Buffer, needle: Buffer, limit: number): number[] {
  const found: number[] = [];
  let from = 0;
  while (found.length < limit) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    found.push(at);
    from = at + 1;
  }
  return found;
}

function isLowInformation(needle: Buffer): boolean {
  return needle.every((b) => b === needle[0]);
}

export function probeTable(
  reference: Buffer,
  table: ProbeTable,
  target: Buffer,
  maxBases = 5,
): ProbeResult {
  const run = Math.max(1, Math.ceil(MIN_NEEDLE / table.entrySize));
  const needleSize = run * table.entrySize;
  const bases = new Map<number, ProbeBase>();
  let searched = 0;
  let unique = 0;
  let ambiguous = 0;
  for (let i = 0; i + run <= table.count; i++) {
    const start = table.offset + i * table.entrySize;
    if (start + needleSize > reference.length) break;
    const needle = reference.subarray(start, start + needleSize);
    if (isLowInformation(needle)) continue;
    searched++;
    const hits = occurrences(target, needle, 2);
    if (hits.length === 0) continue;
    if (hits.length > 1) {
      ambiguous++;
      continue;
    }
    unique++;
    const base = hits[0]! - i * table.entrySize;
    const entry = bases.get(base);
    if (entry) {
      entry.entries++;
      entry.lastIndex = i;
    } else {
      bases.set(base, { offset: base, entries: 1, firstIndex: i, lastIndex: i });
    }
  }
  return {
    table: table.name,
    entrySize: table.entrySize,
    count: table.count,
    needleSize,
    searched,
    unique,
    ambiguous,
    bases: [...bases.values()].sort((a, b) => b.entries - a.entries).slice(0, maxBases),
  };
}
