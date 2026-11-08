/**
 * Per-monster `emChunk` records in `game_task.ovl` (`MonChunk[90]`, indexed
 * by emID) and their hitzone tables, as the vendored `game_task.hexpat`
 * describes them, with corrections confirmed on the EU disc against the
 * committed `data/monsters` hitzones (vallode/mhfu-blacksmith#35):
 *
 *   chunk (0x1D0 bytes, the `tclamb/mhp2g-decomp` `EnemyData` stride)
 *   +0x040  f32 BaseScale
 *   +0x100  u32 base HP (Felyne 40, Yian Kut-Ku 1600, Rathian 4000, Lao-Shan
 *           Lung 26666); quests scale it by their `power` row
 *   +0x10C  u32 `HitzonePTR`: one pointer (not a list) to a `HitzoneTbl`
 *           list, u32 pointers ending at the first non-pointer
 *   +0x110  Tolerance: Paralysis, KO, Sleep, unknown (5 u16 each: initial,
 *           recovery time, recovery, duration, increase), then Poison (7
 *           u16: initial, recovery time, recovery, damage, total time,
 *           damage per second, increase)
 *
 * Each `HitzoneTbl` pointer leads to 10-byte `HitZoneVal` rows ending in a
 * zero u16: a lead byte (100, 90, 80, … on big monsters; meaning unknown),
 * then cut, bash, shot, fire, water, ice, thunder, dragon, KO. Every table
 * on the EU disc has 7 rows; small monsters use row 0 and fill the rest.
 * Monsters with breakable states (Gravios, Congalala, …) have a second
 * table, Hermitaurs a third. Variants can share their base monster's list
 * (Blue Yian Kut-Ku and Yian Kut-Ku do). The chunks that aren't monsters
 * (None, Veggie Elder, Cat Cart, Poogie) share a list of filler rows.
 */
import type { OvlFile } from "../container/ovl.js";

export const GAME_TASK_JP = {
  loadBase: 0x09a5a580,
  monsterChunks: 0x09bb3c20,
} as const;

export const MONSTER_CHUNK_COUNT = 90;
export const MONSTER_CHUNK_SIZE = 0x1d0;
export const HITZONE_POINTER_OFFSET = 0x10c;
/** u16; the following u16 is a second value (not HP) that small monsters fill in. */
export const BASE_HP_OFFSET = 0x100;
export const TOLERANCE_OFFSET = 0x110;
export const HITZONE_ROW_SIZE = 10;
/** Sanity limits: no real monster has more than 3 tables of 7 rows. */
const MAX_TABLES = 8;
const MAX_ROWS = 32;

export const HITZONE_COLUMNS = [
  "cut",
  "bash",
  "shot",
  "fire",
  "water",
  "ice",
  "thunder",
  "dragon",
  "ko",
] as const;
export type HitzoneColumn = (typeof HITZONE_COLUMNS)[number];

export interface HitzoneRow {
  /** The row's first byte; 100, 90, 80, … on big monsters, meaning unknown. */
  lead: number;
  values: Record<HitzoneColumn, number>;
}

export interface StatusTolerance {
  initial: number;
  recoveryTime: number;
  recovery: number;
  duration: number;
  increase: number;
}

export interface PoisonTolerance {
  initial: number;
  recoveryTime: number;
  recovery: number;
  damage: number;
  totalTime: number;
  damagePerSecond: number;
  increase: number;
}

export interface Tolerances {
  paralysis: StatusTolerance;
  ko: StatusTolerance;
  sleep: StatusTolerance;
  unknown: StatusTolerance;
  poison: PoisonTolerance;
}

export interface MonsterChunk {
  emId: number;
  baseScale: number;
  /** Base HP before the quest's multiplier. */
  baseHp: number;
  hitzonePointer: number;
  /** Hitzone tables, or null if the pointer doesn't lead to well-formed ones. */
  hitzones: HitzoneRow[][] | null;
  tolerances: Tolerances;
}

function readStatus(ovl: OvlFile, offset: number): StatusTolerance {
  const r = ovl.reader;
  return {
    initial: r.u16(offset),
    recoveryTime: r.u16(offset + 2),
    recovery: r.u16(offset + 4),
    duration: r.u16(offset + 6),
    increase: r.u16(offset + 8),
  };
}

export function readTolerances(ovl: OvlFile, chunkOffset: number): Tolerances {
  const base = chunkOffset + TOLERANCE_OFFSET;
  const r = ovl.reader;
  const poison = base + 40;
  return {
    paralysis: readStatus(ovl, base),
    ko: readStatus(ovl, base + 10),
    sleep: readStatus(ovl, base + 20),
    unknown: readStatus(ovl, base + 30),
    poison: {
      initial: r.u16(poison),
      recoveryTime: r.u16(poison + 2),
      recovery: r.u16(poison + 4),
      damage: r.u16(poison + 6),
      totalTime: r.u16(poison + 8),
      damagePerSecond: r.u16(poison + 10),
      increase: r.u16(poison + 12),
    },
  };
}

function readRow(ovl: OvlFile, offset: number): HitzoneRow {
  const values = {} as Record<HitzoneColumn, number>;
  HITZONE_COLUMNS.forEach((column, c) => {
    values[column] = ovl.reader.u8(offset + 1 + c);
  });
  return { lead: ovl.reader.u8(offset), values };
}

/** Reads `HitZoneVal` rows at a file offset up to the zero u16 ending them. Null if malformed. */
export function readHitzoneRows(ovl: OvlFile, offset: number): HitzoneRow[] | null {
  const r = ovl.reader;
  const rows: HitzoneRow[] = [];
  for (let at = offset; ; at += HITZONE_ROW_SIZE) {
    if (at + 2 > r.length) return null;
    if (r.u16(at) === 0) return rows.length > 0 ? rows : null;
    if (at + HITZONE_ROW_SIZE > r.length || rows.length >= MAX_ROWS) return null;
    rows.push(readRow(ovl, at));
  }
}

/** Follows a `HitzonePTR` to its `HitzoneTbl` list and each table's rows. */
export function readHitzoneTables(ovl: OvlFile, pointer: number): HitzoneRow[][] | null {
  if (!ovl.isOwnVaddr(pointer)) return null;
  const tables: HitzoneRow[][] = [];
  for (let at = ovl.vaddrToOffset(pointer); at + 4 <= ovl.reader.length; at += 4) {
    const table = ovl.reader.u32(at);
    if (!ovl.isOwnVaddr(table)) break;
    const rows = readHitzoneRows(ovl, ovl.vaddrToOffset(table));
    if (!rows || tables.length >= MAX_TABLES) return null;
    tables.push(rows);
  }
  return tables.length > 0 ? tables : null;
}

/** Reads all 90 chunks at a file offset, with each one's hitzone tables. */
export function readMonsterChunks(ovl: OvlFile, chunksOffset: number): MonsterChunk[] {
  const chunks: MonsterChunk[] = [];
  for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
    const base = chunksOffset + emId * MONSTER_CHUNK_SIZE;
    const pointer = ovl.reader.u32(base + HITZONE_POINTER_OFFSET);
    chunks.push({
      emId,
      baseScale: ovl.reader.f32(base + 0x40),
      baseHp: ovl.reader.u16(base + BASE_HP_OFFSET),
      hitzonePointer: pointer,
      hitzones: readHitzoneTables(ovl, pointer),
      tolerances: readTolerances(ovl, base),
    });
  }
  return chunks;
}

/** PSP user-memory vaddrs: anything a chunk pointer could reasonably hold. */
const isUserAddress = (v: number) => v >= 0x08800000 && v < 0x0a000000;

function chunkLooksValid(ovl: OvlFile, base: number): boolean {
  const scale = ovl.reader.f32(base + 0x40);
  if (!(scale > 0.01 && scale < 50)) return false;
  return isUserAddress(ovl.reader.u32(base + HITZONE_POINTER_OFFSET));
}

/**
 * Finds `MonChunk[90]` in a `game_task.ovl` of any region. Every shift of the
 * JP file offset is scored by how many chunks have a sane base scale and a
 * hitzone pointer into user memory; the best score wins, nearest to the JP
 * offset on a tie. Scoring (rather than taking the first shift that passes)
 * matters because a shift of a few whole chunks also passes when the bytes
 * next to the array look like chunks. On the EU disc the array is 0x110
 * bytes past the JP file offset. Returns the file offset and the shift, or null if
 * no shift has more than 77 plausible chunks.
 */
export function locateMonsterChunks(
  ovl: OvlFile,
  range = ovl.reader.length,
): { offset: number; shift: number } | null {
  const jp = GAME_TASK_JP.monsterChunks - GAME_TASK_JP.loadBase;
  const size = MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE;
  // emID 0 ("None") and non-monsters (Rocks, Cat Cart) may be empty.
  const maxBad = 12;
  const score = (shift: number) => {
    const offset = jp + shift;
    if (offset < 0 || offset + size > ovl.reader.length) return -1;
    let bad = 0;
    for (let i = 0; i < MONSTER_CHUNK_COUNT; i++) {
      if (!chunkLooksValid(ovl, offset + i * MONSTER_CHUNK_SIZE) && ++bad > maxBad) return -1;
    }
    return MONSTER_CHUNK_COUNT - bad;
  };
  let best: { shift: number; score: number } | null = null;
  for (let d = 0; d <= range; d += 4) {
    for (const shift of d === 0 ? [0] : [d, -d]) {
      const s = score(shift);
      if (s > (best?.score ?? -1)) best = { shift, score: s };
    }
    if (best?.score === MONSTER_CHUNK_COUNT) break;
  }
  return best ? { offset: jp + best.shift, shift: best.shift } : null;
}
