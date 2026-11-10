/**
 * Monster motion bank: entry 3 of `emmodel/emNN.pac`, the keyframed
 * animations for the package's first skeleton (entry 0, see ahi.ts).
 * Layout worked out from real MHFU EU files; all 89 packages with a bank
 * (em01-em89) parse with it, and Kelbi, Rathian and Cephalos play
 * believably when it drives their skinned meshes.
 *
 * Bank: (u32 count, u32 offset) pairs, ended by a pair with count 0 (its
 *   offset is the end of the tables), then one table per pair: `count` u32
 *   motion offsets (0xffffffff = no motion in that slot). Offsets are from
 *   the start of the bank. Tables come in twos, one pair per skeleton part
 *   (the `part` byte of each bone, ahi.ts): tables 2p and 2p + 1 animate the
 *   bones of part p, motions 0-99 and 100 on. Rathian (em01): 48 bones in
 *   parts of 29 (body), 11 (head), 5 (tail) and 3 (the severable tail tip,
 *   which has no table), six tables. Slots line up across parts: a body
 *   motion and the head and tail motions in the same slot last as long.
 * Motion: u32 0x80000002, u32 bone count (the part's), u32 size, u32 loop
 *   (0 or 1), f32 frame the loop restarts from, then one record per bone of
 *   the part, in skeleton order.
 * Bone: u32 0x80000000 | channel mask, u32 channel count, u32 size, then a
 *   channel per mask bit, lowest first. Bits 0-2 scale x/y/z, 3-5 rotation,
 *   6-8 translation; a missing channel keeps the skeleton's bind value.
 * Channel: u16 bit (one of the mask's), u16 0x8012, u32 key count, u32 size,
 *   then 8-byte keys: s16 value, u16 frame, s16 tangent in, s16 tangent out
 *   (cubic Hermite, value units per frame; mostly the slope between the
 *   neighbouring keys). Values are fixed point: scale and translation 1/16
 *   (16 = 1.0; Kelbi's hip sits 1411/16 = 88 units up, its legs ~80 long),
 *   rotation 0x8000 = pi (keys reach exactly +-0x8000, never beyond).
 *
 * Not yet known: the Euler order (XYZ and ZYX distort meshes alike; most
 * vertices follow one bone) and which of the two tangents is which (they're
 * equal on most keys). Frames are 1/60 s: the game, at 30 fps, advances
 * motions two at a time, and 9,972 of the 9,995 motions on the disc last
 * an even number of frames.
 */
import { BinaryReader } from "../binary/reader.js";

export type MotionProperty = "scale" | "rotation" | "translation";

export interface MotionKey {
  frame: number;
  /** In the property's units: a factor, radians or model units. */
  value: number;
  /** Hermite tangents, in value units per frame. */
  tangentIn: number;
  tangentOut: number;
}

export interface MotionChannel {
  property: MotionProperty;
  axis: 0 | 1 | 2;
  keys: MotionKey[];
}

export interface Motion {
  loop: boolean;
  /** Frame playback returns to on looping. */
  loopStart: number;
  /** Last key frame of any channel. */
  frames: number;
  /** One list of channels per bone of the part, in skeleton order. */
  bones: MotionChannel[][];
}

const MOTION_MAGIC = 0x80000002;
const BONE_FLAG = 0x80000000;
const KEY_FORMAT = 0x8012;
const KEY_SIZE = 8;
const EMPTY = 0xffffffff;
/** Fixed-point unit of scale and translation keys. */
const ONE = 16;
const PROPERTIES: MotionProperty[] = ["scale", "rotation", "translation"];

/** Value of a raw key for a channel bit: scale and translation /16, rotation 0x8000 = pi. */
function unit(bit: number): number {
  return bit >= 3 && bit < 6 ? Math.PI / 0x8000 : 1 / ONE;
}

/** The (count, offset) table directory, without the terminating pair; null if it doesn't fit. */
function readDirectory(reader: BinaryReader): { count: number; offset: number }[] | null {
  const { length } = reader.buf;
  const tables: { count: number; offset: number }[] = [];
  for (let at = 0; at + 8 <= length; at += 8) {
    const count = reader.u32(at);
    const offset = reader.u32(at + 4);
    if (count === 0) return tables.length > 0 && offset <= length ? tables : null;
    if (offset < at + 8 || offset + count * 4 > length || count > 0x1000) return null;
    tables.push({ count, offset });
  }
  return null;
}

export function isMotionBank(buf: Buffer): boolean {
  if (buf.length < 16) return false;
  const reader = new BinaryReader(buf);
  const tables = readDirectory(reader);
  if (!tables || tables[0]!.offset !== (tables.length + 1) * 8) return false;
  const first = tables
    .flatMap(({ count, offset }) =>
      Array.from({ length: count }, (_, k) => reader.u32(offset + k * 4)),
    )
    .find((o) => o !== EMPTY);
  return first !== undefined && first + 4 <= buf.length && reader.u32(first) === MOTION_MAGIC;
}

function readMotion(reader: BinaryReader, at: number): Motion {
  if (reader.u32(at) !== MOTION_MAGIC) throw new Error(`No motion at 0x${at.toString(16)}`);
  const boneCount = reader.u32(at + 4);
  const end = at + reader.u32(at + 8);
  const motion: Motion = {
    loop: reader.u32(at + 0x0c) !== 0,
    loopStart: reader.f32(at + 0x10),
    frames: 0,
    bones: [],
  };
  let p = at + 0x14;
  for (let b = 0; b < boneCount; b++) {
    const tag = reader.u32(p);
    if ((tag & 0xffff0000) >>> 0 !== BONE_FLAG)
      throw new Error(`Motion at 0x${at.toString(16)}: bad bone record at 0x${p.toString(16)}`);
    const count = reader.u32(p + 4);
    const boneEnd = p + reader.u32(p + 8);
    const channels: MotionChannel[] = [];
    let q = p + 12;
    for (let c = 0; c < count; c++) {
      const bit = 31 - Math.clz32(reader.u16(q));
      if (reader.u16(q + 2) !== KEY_FORMAT || bit < 0 || bit > 8 || !(tag & (1 << bit)))
        throw new Error(`Motion at 0x${at.toString(16)}: unknown channel at 0x${q.toString(16)}`);
      const keyCount = reader.u32(q + 4);
      const scale = unit(bit);
      const keys: MotionKey[] = [];
      for (let k = 0; k < keyCount; k++) {
        const key = q + 12 + k * KEY_SIZE;
        keys.push({
          value: reader.s16(key) * scale,
          frame: reader.u16(key + 2),
          tangentIn: reader.s16(key + 4) * scale,
          tangentOut: reader.s16(key + 6) * scale,
        });
      }
      motion.frames = Math.max(motion.frames, keys.at(-1)?.frame ?? 0);
      channels.push({
        property: PROPERTIES[Math.floor(bit / 3)]!,
        axis: (bit % 3) as 0 | 1 | 2,
        keys,
      });
      q += reader.u32(q + 8);
    }
    if (q !== boneEnd)
      throw new Error(`Motion at 0x${at.toString(16)}: bone ${b} ends at 0x${q.toString(16)}`);
    motion.bones.push(channels);
    p = boneEnd;
  }
  if (p !== end) throw new Error(`Motion at 0x${at.toString(16)} ends at 0x${p.toString(16)}`);
  return motion;
}

/** Every table of a bank, in file order, with null for empty slots. */
export function readMotionBank(buf: Buffer): (Motion | null)[][] {
  if (!isMotionBank(buf)) throw new Error("Not a motion bank");
  const reader = new BinaryReader(buf);
  return readDirectory(reader)!.map(({ count, offset }) =>
    Array.from({ length: count }, (_, k) => {
      const at = reader.u32(offset + k * 4);
      return at === EMPTY ? null : readMotion(reader, at);
    }),
  );
}

/** The motions of skeleton part `part`, numbered as the game does: table 2p's, then 2p + 1's. */
export function partMotions(tables: (Motion | null)[][], part: number): (Motion | null)[] {
  return [...(tables[part * 2] ?? []), ...(tables[part * 2 + 1] ?? [])];
}

/** A channel's value at `frame` (cubic Hermite between keys, held before the first and after the last). */
export function sampleChannel(keys: readonly MotionKey[], frame: number): number {
  const first = keys[0];
  if (!first) throw new Error("Channel has no keys");
  if (frame <= first.frame) return first.value;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (frame > b.frame) continue;
    const span = b.frame - a.frame;
    if (span === 0) return b.value;
    const t = (frame - a.frame) / span;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * a.value +
      (t3 - 2 * t2 + t) * span * a.tangentOut +
      (-2 * t3 + 3 * t2) * b.value +
      (t3 - t2) * span * b.tangentIn
    );
  }
  return keys.at(-1)!.value;
}
