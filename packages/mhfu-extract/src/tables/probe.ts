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

/**
 * For a table found at `base` in the target: per byte of an entry, the
 * share (0-1) of entries `from`..`to` whose byte there equals the
 * reference's. Bytes well below 1 are fields the target game changed.
 */
export function byteAgreement(
  reference: Buffer,
  table: ProbeTable,
  target: Buffer,
  base: number,
  from: number,
  to: number,
): number[] {
  const same = new Array<number>(table.entrySize).fill(0);
  let entries = 0;
  for (let i = from; i <= to; i++) {
    const ref = table.offset + i * table.entrySize;
    const tgt = base + i * table.entrySize;
    if (tgt < 0 || tgt + table.entrySize > target.length) continue;
    if (ref + table.entrySize > reference.length) break;
    entries++;
    for (let b = 0; b < table.entrySize; b++) {
      if (reference[ref + b] === target[tgt + b]) same[b]!++;
    }
  }
  return same.map((n) => (entries === 0 ? 0 : n / entries));
}

/**
 * Every `window`-byte run in a buffer, at every `step`-aligned offset, so
 * a run can be looked up without scanning: its offset if it occurs once,
 * -1 if more than once.
 */
export class WindowIndex {
  private readonly map = new Map<string, number>();

  constructor(
    buf: Buffer,
    readonly window: number,
    step = 2,
  ) {
    for (let at = 0; at + window <= buf.length; at += step) {
      const key = buf.toString("latin1", at, at + window);
      this.map.set(key, this.map.has(key) ? -1 : at);
    }
  }

  /** The run's only offset, -1 if it occurs more than once, undefined if never. */
  lookup(needle: Buffer): number | undefined {
    return this.map.get(needle.toString("latin1"));
  }
}

export interface WindowField {
  /** Offset of the run within a reference entry. */
  refOffset: number;
  /** Reference entries whose run here was found exactly once. */
  unique: number;
  /** Of those, how many agree on `targetBase` at the dominant stride. */
  agreeing: number;
  /**
   * Where those hits put entry 0's copy of this field: the target table's
   * base plus the field's offset in a target entry. Differences between
   * fields give the target layout.
   */
  targetBase: number | null;
  firstIndex: number;
  lastIndex: number;
}

export interface WindowProbe {
  window: number;
  /** The spacing most consecutive hits agree on: the target's entry size. */
  stride: number | null;
  strides: { stride: number; pairs: number }[];
  /** Runs that agree on a base at that stride, by reference offset. */
  fields: WindowField[];
}

/**
 * Looks for parts of each entry rather than whole entries, for a table
 * whose entries changed size or layout in the target game: every
 * 2-aligned `index.window`-byte run of every entry is looked up, and runs
 * found once vote for the spacing between consecutive entries (the target
 * entry size) and, at that spacing, for where each field sits. Returns
 * null for entries shorter than the window.
 */
export function probeWindows(
  reference: Buffer,
  table: ProbeTable,
  index: WindowIndex,
  minAgreeing = 3,
): WindowProbe | null {
  const window = index.window;
  if (table.entrySize < window) return null;
  const hitsByOffset = new Map<number, { i: number; at: number }[]>();
  const strideVotes = new Map<number, number>();
  for (let w = 0; w + window <= table.entrySize; w += 2) {
    const hits: { i: number; at: number }[] = [];
    for (let i = 0; i < table.count; i++) {
      const start = table.offset + i * table.entrySize + w;
      if (start + window > reference.length) break;
      const needle = reference.subarray(start, start + window);
      if (isLowInformation(needle)) continue;
      const at = index.lookup(needle);
      if (at !== undefined && at !== -1) hits.push({ i, at });
    }
    hitsByOffset.set(w, hits);
    for (let k = 1; k < hits.length; k++) {
      const gap = hits[k]!.i - hits[k - 1]!.i;
      const distance = hits[k]!.at - hits[k - 1]!.at;
      if (gap > 4 || distance <= 0 || distance % gap !== 0) continue;
      const stride = distance / gap;
      if (stride > 512) continue;
      strideVotes.set(stride, (strideVotes.get(stride) ?? 0) + 1);
    }
  }
  const strides = [...strideVotes.entries()]
    .map(([stride, pairs]) => ({ stride, pairs }))
    .sort((a, b) => b.pairs - a.pairs)
    .slice(0, 5);
  const stride = strides[0]?.stride ?? null;
  const fields: WindowField[] = [];
  if (stride !== null) {
    for (const [refOffset, hits] of hitsByOffset) {
      const votes = new Map<number, { n: number; first: number; last: number }>();
      for (const { i, at } of hits) {
        const base = at - i * stride;
        const v = votes.get(base);
        if (v) {
          v.n++;
          v.last = i;
        } else {
          votes.set(base, { n: 1, first: i, last: i });
        }
      }
      let best: [number, { n: number; first: number; last: number }] | undefined;
      for (const entry of votes) if (!best || entry[1].n > best[1].n) best = entry;
      if (!best || best[1].n < minAgreeing) continue;
      fields.push({
        refOffset,
        unique: hits.length,
        agreeing: best[1].n,
        targetBase: best[0],
        firstIndex: best[1].first,
        lastIndex: best[1].last,
      });
    }
  }
  return { window, stride, strides, fields };
}
