/**
 * Monster carve, capture and break rewards in `game_sub.ovl`, following the
 * vendored `game_sub.hexpat` (`bodytailshiny`, `capbreakindex`).
 *
 * Two index tables hold per-monster, per-rank indexes into pointer tables:
 *
 * - `bodytailshiny BTS[89]` (52 bytes each, entry `i` is emID `i + 1`): body
 *   carve, tail carve and shiny drop, each an `emCarveIndex` of seven u16
 *   indexes (unranked, low, high, treasure, training, G, misc; `0xFFFF` =
 *   none). Index `n` reads a pointer at `carvePointers + n * 4`, which points
 *   at `{ u16 chance, u16 item }` pairs ending in chance `0xFFFF`.
 * - `capbreakindex CapBreak[]` (14 bytes each, ends at a `0xFF` monster
 *   byte): u8 emID, u8 type (128 = capture, otherwise a break part), six
 *   u16 rank indexes into `capBreakPointers`, whose lists are
 *   `{ u16 chance, u16 item, u16 amount }` ending in chance `0xFFFF`.
 *
 * The hexpat gives JP addresses. EU tables can sit at other file offsets, so
 * `locateRewardTables` finds them by scoring candidate shifts against this
 * structure (every list must end, and its chances must sum to 100).
 */
import type { OvlFile } from "../container/ovl.js";

/** JP (`ULJM05500`) addresses from `game_sub.hexpat`. */
export const GAME_SUB_JP = {
  loadBase: 0x09c14280,
  carvePointers: 0x09cd2e20,
  carveIndex: 0x09cd3f20,
  capBreakPointers: 0x09cd87c0,
  capBreakIndex: 0x09cd9630,
} as const;

export const CARVE_INDEX_COUNT = 89;
export const CARVE_INDEX_SIZE = 52;
export const CAP_BREAK_ENTRY_SIZE = 14;
/** Pointers between `carvePointers` and `carveIndex` in JP. */
export const CARVE_POINTER_COUNT = (GAME_SUB_JP.carveIndex - GAME_SUB_JP.carvePointers) / 4;
/** Pointers between `capBreakPointers` and `capBreakIndex` in JP. */
export const CAP_BREAK_POINTER_COUNT =
  (GAME_SUB_JP.capBreakIndex - GAME_SUB_JP.capBreakPointers) / 4;
export const CAPTURE_TYPE = 128;

/** Rank slots, in struct order. Cap/break entries have no `misc` slot. */
export const REWARD_RANKS = [
  "unranked",
  "low",
  "high",
  "treasure",
  "training",
  "g",
  "misc",
] as const;
export type RewardRank = (typeof REWARD_RANKS)[number];
export const CARVE_KINDS = ["body", "tail", "shiny"] as const;
export type CarveKind = (typeof CARVE_KINDS)[number];

const NONE = 0xffff;
const MAX_LIST_LENGTH = 32;
/** Highest plausible ItemID; the enum has fewer than 2000 entries. */
const MAX_ITEM_ID = 2000;

export interface RewardEntry {
  chance: number;
  itemId: number;
  /** Cap/break lists only. Carves always give one. */
  amount?: number;
}

/** A resolved rank slot: the index, the pointer it reads, and the list (null if the pointer leaves this overlay or the list is malformed). */
export interface RewardList {
  index: number;
  pointer: number;
  entries: RewardEntry[] | null;
}

export type RankLists = Partial<Record<RewardRank, RewardList>>;

export interface CarveTables {
  emId: number;
  body: RankLists;
  tail: RankLists;
  shiny: RankLists;
}

export interface CapBreakTable {
  emId: number;
  /** 128 = capture, otherwise a break part number. */
  type: number;
  ranks: RankLists;
}

/** Where a pointer table and its index table sit, as file offsets in the overlay. */
export interface TablePairLocation {
  pointers: number;
  index: number;
  /** File-offset shift from the JP layout. */
  shift: number;
}

/** Reads a `0xFFFF`-terminated reward list at `vaddr`. Returns null for anything that doesn't look like one. */
export function readRewardList(
  ovl: OvlFile,
  vaddr: number,
  withAmount: boolean,
): RewardEntry[] | null {
  if (!ovl.isOwnVaddr(vaddr)) return null;
  const stride = withAmount ? 6 : 4;
  const entries: RewardEntry[] = [];
  let offset = ovl.vaddrToOffset(vaddr);
  for (let i = 0; i <= MAX_LIST_LENGTH; i++) {
    if (offset + 2 > ovl.reader.length) return null;
    const chance = ovl.reader.u16(offset);
    if (chance === NONE) return entries;
    if (offset + stride > ovl.reader.length) return null;
    const itemId = ovl.reader.u16(offset + 2);
    if (chance > 100 || itemId >= MAX_ITEM_ID) return null;
    const entry: RewardEntry = { chance, itemId };
    if (withAmount) entry.amount = ovl.reader.u16(offset + 4);
    entries.push(entry);
    offset += stride;
  }
  return null;
}

/** True if a list is a full drop table: non-empty, chances summing to 100. */
export function isCompleteList(entries: RewardEntry[] | null): boolean {
  if (!entries || entries.length === 0) return false;
  return entries.reduce((sum, e) => sum + e.chance, 0) === 100;
}

function readRankLists(
  ovl: OvlFile,
  indexOffset: number,
  rankCount: number,
  pointerTable: number,
  pointerCount: number,
  withAmount: boolean,
): RankLists {
  const ranks: RankLists = {};
  for (let r = 0; r < rankCount; r++) {
    const index = ovl.reader.u16(indexOffset + r * 2);
    if (index === NONE) continue;
    const rank = REWARD_RANKS[r]!;
    if (index >= pointerCount) {
      ranks[rank] = { index, pointer: 0, entries: null };
      continue;
    }
    const pointer = ovl.reader.u32(pointerTable + index * 4);
    ranks[rank] = { index, pointer, entries: readRewardList(ovl, pointer, withAmount) };
  }
  return ranks;
}

/** Reads all 89 `bodytailshiny` entries. Offsets are file offsets. */
export function readCarveTables(
  ovl: OvlFile,
  carvePointers: number,
  carveIndex: number,
): CarveTables[] {
  const tables: CarveTables[] = [];
  for (let i = 0; i < CARVE_INDEX_COUNT; i++) {
    const base = carveIndex + i * CARVE_INDEX_SIZE;
    const [body, tail, shiny] = CARVE_KINDS.map((_, k) =>
      readRankLists(
        ovl,
        base + k * 14,
        REWARD_RANKS.length,
        carvePointers,
        CARVE_POINTER_COUNT,
        false,
      ),
    );
    tables.push({ emId: i + 1, body: body!, tail: tail!, shiny: shiny! });
  }
  return tables;
}

/** Reads `capbreakindex` entries up to the `0xFF` terminator. Offsets are file offsets. */
export function readCapBreakTables(
  ovl: OvlFile,
  capBreakPointers: number,
  capBreakIndex: number,
): CapBreakTable[] {
  const tables: CapBreakTable[] = [];
  for (let offset = capBreakIndex; offset + CAP_BREAK_ENTRY_SIZE <= ovl.reader.length;) {
    const emId = ovl.reader.u8(offset);
    if (emId === 0xff) break;
    tables.push({
      emId,
      type: ovl.reader.u8(offset + 1),
      ranks: readRankLists(ovl, offset + 2, 6, capBreakPointers, CAP_BREAK_POINTER_COUNT, true),
    });
    offset += CAP_BREAK_ENTRY_SIZE;
    if (tables.length > 1000) break;
  }
  return tables;
}

interface Score {
  /** Distinct pointers to complete lists: a wrong shift can reach the same few lists many times. */
  complete: number;
  broken: number;
}

/** Counts complete vs. malformed lists for one candidate; stops early once `maxBroken` is passed. */
function scoreRankIndexes(
  ovl: OvlFile,
  indexOffsets: number[],
  pointerTable: number,
  pointerCount: number,
  withAmount: boolean,
  maxBroken: number,
): Score {
  const score: Score = { complete: 0, broken: 0 };
  const seen = new Set<number>();
  const length = ovl.reader.length;
  if (pointerTable < 0 || pointerTable + pointerCount * 4 > length)
    return { complete: 0, broken: 1 };
  for (const offset of indexOffsets) {
    if (offset < 0 || offset + 2 > length) return { complete: 0, broken: maxBroken + 1 };
    const index = ovl.reader.u16(offset);
    if (index === NONE) continue;
    if (index >= pointerCount) {
      score.broken++;
    } else {
      const pointer = ovl.reader.u32(pointerTable + index * 4);
      // Pointers outside this overlay are the hexpat's "hard coded entries
      // handled outside gamesub": neither evidence for nor against.
      if (ovl.isOwnVaddr(pointer)) {
        if (!isCompleteList(readRewardList(ovl, pointer, withAmount))) score.broken++;
        else if (!seen.has(pointer)) {
          seen.add(pointer);
          score.complete++;
        }
      }
    }
    if (score.broken > maxBroken) return score;
  }
  return score;
}

function carveIndexOffsets(carveIndex: number): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < CARVE_INDEX_COUNT; i++) {
    for (let k = 0; k < CARVE_KINDS.length; k++) {
      for (let r = 0; r < REWARD_RANKS.length; r++) {
        offsets.push(carveIndex + i * CARVE_INDEX_SIZE + k * 14 + r * 2);
      }
    }
  }
  return offsets;
}

function capBreakIndexOffsets(ovl: OvlFile, capBreakIndex: number): number[] | null {
  const offsets: number[] = [];
  for (let offset = capBreakIndex; ; offset += CAP_BREAK_ENTRY_SIZE) {
    if (offset < 0 || offset + CAP_BREAK_ENTRY_SIZE > ovl.reader.length) return null;
    const emId = ovl.reader.u8(offset);
    if (emId === 0xff) break;
    if (emId >= 90) return null;
    for (let r = 0; r < 6; r++) offsets.push(offset + 2 + r * 2);
    if (offsets.length > 6000) return null;
  }
  return offsets.length > 0 ? offsets : null;
}

/** Shifts tried, nearest first: 0, +4, -4, +8, … up to ±`range`. */
function* shiftCandidates(range: number, preferred: number[]): Generator<number> {
  const seen = new Set<number>();
  for (const s of preferred) {
    if (!seen.has(s)) {
      seen.add(s);
      yield s;
    }
  }
  for (let d = 0; d <= range; d += 4) {
    for (const s of d === 0 ? [0] : [d, -d]) {
      if (!seen.has(s)) {
        seen.add(s);
        yield s;
      }
    }
  }
}

export interface LocateOptions {
  /** Largest file-offset shift from JP to try, in bytes. */
  range?: number;
}

/** A candidate is accepted when nearly every list it reaches is a complete drop table. */
function accept(score: Score, minComplete: number): boolean {
  return score.complete >= minComplete && score.broken * 50 <= score.complete;
}

const jpOffset = (vaddr: number) => vaddr - GAME_SUB_JP.loadBase + 0x80;

/**
 * Finds `bodytailshiny` and its pointer table in a `game_sub.ovl` of any
 * region: of the JP file offsets shifted by each amount in range, the one
 * whose indexes reach the most distinct well-formed drop tables (nearest to
 * JP on a tie). Every shift is scored, because a few bytes' misalignment can
 * still reach real lists. Null if no shift passes.
 */
export function locateCarveTables(
  ovl: OvlFile,
  options: LocateOptions = {},
): TablePairLocation | null {
  let best: { location: TablePairLocation; complete: number } | null = null;
  for (const shift of shiftCandidates(options.range ?? ovl.reader.length, [0])) {
    const pointers = jpOffset(GAME_SUB_JP.carvePointers) + shift;
    const index = jpOffset(GAME_SUB_JP.carveIndex) + shift;
    if (index < 0 || index + CARVE_INDEX_COUNT * CARVE_INDEX_SIZE > ovl.reader.length) continue;
    const score = scoreRankIndexes(
      ovl,
      carveIndexOffsets(index),
      pointers,
      CARVE_POINTER_COUNT,
      false,
      8,
    );
    if (accept(score, 40) && score.complete > (best?.complete ?? 0)) {
      best = { location: { pointers, index, shift }, complete: score.complete };
    }
  }
  return best?.location ?? null;
}

/** As `locateCarveTables`, for `capbreakindex`. Tries `hint` (the carve shift) first. */
export function locateCapBreakTables(
  ovl: OvlFile,
  options: LocateOptions & { hint?: number } = {},
): TablePairLocation | null {
  const preferred = options.hint === undefined ? [0] : [options.hint, 0];
  let best: { location: TablePairLocation; complete: number } | null = null;
  for (const shift of shiftCandidates(options.range ?? ovl.reader.length, preferred)) {
    const pointers = jpOffset(GAME_SUB_JP.capBreakPointers) + shift;
    const index = jpOffset(GAME_SUB_JP.capBreakIndex) + shift;
    const offsets = capBreakIndexOffsets(ovl, index);
    if (!offsets) continue;
    const score = scoreRankIndexes(ovl, offsets, pointers, CAP_BREAK_POINTER_COUNT, true, 8);
    if (accept(score, 20) && score.complete > (best?.complete ?? 0)) {
      best = { location: { pointers, index, shift }, complete: score.complete };
    }
  }
  return best?.location ?? null;
}
