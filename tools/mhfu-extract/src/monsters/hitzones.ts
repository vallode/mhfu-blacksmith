/**
 * Per-monster `emChunk` records in `game_task.ovl` (`MonChunk[90]`, indexed
 * by emID), following the vendored `game_task.hexpat` and the 464-byte
 * stride from the `tclamb/mhp2g-decomp` `EnemyData` struct.
 *
 * Layout used here (offsets within one chunk):
 *
 *   +0x040  f32 BaseScale
 *   +0x10C  u32 HitzonePTR[2] — pointers to a `HitzoneTbl` (itself a pointer
 *           to `HitZoneVal` rows), possibly in an `emXX.ovl`
 *   +0x114  Tolerance: Paralysis, KO, Sleep, unknown (5 u16 each: initial,
 *           recovery time, recovery, duration, increase), then Poison (7
 *           u16: initial, recovery time, recovery, damage, total time,
 *           damage per second, increase)
 *   +0x15C  u32 emPTRTable[27] (PartDurabilityPTR is [22])
 *
 * `HitZoneVal` rows are 10 bytes: part, cut, bash, shot, fire, water, ice,
 * thunder, dragon, KO. That order matches Felyne's row at `0x09bc0418`
 * (JP), whose bytes from cut on are the long-standing fixture.
 *
 * As with the reward tables, EU can sit at another file offset, so
 * `locateMonsterChunks` scores candidate shifts.
 */
import type { OvlFile } from "../container/ovl.js";

export const GAME_TASK_JP = {
  loadBase: 0x09a5a580,
  monsterChunks: 0x09bb3c20,
} as const;

export const MONSTER_CHUNK_COUNT = 90;
export const MONSTER_CHUNK_SIZE = 0x1d0;
export const HITZONE_POINTERS_OFFSET = 0x10c;
export const HITZONE_POINTER_COUNT = 2;
export const TOLERANCE_OFFSET = 0x114;
export const HITZONE_ROW_SIZE = 10;
const MAX_HITZONE_ROWS = 32;

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
  part: number;
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

/** Where a pointer leads: the overlay holding it, its file offset there. */
export interface ResolvedAddress {
  file: string;
  offset: number;
}

/** Maps a vaddr to bytes, across `game_task.ovl` and any `emXX.ovl` that could hold it. */
export type AddressSpace = (vaddr: number, emId: number) => { ovl: OvlFile; file: string } | null;

export interface HitzoneTable {
  /** The `HitzonePTR` value. */
  pointer: number;
  /** The `HitzoneTbl.PTR` value read at `pointer`, if `pointer` resolved. */
  rowsPointer: number | null;
  resolved: ResolvedAddress | null;
  rows: HitzoneRow[] | null;
}

export interface MonsterChunk {
  emId: number;
  baseScale: number;
  hitzones: HitzoneTable[];
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

/**
 * Reads `HitZoneVal` rows at a file offset until a row whose first two bytes
 * are zero (the hexpat's terminator). Null if no terminator comes in time or
 * a value is out of range.
 */
export function readHitzoneRows(ovl: OvlFile, offset: number): HitzoneRow[] | null {
  const rows: HitzoneRow[] = [];
  const r = ovl.reader;
  for (let i = 0; i <= MAX_HITZONE_ROWS; i++) {
    const at = offset + i * HITZONE_ROW_SIZE;
    if (at + 2 > r.length) return null;
    if (r.u16(at) === 0) return rows;
    if (at + HITZONE_ROW_SIZE > r.length) return null;
    const values = {} as Record<HitzoneColumn, number>;
    HITZONE_COLUMNS.forEach((column, c) => {
      values[column] = r.u8(at + 1 + c);
    });
    if (Object.values(values).some((v) => v > 250)) return null;
    rows.push({ part: r.u8(at), values });
  }
  return null;
}

function readHitzoneTable(space: AddressSpace, pointer: number, emId: number): HitzoneTable {
  const table: HitzoneTable = { pointer, rowsPointer: null, resolved: null, rows: null };
  const tbl = space(pointer, emId);
  if (!tbl) return table;
  const tblOffset = tbl.ovl.vaddrToOffset(pointer);
  if (tblOffset + 4 > tbl.ovl.reader.length) return table;
  table.rowsPointer = tbl.ovl.reader.u32(tblOffset);
  const rows = space(table.rowsPointer, emId);
  if (!rows) return table;
  const rowsOffset = rows.ovl.vaddrToOffset(table.rowsPointer);
  table.resolved = { file: rows.file, offset: rowsOffset };
  table.rows = readHitzoneRows(rows.ovl, rowsOffset);
  return table;
}

/** Reads all 90 chunks at a file offset. `space` resolves hitzone pointers. */
export function readMonsterChunks(
  ovl: OvlFile,
  chunksOffset: number,
  space: AddressSpace,
): MonsterChunk[] {
  const chunks: MonsterChunk[] = [];
  for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
    const base = chunksOffset + emId * MONSTER_CHUNK_SIZE;
    const hitzones: HitzoneTable[] = [];
    for (let p = 0; p < HITZONE_POINTER_COUNT; p++) {
      const pointer = ovl.reader.u32(base + HITZONE_POINTERS_OFFSET + p * 4);
      if (pointer === 0) continue;
      hitzones.push(readHitzoneTable(space, pointer, emId));
    }
    chunks.push({
      emId,
      baseScale: ovl.reader.f32(base + 0x40),
      hitzones,
      tolerances: readTolerances(ovl, base),
    });
  }
  return chunks;
}

/** PSP user-memory vaddrs: anything a hitzone pointer could reasonably hold. */
const isUserAddress = (v: number) => v >= 0x08800000 && v < 0x0a000000;

function chunkLooksValid(ovl: OvlFile, base: number): boolean {
  const scale = ovl.reader.f32(base + 0x40);
  if (!(scale > 0.01 && scale < 50)) return false;
  return isUserAddress(ovl.reader.u32(base + HITZONE_POINTERS_OFFSET));
}

/**
 * Finds `MonChunk[90]` in a `game_task.ovl` of any region. Every shift of the
 * JP file offset is scored by how many chunks have a sane base scale and a
 * hitzone pointer into user memory; the best score wins, nearest to the JP
 * offset on a tie. Scoring (rather than taking the first shift that passes)
 * matters because a shift of a few whole chunks also passes when the bytes
 * next to the array look like chunks. Returns the file offset and the shift,
 * or null if no shift has more than 77 plausible chunks.
 */
export function locateMonsterChunks(
  ovl: OvlFile,
  range = ovl.reader.length,
): { offset: number; shift: number } | null {
  const jp = GAME_TASK_JP.monsterChunks - GAME_TASK_JP.loadBase + 0x80;
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
