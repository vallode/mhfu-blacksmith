/**
 * Monster hitboxes: the table `CollisionPTR` (`MonChunk` `+0x50`) points to.
 * Worked out from Rathian (table in its own `overlay/em01.ovl`) and Kelbi
 * (in `game_task.ovl`) on the EU disc, by drawing the records over the
 * models (see the README's "Monster hitboxes").
 *
 * 0x28-byte records up to one whose joint is 0xFFFF:
 *   0x00 u16 joint (a bone of the model's skeleton, `models/ahi.ts`)
 *   0x02 u16 unknown flag (0 or 1)
 *   0x04 u16 hitzone row, into the monster's `HitzoneTbl` rows
 *   0x06 u16 body part (left and right separate, e.g. Rathian's wings 1/2)
 *   0x08 u32 unknown flags
 *   0x0C f32 radius, then f32[3] start and f32[3] end, relative to the joint
 *
 * Each record is a capsule: a sphere of the radius swept from start to end.
 * Every monster has one or two records on its root joint (flags 5 and
 * 0x300) around the body's centre, probably for body collision rather than
 * damage; `hitboxes.ts` leaves them out by their flags.
 */
import type { OvlFile } from "../container/ovl.js";
import type { BinaryReader } from "../binary/reader.js";
import { MONSTER_CHUNK_SIZE } from "./hitzones.js";

/** `CollisionPTR` in `emChunk`, after BaseScale (+0x40), the shadow scales and one float. */
export const COLLISION_POINTER_OFFSET = 0x50;
export const COLLISION_RECORD_SIZE = 0x28;
const END_JOINT = 0xffff;
/** Sanity limit: Rathian has 33. */
const MAX_RECORDS = 256;

/** PSP user-memory vaddrs: anything a chunk pointer could reasonably hold. */
export const isUserAddress = (v: number) => v >= 0x08800000 && v < 0x0a000000;

export interface ResolvedPointer {
  file: "game_task" | "em_ovl";
  ovl: OvlFile;
  offset: number;
}

/** Resolves a chunk pointer into `game_task.ovl` or the monster's own `emNN.ovl`. */
export function resolveChunkPointer(
  vaddr: number,
  gameTask: OvlFile,
  emOvl: OvlFile | undefined,
): ResolvedPointer | null {
  if (!isUserAddress(vaddr)) return null;
  if (gameTask.isOwnVaddr(vaddr))
    return { file: "game_task", ovl: gameTask, offset: gameTask.vaddrToOffset(vaddr) };
  if (emOvl?.isOwnVaddr(vaddr))
    return { file: "em_ovl", ovl: emOvl, offset: emOvl.vaddrToOffset(vaddr) };
  return null;
}

export type Vec3 = [number, number, number];

export interface CollisionRecord {
  joint: number;
  flag: number;
  row: number;
  part: number;
  flags: number;
  radius: number;
  start: Vec3;
  end: Vec3;
}

/** Reads records at a file offset up to the 0xFFFF end marker. Null if there is none. */
export function readCollisionRecords(
  reader: BinaryReader,
  offset: number,
): CollisionRecord[] | null {
  const records: CollisionRecord[] = [];
  const vec = (at: number): Vec3 => [reader.f32(at), reader.f32(at + 4), reader.f32(at + 8)];
  for (let at = offset; records.length <= MAX_RECORDS; at += COLLISION_RECORD_SIZE) {
    if (at + 2 > reader.length) return null;
    const joint = reader.u16(at);
    if (joint === END_JOINT) return records;
    if (at + COLLISION_RECORD_SIZE > reader.length) return null;
    records.push({
      joint,
      flag: reader.u16(at + 2),
      row: reader.u16(at + 4),
      part: reader.u16(at + 6),
      flags: reader.u32(at + 8),
      radius: reader.f32(at + 0x0c),
      start: vec(at + 0x10),
      end: vec(at + 0x1c),
    });
  }
  return null;
}

/** Joint number of placeholder records (no size) between real ones. */
export const PLACEHOLDER_JOINT = 125;
/** Generous bounds for a real record, in model units (Rathian is ~1600 long). */
const MAX_RADIUS = 2000;
const MAX_OFFSET = 10000;
const MAX_ROW = 16;

/**
 * True if `records` look like a collision table for a skeleton of
 * `jointCount` joints: every record is a placeholder or a capsule of sane
 * size on one of its joints, and at least one is a capsule. A pointer read
 * from the wrong overlay hits unrelated bytes, which practically never pass.
 */
export function fitsSkeleton(records: CollisionRecord[], jointCount: number): boolean {
  let capsules = 0;
  for (const record of records) {
    if (record.joint === PLACEHOLDER_JOINT) continue;
    const sane =
      record.joint < jointCount &&
      record.row < MAX_ROW &&
      record.radius > 0 &&
      record.radius < MAX_RADIUS &&
      [...record.start, ...record.end].every((c) => Number.isFinite(c) && Math.abs(c) < MAX_OFFSET);
    if (!sane) return false;
    capsules++;
  }
  return capsules > 0;
}

export type MonsterCollision =
  | {
      records: CollisionRecord[];
      /** emID whose overlay held the table, when it isn't the monster's own. */
      borrowedFrom?: number;
    }
  | { error: string };

const emName = (id: number) => `em${String(id).padStart(2, "0")}.ovl`;

/**
 * Reads one monster's collision records through its chunk's `CollisionPTR`,
 * checked against its skeleton (`jointCount` joints).
 *
 * The pointer leads into `game_task.ovl`, the monster's own `emNN.ovl`, or,
 * for monsters without one (variants such as Pink Rathian, and species such
 * as Rathalos), into another monster's overlay that the game loads for
 * them: per-monster overlays share load addresses, so the address alone
 * doesn't say which. In that case `emOvls` (every `emNN.ovl` by emID) are
 * tried: first those of monsters whose own chunk holds the same pointer,
 * then the rest; the table must fit the skeleton and be the only distinct
 * one that does.
 */
export function readMonsterCollision(
  gameTask: OvlFile,
  chunksOffset: number,
  emId: number,
  emOvls: ReadonlyMap<number, OvlFile>,
  jointCount: number,
): MonsterCollision {
  const pointerOf = (id: number) =>
    gameTask.reader.u32(chunksOffset + id * MONSTER_CHUNK_SIZE + COLLISION_POINTER_OFFSET);
  const pointer = pointerOf(emId);
  const read = (ovl: OvlFile) => {
    const records = readCollisionRecords(ovl.reader, ovl.vaddrToOffset(pointer));
    return records && fitsSkeleton(records, jointCount) ? records : null;
  };
  if (!isUserAddress(pointer)) return { error: "no CollisionPTR" };
  if (gameTask.isOwnVaddr(pointer)) {
    const records = read(gameTask);
    return records ? { records } : { error: "the table in game_task.ovl doesn't fit the skeleton" };
  }
  const own = emOvls.get(emId);
  if (own?.isOwnVaddr(pointer)) {
    const records = read(own);
    return records
      ? { records }
      : { error: `the table in ${emName(emId)} doesn't fit the skeleton` };
  }
  const holders = [...emOvls].filter(([, ovl]) => ovl.isOwnVaddr(pointer));
  if (holders.length === 0) return { error: "CollisionPTR is outside every overlay" };
  // Monsters whose own chunk holds the same pointer read it from their own overlay.
  const sharing = holders.filter(([id]) => id !== emId && pointerOf(id) === pointer);
  for (const [id, ovl] of sharing) {
    const records = read(ovl);
    if (records) return { records, borrowedFrom: id };
  }
  const fits = holders
    .map(([id, ovl]) => ({ id, records: read(ovl) }))
    .filter((c): c is { id: number; records: CollisionRecord[] } => c.records !== null);
  const distinct = new Map(fits.map((c) => [JSON.stringify(c.records), c]));
  if (distinct.size === 1) {
    const [only] = distinct.values();
    return { records: only!.records, borrowedFrom: only!.id };
  }
  return {
    error:
      fits.length === 0
        ? `no overlay holds a table at the pointer that fits the skeleton (tried ${holders.map(([id]) => emName(id)).join(", ")})`
        : `tables in ${fits.map((c) => emName(c.id)).join(", ")} all fit the skeleton`,
  };
}
