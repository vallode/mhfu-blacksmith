/**
 * Monster carve, capture and break rewards in `game_sub.ovl`, as the
 * vendored `game_sub.hexpat` lays them out (`bodytailshiny`,
 * `capbreakindex`). Confirmed on the EU disc against the committed
 * `data/monsters` drops (vallode/mhfu-blacksmith#35).
 *
 * - `bodytailshiny[89]` (52 bytes, entry `i` is emID `i + 1`): body carve,
 *   tail carve and shiny drop, each seven u16 indexes, one per rank slot
 *   (unranked, low, high, treasure, training, G, misc; `0xFFFF` = none),
 *   then a 10-byte trailer (two u8, the f32 carve radius, a u16, two u8).
 *   Index `n` reads the pointer at `carvePointers + n * 4`, which leads to
 *   `{ u16 chance, u16 item }` pairs ending in chance `0xFFFF`.
 * - `capbreakindex[]` (14 bytes, ending at a `0xFF` emID byte): u8 emID,
 *   u8 type (128 = capture, otherwise a break part number), six u16 rank
 *   indexes (no misc slot) into `capBreakPointers`, whose lists are
 *   `{ u16 chance, u16 item, u16 amount }` ending in chance `0xFFFF`.
 *
 * Each index table directly follows its pointer table, and the pointer
 * tables are runs of exactly 1088 and 924 pointers into the overlay (the
 * JP counts), which is how `locateRewardTables` finds them on any region.
 * On the EU disc both pairs sit 0x310 bytes past their JP file offsets.
 */
import type { OvlFile } from "../container/ovl.js";

export const CARVE_POINTER_COUNT = 1088;
export const CAP_BREAK_POINTER_COUNT = 924;
export const CARVE_INDEX_COUNT = 89;
export const CARVE_INDEX_SIZE = 52;
export const CAP_BREAK_ENTRY_SIZE = 14;
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

export interface RewardEntry {
  chance: number;
  itemId: number;
  /** Cap/break lists only. Carves always give one. */
  amount?: number;
}

export type RankLists = Partial<Record<RewardRank, RewardEntry[]>>;

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

export interface TablePair {
  /** File offsets in the overlay. */
  pointers: number;
  index: number;
}

export interface RewardTableLocation {
  carves: TablePair;
  capBreak: TablePair;
}

/** Reads a `0xFFFF`-terminated reward list at `vaddr`, or null if it isn't one. */
export function readRewardList(
  ovl: OvlFile,
  vaddr: number,
  withAmount: boolean,
): RewardEntry[] | null {
  if (!ovl.isOwnVaddr(vaddr)) return null;
  const stride = withAmount ? 6 : 4;
  const r = ovl.reader;
  const entries: RewardEntry[] = [];
  for (let at = ovl.vaddrToOffset(vaddr); entries.length <= MAX_LIST_LENGTH; at += stride) {
    if (at + 2 > r.length) return null;
    const chance = r.u16(at);
    if (chance === NONE) return entries;
    if (at + stride > r.length || chance > 100) return null;
    const entry: RewardEntry = { chance, itemId: r.u16(at + 2) };
    if (withAmount) entry.amount = r.u16(at + 4);
    entries.push(entry);
  }
  return null;
}

/** Runs of consecutive u32 words that point into the overlay, as `[start, length]` file offsets/word counts. */
function pointerRuns(ovl: OvlFile): [number, number][] {
  const runs: [number, number][] = [];
  const r = ovl.reader;
  let start = -1;
  for (let at = 0x80; at + 4 <= r.length; at += 4) {
    if (ovl.isOwnVaddr(r.u32(at))) {
      if (start === -1) start = at;
    } else if (start !== -1) {
      runs.push([start, (at - start) / 4]);
      start = -1;
    }
  }
  if (start !== -1) runs.push([start, (r.length - start) / 4]);
  return runs;
}

/** Finds both pointer tables (runs of exactly their pointer count) and the index tables after them. */
export function locateRewardTables(ovl: OvlFile): RewardTableLocation | null {
  const runs = pointerRuns(ovl);
  const pair = (count: number): TablePair | null => {
    const found = runs.filter(([, length]) => length === count);
    if (found.length !== 1) return null;
    const [start] = found[0]!;
    return { pointers: start, index: start + count * 4 };
  };
  const carves = pair(CARVE_POINTER_COUNT);
  const capBreak = pair(CAP_BREAK_POINTER_COUNT);
  return carves && capBreak ? { carves, capBreak } : null;
}

function readRankLists(
  ovl: OvlFile,
  indexOffset: number,
  rankCount: number,
  table: TablePair,
  pointerCount: number,
  withAmount: boolean,
): RankLists {
  const ranks: RankLists = {};
  for (let i = 0; i < rankCount; i++) {
    const index = ovl.reader.u16(indexOffset + i * 2);
    if (index === NONE || index >= pointerCount) continue;
    const list = readRewardList(ovl, ovl.reader.u32(table.pointers + index * 4), withAmount);
    if (list) ranks[REWARD_RANKS[i]!] = list;
  }
  return ranks;
}

/** Reads all 89 `bodytailshiny` entries. */
export function readCarveTables(ovl: OvlFile, table: TablePair): CarveTables[] {
  const tables: CarveTables[] = [];
  for (let i = 0; i < CARVE_INDEX_COUNT; i++) {
    const base = table.index + i * CARVE_INDEX_SIZE;
    const [body, tail, shiny] = CARVE_KINDS.map((_, k) =>
      readRankLists(ovl, base + k * 14, REWARD_RANKS.length, table, CARVE_POINTER_COUNT, false),
    );
    tables.push({ emId: i + 1, body: body!, tail: tail!, shiny: shiny! });
  }
  return tables;
}

/** Reads `capbreakindex` entries up to the `0xFF` terminator. */
export function readCapBreakTables(ovl: OvlFile, table: TablePair): CapBreakTable[] {
  const tables: CapBreakTable[] = [];
  for (
    let at = table.index;
    at + CAP_BREAK_ENTRY_SIZE <= ovl.reader.length && tables.length < 1000;
    at += CAP_BREAK_ENTRY_SIZE
  ) {
    const emId = ovl.reader.u8(at);
    if (emId === 0xff) break;
    tables.push({
      emId,
      type: ovl.reader.u8(at + 1),
      ranks: readRankLists(ovl, at + 2, 6, table, CAP_BREAK_POINTER_COUNT, true),
    });
  }
  return tables;
}
