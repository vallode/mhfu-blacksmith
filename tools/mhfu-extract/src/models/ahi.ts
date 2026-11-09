/**
 * `.ahi` skeleton (bone hierarchy) used by monster packages: entry 0 of
 * `emmodel/emNN.pac`, before the PMO it animates (and again before a
 * package's second PMO). Layout worked out from real MHFU EU files:
 *
 * Header: u32 0xC0000000, u32 ?, u32 size, u32 0, u32 ?, u32 header length
 *   (bones start at 0x0c + this), then optional words (0x1c holds the
 *   number of bones in the main hierarchy when present).
 * Bone (0x10c bytes): u32 0x40000001, u32 1, u32 record size, s32 id,
 *   s32 parent, s32 first child, s32 next sibling (-1 = none),
 *   f32[4] scale, f32[4] rotation, f32[4] translation (each with a 4th
 *   component of 1), s32 ?, u8 part, then runtime space (zero on disc).
 *
 * `part` groups bones the game treats as a unit: 0 the body, 1 the head
 * chain, 2 the tail chain, 3 a second, parentless copy of the tail tip.
 * That copy is what the game shows as the severed tail: the PMO's tail tip
 * is skinned to it and modelled around the origin, not on the monster (see
 * attach.ts).
 */
import { BinaryReader } from "../binary/reader.js";

export interface Bone {
  id: number;
  /** -1 for a root. */
  parent: number;
  scale: [number, number, number];
  rotation: [number, number, number];
  /** Offset from the parent, in model units. */
  translation: [number, number, number];
  part: number;
}

const MAGIC = 0xc0000000;
const BONE_MAGIC = 0x40000001;
const BONE_SIZE = 0x10c;

export function isAhi(buf: Buffer): boolean {
  return buf.length >= 0x20 && buf.readUInt32LE(0) === MAGIC;
}

export function readAhi(buf: Buffer): Bone[] {
  if (!isAhi(buf)) throw new Error("Not an .ahi skeleton");
  const reader = new BinaryReader(buf);
  const bones: Bone[] = [];
  for (
    let at = 0x0c + reader.u32(0x14);
    at + BONE_SIZE <= buf.length && reader.u32(at) === BONE_MAGIC;
    at += reader.u32(at + 8)
  ) {
    const vec = (offset: number): [number, number, number] => [
      reader.f32(at + offset),
      reader.f32(at + offset + 4),
      reader.f32(at + offset + 8),
    ];
    const id = reader.s32(at + 0x0c);
    if (id !== bones.length) throw new Error(`Bone ${bones.length} has id ${id}`);
    bones.push({
      id,
      parent: reader.s32(at + 0x10),
      scale: vec(0x1c),
      rotation: vec(0x2c),
      translation: vec(0x3c),
      part: reader.u8(at + 0x50),
    });
  }
  if (bones.length === 0) throw new Error("Skeleton has no bones");
  return bones;
}
