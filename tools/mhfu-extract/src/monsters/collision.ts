/**
 * Monster hitboxes: the table `CollisionPTR` (`MonChunk` `+0x50`) points to.
 * Worked out from Rathian (table in its own `overlay/em01.ovl`) and Kelbi
 * (in `game_task.ovl`) on the EU disc, by drawing the records over the
 * models (see the README's "Monster hitboxes").
 *
 * 0x28-byte records up to one whose joint is 0xFFFF:
 *   0x00 u16 joint (into the model's skeleton, `models/skeleton.ts`)
 *   0x02 u16 unknown flag (0 or 1)
 *   0x04 u16 hitzone row, into the monster's `HitzoneTbl` rows
 *   0x06 u16 body part (left and right separate, e.g. Rathian's wings 1/2)
 *   0x08 u32 unknown flags
 *   0x0C f32 radius, then f32[3] start and f32[3] end, relative to the joint
 *
 * Each record is a capsule: a sphere of the radius swept from start to end.
 * Rathian's two records on joint 1 (row 0, flags 5 and 0x300) sit around
 * the body's centre, not the head, and are probably for body collision
 * rather than damage; `hitboxes.ts` leaves them out by their flags.
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

/** Reads one monster's collision records through its chunk's `CollisionPTR`. */
export function readMonsterCollision(
  gameTask: OvlFile,
  chunksOffset: number,
  emId: number,
  emOvl: OvlFile | undefined,
): CollisionRecord[] | null {
  const pointer = gameTask.reader.u32(
    chunksOffset + emId * MONSTER_CHUNK_SIZE + COLLISION_POINTER_OFFSET,
  );
  const target = resolveChunkPointer(pointer, gameTask, emOvl);
  return target ? readCollisionRecords(target.ovl.reader, target.offset) : null;
}
