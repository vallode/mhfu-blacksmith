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
 * - Pointers no `bodytailshiny` index reaches (#1001 to #1087 on the EU
 *   disc) lead to lists that code picks instead, by the quest's rank slot:
 *   a monster's `emXX.ovl` loads the pointer number as an immediate (the
 *   elder dragons' carves, Gypceros's live carves), and `game_task.ovl`'s
 *   shiny drop code does for Yama Tsukami and reads Congalala's and Emerald
 *   Congalala's tail-stagger drops from u32 tables of pointer numbers, three
 *   per rank slot (bone, mushroom, mineral stone). `readUnindexedCarves`
 *   reads the lists by pointer number, and `CODE_CARVES` says which monster
 *   and rank slot each code picks.
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

/** Carve lists no `bodytailshiny` index reaches, by pointer number (see the module comment). */
export function readUnindexedCarves(ovl: OvlFile, table: TablePair): Record<number, RewardEntry[]> {
  const indexed = new Set<number>();
  for (let i = 0; i < CARVE_INDEX_COUNT; i++)
    for (let k = 0; k < CARVE_KINDS.length * REWARD_RANKS.length; k++)
      indexed.add(ovl.reader.u16(table.index + i * CARVE_INDEX_SIZE + k * 2));
  const lists: Record<number, RewardEntry[]> = {};
  for (let n = 0; n < CARVE_POINTER_COUNT; n++) {
    if (indexed.has(n)) continue;
    const list = readRewardList(ovl, ovl.reader.u32(table.pointers + n * 4), false);
    if (list) lists[n] = list;
  }
  return lists;
}

/** A carve or shiny drop whose list code picks rather than `bodytailshiny` (see the module comment). */
export interface CodeCarve {
  emId: number;
  /** "body", "live carve", "second carve" or "shiny". */
  source: string;
  /** The carve pointer the code picks in each rank slot, in `REWARD_RANKS` order. */
  pointers: readonly number[];
}

/**
 * Every code-picked carve, read off the EU disc's code: em02.ovl (Fatalis,
 * Crimson and White Fatalis), em07.ovl (Lao-Shan Lung and Ashen), em20.ovl
 * (Gypceros and Purple), em55.ovl (Shen Gaoren), em58.ovl (Yama Tsukami's
 * carves) and game_task.ovl's shiny drop code (Yama Tsukami, Congalala,
 * Emerald Congalala; EU vaddr 0x09AD7AB8). Each picks one pointer for a few
 * rank slots and another for every other slot. Shen Gaoren's second carve
 * has Lao-Shan Lung's materials.
 */
export const CODE_CARVES: readonly CodeCarve[] = [
  { emId: 2, source: "body", pointers: [1007, 1072, 1007, 1007, 1033, 1055, 1007] },
  { emId: 36, source: "body", pointers: [1008, 1073, 1008, 1008, 1036, 1056, 1008] },
  { emId: 71, source: "body", pointers: [1047, 1074, 1009, 1009, 1041, 1057, 1047] },
  { emId: 7, source: "body", pointers: [1001, 1001, 1003, 1001, 1034, 1051, 1001] },
  { emId: 7, source: "live carve", pointers: [1002, 1002, 1004, 1002, 1035, 1052, 1002] },
  { emId: 50, source: "body", pointers: [1005, 1005, 1005, 1005, 1037, 1053, 1005] },
  { emId: 50, source: "live carve", pointers: [1006, 1006, 1006, 1006, 1038, 1054, 1006] },
  { emId: 20, source: "live carve", pointers: [1028, 1028, 1028, 1028, 1042, 1066, 1083] },
  { emId: 39, source: "live carve", pointers: [1048, 1048, 1048, 1048, 1050, 1067, 1084] },
  { emId: 55, source: "body", pointers: [1030, 1030, 1010, 1030, 1039, 1058, 1030] },
  { emId: 55, source: "second carve", pointers: [1031, 1031, 1011, 1031, 1040, 1059, 1031] },
  { emId: 58, source: "body", pointers: [1068, 1068, 1068, 1068, 1070, 1068, 1068] },
  { emId: 58, source: "live carve", pointers: [1069, 1069, 1069, 1069, 1071, 1069, 1069] },
  { emId: 58, source: "shiny", pointers: [1076, 1076, 1076, 1076, 1076, 1075, 1076] },
  // Congalala and Emerald Congalala: bone, mushroom, mineral stone.
  { emId: 52, source: "shiny", pointers: [1013, 1016, 1019, 1022, 1025, 1060, 1077] },
  { emId: 52, source: "shiny", pointers: [1014, 1017, 1020, 1023, 1026, 1061, 1078] },
  { emId: 52, source: "shiny", pointers: [1015, 1018, 1021, 1024, 1027, 1062, 1079] },
  { emId: 85, source: "shiny", pointers: [1080, 1080, 1080, 1080, 1085, 1063, 1080] },
  { emId: 85, source: "shiny", pointers: [1081, 1081, 1081, 1081, 1086, 1064, 1081] },
  { emId: 85, source: "shiny", pointers: [1082, 1082, 1082, 1082, 1087, 1065, 1082] },
];
