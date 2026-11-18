/**
 * `quest-flags`: searches the EBOOT and overlays for the table the game uses
 * to turn a quest ID into its "cleared" bit in the save (see
 * `tables/quest-flags.ts` for the table found on the EU disc). Numbers only;
 * the format of the table is unknown, so two kinds of search run:
 *
 * - **Quest ID lists** (`findQuestIdLists`): arrays of u16/u32 quest IDs,
 *   possibly with 0 / all-ones entries for unused slots, possibly one field of
 *   a larger record. If the flags are "the quest's position in a list", the
 *   list is one of these. Each hit is checked against the anchor bits.
 * - **Ordered values** (`findSequenceTables`): strided runs of known numbers
 *   in order: each star level's first quest ID, first bit or quest count. A
 *   table of ranges (first ID, first bit, count) shows up here, and the
 *   bytes around each hit are kept so its other fields can be read.
 */
import {
  QUEST_FLAG_ANCHORS,
  QUEST_FLAG_BITS,
  QUEST_FLAG_RUNS,
  questFlagBits,
  runFirstBits,
} from "../tables/quest-flags.js";

export interface ScanFile {
  name: string;
  buf: Buffer;
}

export type Width = 1 | 2 | 4;

function readValue(buf: Buffer, offset: number, width: Width): number {
  if (width === 1) return buf[offset]!;
  if (width === 2) return buf.readUInt16LE(offset);
  return buf.readUInt32LE(offset);
}

const FILLER_MAX: Record<Width, number> = { 1: 0xff, 2: 0xffff, 4: 0xffffffff };

/** IDs below this (quests 1-10, 101-109) are too common as plain numbers to count as evidence. */
const DISTINCTIVE_ID = 1000;
const MAX_LIST_STRIDE = 32;
const MIN_LIST_IDS = 12;
/** Consecutive unused (0 / all-ones) entries allowed inside a list. */
const MAX_FILLER_RUN = 16;

export interface IdListHit {
  file: string;
  /** File offset of the first entry. */
  offset: number;
  width: 2 | 4;
  stride: number;
  /** Entries in the run, unused ones included. */
  slots: number;
  /** Quest IDs in the run, in order; `null` for an unused entry. */
  entries: (number | null)[];
  /** The run compressed into ID ranges, e.g. `1001-1022 _x2 1101-1126`. */
  summary: string;
  /**
   * The bit of entry 0 if the anchors put it somewhere: the most common
   * `anchor bit - entry index` over the anchor IDs in the run.
   */
  bitOfFirstEntry: number | null;
  anchorsMatched: number[];
  anchorsMissed: number[];
  /** With `bitOfFirstEntry`: how the run's bits compare with the known layout (`tables/quest-flags.ts`). */
  vsSaves: {
    agree: number;
    disagree: number;
    notInSaves: number;
    firstDisagreements: string[];
  } | null;
}

/** "1-3 _x2 7" for [1, 2, 3, null, null, 7]. */
export function summarizeEntries(entries: (number | null)[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < entries.length) {
    const v = entries[i];
    let j = i;
    if (v === null) {
      while (j + 1 < entries.length && entries[j + 1] === null) j++;
      parts.push(`_x${j - i + 1}`);
    } else {
      while (j + 1 < entries.length && entries[j + 1] === entries[j]! + 1) j++;
      parts.push(j === i ? `${v}` : `${v}-${entries[j]}`);
    }
    i = j + 1;
  }
  return parts.join(" ");
}

function judgeList(
  hit: Omit<IdListHit, "bitOfFirstEntry" | "anchorsMatched" | "anchorsMissed" | "vsSaves">,
  anchors: Readonly<Record<number, number>>,
  saveMap: Map<number, number>,
): IdListHit {
  const votes = new Map<number, number[]>();
  hit.entries.forEach((id, index) => {
    if (id === null || anchors[id] === undefined) return;
    const base = anchors[id]! - index;
    votes.set(base, [...(votes.get(base) ?? []), id]);
  });
  const present = hit.entries.filter(
    (id): id is number => id !== null && anchors[id] !== undefined,
  );
  let best: [number, number[]] | null = null;
  for (const entry of votes) if (!best || entry[1].length > best[1].length) best = entry;
  if (!best) {
    return { ...hit, bitOfFirstEntry: null, anchorsMatched: [], anchorsMissed: [], vsSaves: null };
  }
  const [base, matched] = best;
  let agree = 0;
  let disagree = 0;
  let notInSaves = 0;
  const firstDisagreements: string[] = [];
  hit.entries.forEach((id, index) => {
    if (id === null) return;
    const expected = saveMap.get(id);
    if (expected === undefined) notInSaves++;
    else if (expected === base + index) agree++;
    else {
      disagree++;
      if (firstDisagreements.length < 10) {
        firstDisagreements.push(`${id}: table bit ${base + index}, saves ${expected}`);
      }
    }
  });
  return {
    ...hit,
    bitOfFirstEntry: base,
    anchorsMatched: matched.sort((a, b) => a - b),
    anchorsMissed: present.filter((id) => !matched.includes(id)).sort((a, b) => a - b),
    vsSaves: { agree, disagree, notInSaves, firstDisagreements },
  };
}

/** Arrays of quest IDs (one u16/u32 field every `stride` bytes), unused entries allowed. */
export function findQuestIdLists(
  file: ScanFile,
  questIds: ReadonlySet<number>,
  anchors: Readonly<Record<number, number>> = QUEST_FLAG_ANCHORS,
  saveMap: Map<number, number> = questFlagBits(),
): IdListHit[] {
  const { buf } = file;
  const raw: Omit<IdListHit, "bitOfFirstEntry" | "anchorsMatched" | "anchorsMissed" | "vsSaves">[] =
    [];
  for (const width of [2, 4] as const) {
    for (let stride = width; stride <= MAX_LIST_STRIDE; stride += width) {
      for (let phase = 0; phase < stride; phase += width) {
        let start = -1;
        let entries: (number | null)[] = [];
        let fillers = 0;
        const flush = () => {
          while (entries.length && entries[entries.length - 1] === null) entries.pop();
          const distinct = new Set(entries.filter((id) => id !== null && id >= DISTINCTIVE_ID));
          if (distinct.size >= MIN_LIST_IDS) {
            raw.push({
              file: file.name,
              offset: start,
              width,
              stride,
              slots: entries.length,
              entries,
              summary: summarizeEntries(entries),
            });
          }
          start = -1;
          entries = [];
          fillers = 0;
        };
        for (let off = phase; off + width <= buf.length; off += stride) {
          const v = readValue(buf, off, width);
          if (questIds.has(v)) {
            if (start < 0) start = off;
            entries.push(v);
            fillers = 0;
          } else if (
            start >= 0 &&
            (v === 0 || v === FILLER_MAX[width]) &&
            fillers < MAX_FILLER_RUN
          ) {
            entries.push(null);
            fillers++;
          } else if (start >= 0) {
            flush();
          }
        }
        if (start >= 0) flush();
      }
    }
  }
  // A list read at a multiple of its stride is the same list, thinned: keep the finest.
  raw.sort((a, b) => a.stride - b.stride || b.slots - a.slots);
  const kept: typeof raw = [];
  for (const hit of raw) {
    const end = hit.offset + hit.stride * hit.slots;
    const shadowed = kept.some(
      (k) =>
        k.width === hit.width &&
        hit.stride % k.stride === 0 &&
        hit.offset < k.offset + k.stride * k.slots &&
        end > k.offset,
    );
    if (!shadowed) kept.push(hit);
  }
  return kept.map((hit) => judgeList(hit, anchors, saveMap));
}

export interface NamedSequence {
  name: string;
  values: readonly number[];
}

export interface SequenceHit {
  file: string;
  sequence: string;
  width: Width;
  stride: number;
  /** File offset of the first matched entry. */
  offset: number;
  /** Index in the sequence of the first matched entry. */
  from: number;
  /** Consecutive sequence values matched. */
  length: number;
  /**
   * The matched records plus one before and after, `stride` bytes each
   * starting `fieldOffset` bytes before the matched field (capped at 64
   * bytes per record), as hex.
   */
  records: string[];
  /** Where in each record (as dumped) the matched field starts. */
  fieldOffset: number;
}

const SEQ_WIDTHS: readonly Width[] = [1, 2, 4];
const MAX_SEQ_STRIDE = 64;
const RECORD_DUMP_MAX = 64;

/**
 * Consecutive values a run needs. Small numbers (quest counts, early first
 * bits) are common as single bytes, so u8 runs need more of them.
 */
const MIN_RUN: Record<Width, number> = { 1: 6, 2: 4, 4: 4 };

/**
 * Strided runs of at least `minRun[width]` consecutive values of a sequence,
 * in the sequence's order (starting anywhere in it). A run found at stride
 * `s` is not reported again at multiples of `s`.
 */
export function findSequenceTables(
  file: ScanFile,
  sequences: readonly NamedSequence[],
  minRun: Record<Width, number> = MIN_RUN,
): SequenceHit[] {
  const { buf } = file;
  const hits: SequenceHit[] = [];
  for (const seq of sequences) {
    const where = new Map<number, number[]>();
    seq.values.forEach((v, i) => where.set(v, [...(where.get(v) ?? []), i]));
    for (const width of SEQ_WIDTHS) {
      const seen: { offset: number; stride: number; length: number }[] = [];
      for (let off = 0; off + width <= buf.length; off += width) {
        const starts = where.get(readValue(buf, off, width));
        if (!starts) continue;
        for (let stride = width; stride <= MAX_SEQ_STRIDE; stride += width) {
          for (const from of starts) {
            // Only report a run from its first matched entry.
            const prev = off - stride;
            if (from > 0 && prev >= 0 && readValue(buf, prev, width) === seq.values[from - 1]) {
              continue;
            }
            let length = 1;
            while (
              from + length < seq.values.length &&
              off + stride * length + width <= buf.length &&
              readValue(buf, off + stride * length, width) === seq.values[from + length]
            ) {
              length++;
            }
            if (length < minRun[width]) continue;
            const dup = seen.some(
              (s) =>
                stride % s.stride === 0 && off >= s.offset && off < s.offset + s.stride * s.length,
            );
            if (dup) continue;
            seen.push({ offset: off, stride, length });
            const recordSize = Math.min(Math.max(stride, 16), RECORD_DUMP_MAX);
            const fieldOffset = Math.min(Math.floor((recordSize - width) / 2), off);
            const records: string[] = [];
            for (let k = -1; k <= length; k++) {
              const at = off - fieldOffset + k * stride;
              if (at < 0 || at + recordSize > buf.length) continue;
              records.push(buf.subarray(at, at + recordSize).toString("hex"));
            }
            hits.push({
              file: file.name,
              sequence: seq.name,
              width,
              stride,
              offset: off,
              from,
              length,
              records,
              fieldOffset,
            });
          }
        }
      }
    }
  }
  return hits.sort((a, b) => b.length - a.length);
}

/** The values `findSequenceTables` looks for: each star level's first ID, first bit, size and slots. */
export function flagSequences(): NamedSequence[] {
  const firstBits = runFirstBits();
  const runs = QUEST_FLAG_RUNS.map((run, i) => ({ ...run, firstBit: firstBits[i]! }));
  const guild = runs.filter((r) => r.firstId >= 1000 && r.firstId < 4000);
  const village = runs.filter((r) => r.firstId >= 10000 && r.firstId < 20000);
  return [
    { name: "guild first IDs", values: guild.map((r) => r.firstId) },
    { name: "village first IDs", values: village.map((r) => r.firstId) },
    { name: "guild first bits", values: guild.map((r) => r.firstBit) },
    { name: "village first bits", values: village.map((r) => r.firstBit) },
    { name: "guild quest counts", values: guild.map((r) => r.count) },
    { name: "village quest counts", values: village.map((r) => r.count) },
    { name: "guild slot counts", values: guild.map((r) => r.slots) },
    { name: "village slot counts", values: village.map((r) => r.slots) },
  ];
}

export interface FlagTable {
  file: string;
  /** File offset of the entry for bit 0. */
  offset: number;
  width: 2 | 4;
  stride: number;
  /** ID-list hits that put bit 0 here. */
  hits: number;
  /** The raw value at every bit, `QUEST_FLAG_BITS` of them (fewer if the file ends first). */
  entries: number[];
  /** Disc quest ID -> bit (its first entry, if it appears twice). */
  bits: Record<number, number>;
  /** Later entries for a quest ID already placed: `bit: id`. */
  repeats: Record<number, number>;
  /** Bits whose value isn't a disc quest ID, 0 or all-ones: `bit: value`. */
  otherEntries: Record<number, number>;
  anchorsMatched: number[];
  anchorsMissed: number[];
  vsSaves: {
    agree: number;
    disagree: number;
    onlyInTable: number;
    onlyInSaves: number;
    firstDisagreements: string[];
  };
}

/**
 * The anchored ID lists are often one table split up by entries that aren't
 * disc quest IDs. Each list implies where bit 0 is (`offset -
 * bitOfFirstEntry * stride`); the start most lists agree on (most anchors
 * matched, then most lists) is read whole, every entry kept as found.
 */
export function assembleFlagTable(
  files: readonly ScanFile[],
  lists: readonly IdListHit[],
  questIds: ReadonlySet<number>,
  anchors: Readonly<Record<number, number>> = QUEST_FLAG_ANCHORS,
  saveMap: Map<number, number> = questFlagBits(),
): FlagTable | null {
  const starts = new Map<
    string,
    {
      file: string;
      offset: number;
      width: 2 | 4;
      stride: number;
      hits: number;
      anchors: Set<number>;
    }
  >();
  for (const h of lists) {
    if (h.bitOfFirstEntry === null) continue;
    const offset = h.offset - h.bitOfFirstEntry * h.stride;
    if (offset < 0) continue;
    const key = `${h.file}|${h.width}|${h.stride}|${offset}`;
    const start = starts.get(key) ?? {
      file: h.file,
      offset,
      width: h.width,
      stride: h.stride,
      hits: 0,
      anchors: new Set<number>(),
    };
    start.hits++;
    for (const id of h.anchorsMatched) start.anchors.add(id);
    starts.set(key, start);
  }
  const best = [...starts.values()].sort(
    (a, b) => b.anchors.size - a.anchors.size || b.hits - a.hits,
  )[0];
  if (!best) return null;
  const buf = files.find((f) => f.name === best.file)!.buf;

  const entries: number[] = [];
  const bits: Record<number, number> = {};
  const repeats: Record<number, number> = {};
  const otherEntries: Record<number, number> = {};
  for (let bit = 0; bit < QUEST_FLAG_BITS; bit++) {
    const at = best.offset + bit * best.stride;
    if (at + best.width > buf.length) break;
    const v = readValue(buf, at, best.width);
    entries.push(v);
    if (questIds.has(v)) {
      if (bits[v] === undefined) bits[v] = bit;
      else repeats[bit] = v;
    } else if (v !== 0 && v !== FILLER_MAX[best.width]) {
      otherEntries[bit] = v;
    }
  }

  const anchorIds = Object.keys(anchors).map(Number);
  let agree = 0;
  let disagree = 0;
  let onlyInTable = 0;
  const firstDisagreements: string[] = [];
  for (const [id, bit] of Object.entries(bits).map(([k, v]) => [Number(k), v] as const)) {
    const expected = saveMap.get(id);
    if (expected === undefined) onlyInTable++;
    else if (expected === bit) agree++;
    else {
      disagree++;
      if (firstDisagreements.length < 20)
        firstDisagreements.push(`${id}: table bit ${bit}, saves ${expected}`);
    }
  }
  const onlyInSaves = [...saveMap.keys()].filter((id) => bits[id] === undefined).length;
  return {
    file: best.file,
    offset: best.offset,
    width: best.width,
    stride: best.stride,
    hits: best.hits,
    entries,
    bits,
    repeats,
    otherEntries,
    anchorsMatched: anchorIds.filter((id) => bits[id] === anchors[id]),
    anchorsMissed: anchorIds.filter((id) => bits[id] !== anchors[id]),
    vsSaves: { agree, disagree, onlyInTable, onlyInSaves, firstDisagreements },
  };
}

export interface QuestFlagReport {
  files: { name: string; bytes: number }[];
  anchors: Readonly<Record<number, number>>;
  /** The table the anchored lists point to, read whole; null if no list was anchored. */
  table: FlagTable | null;
  idLists: IdListHit[];
  sequences: SequenceHit[];
}

const MAX_REPORTED = 60;

/** Both searches over every file, plus the table the anchored lists point to; ID lists that agree with the anchors first. */
export function scanQuestFlags(
  files: readonly ScanFile[],
  questIds: ReadonlySet<number>,
): QuestFlagReport {
  const allLists = files.flatMap((f) => findQuestIdLists(f, questIds));
  const idLists = [...allLists]
    .sort(
      (a, b) =>
        b.anchorsMatched.length - a.anchorsMatched.length ||
        (b.vsSaves?.agree ?? 0) - (a.vsSaves?.agree ?? 0) ||
        b.slots - a.slots,
    )
    .slice(0, MAX_REPORTED);
  const sequences = files
    .flatMap((f) => findSequenceTables(f, flagSequences()))
    .slice(0, MAX_REPORTED);
  return {
    files: files.map((f) => ({ name: f.name, bytes: f.buf.length })),
    anchors: QUEST_FLAG_ANCHORS,
    table: assembleFlagTable(files, allLists, questIds),
    idLists,
    sequences,
  };
}
