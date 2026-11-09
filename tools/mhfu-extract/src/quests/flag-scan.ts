/**
 * `quest-flags`: searches the EBOOT and overlays for the table the game uses
 * to turn a quest ID into its "cleared" bit in the save (see
 * `tables/quest-flags.ts` for what saves have shown so far). Numbers only;
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
  SAVE_DERIVED_GROUPS,
  groupsToBitMap,
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
  /** With `bitOfFirstEntry`: how the run's bits compare with the save-derived layout. */
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
  saveMap: Map<number, number> = groupsToBitMap(SAVE_DERIVED_GROUPS),
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

/** The values `findSequenceTables` looks for: each star level's first ID, first bit and size. */
export function flagSequences(): NamedSequence[] {
  const guild = SAVE_DERIVED_GROUPS.filter((g) => g.firstId >= 1000 && g.firstId < 10000);
  const village = SAVE_DERIVED_GROUPS.filter((g) => g.firstId >= 10000);
  return [
    { name: "guild first IDs", values: guild.map((g) => g.firstId) },
    { name: "village first IDs", values: village.map((g) => g.firstId) },
    { name: "guild first bits", values: guild.map((g) => g.firstBit) },
    { name: "village first bits", values: village.map((g) => g.firstBit) },
    { name: "guild quest counts", values: guild.map((g) => g.count) },
    { name: "village quest counts", values: village.map((g) => g.count) },
    // Slots per star level (count plus the unused bits after it) in case the
    // table stores capacities: the next group's first bit minus this one's.
    {
      name: "guild slot counts",
      values: guild.map((g, i) => (guild[i + 1]?.firstBit ?? 277) - g.firstBit),
    },
    {
      name: "village slot counts",
      values: village.map((g, i) => (village[i + 1]?.firstBit ?? QUEST_FLAG_BITS) - g.firstBit),
    },
  ];
}

export interface QuestFlagReport {
  files: { name: string; bytes: number }[];
  anchors: Readonly<Record<number, number>>;
  idLists: IdListHit[];
  sequences: SequenceHit[];
}

const MAX_REPORTED = 60;

/** Both searches over every file; ID lists that agree with the anchors first. */
export function scanQuestFlags(
  files: readonly ScanFile[],
  questIds: ReadonlySet<number>,
): QuestFlagReport {
  const idLists = files
    .flatMap((f) => findQuestIdLists(f, questIds))
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
    idLists,
    sequences,
  };
}
