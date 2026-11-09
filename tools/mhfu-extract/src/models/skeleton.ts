/**
 * Skeleton entry of a model package (`emmodel/emNN.pac` index 0, and the
 * second PMO's at index 4 on large monsters). Worked out from Rathian and
 * Kelbi on the EU disc:
 *
 *   0x00 u32 0xC0000000   0x04 u32 joint count + 1   0x08 u32 entry size
 *   0x0C u32 0, then a 0x10-byte block of unknown use, then one 0x10C-byte
 *   record per joint:
 *     0x00 u32 0x40000001  0x04 u32 1  0x08 u32 record size (0x10C)
 *     0x0C u32 joint id    0x10 u32 parent, 0x14 first child, 0x18 next
 *          sibling (0xFFFFFFFF = none)
 *     0x1C f32[4] scale    0x2C f32[4] rotation   0x3C f32[4] translation
 *          (each w = 1; translation relative to the parent)
 *     0x4C u32 0xFFFFFFFF  0x50 u32 chain (0 body, 1 neck and head, 2 tail,
 *          3 a separate tail root, probably the severed tail on Rathian)
 *     rest zero.
 *
 * Every joint seen so far has zero rotation and unit scale, so a joint's
 * model-space position is the sum of the translations down from the root:
 * the same space as the PMO's vertices (the converted mesh is the bind pose).
 * The rotation's format (Euler angles or a quaternion) is unknown, so
 * `jointPositions` refuses skeletons with any.
 */
import { BinaryReader } from "../binary/reader.js";

const MAGIC = 0xc0000000;
const JOINT_MAGIC = 0x40000001;
const JOINT_SIZE = 0x10c;
const NONE = 0xffffffff;

export type Vec3 = [number, number, number];

export interface Joint {
  id: number;
  parent: number | null;
  scale: Vec3;
  rotation: Vec3;
  translation: Vec3;
  chain: number;
}

export function isSkeleton(buf: Buffer): boolean {
  return buf.length >= 0x20 + JOINT_SIZE && buf.readUInt32LE(0) === MAGIC;
}

export function readSkeleton(buf: Buffer): Joint[] {
  if (!isSkeleton(buf)) throw new Error("Not a skeleton (expected 0xC0000000)");
  const reader = new BinaryReader(buf);
  const vec = (at: number): Vec3 => [reader.f32(at), reader.f32(at + 4), reader.f32(at + 8)];
  const joints: Joint[] = [];
  // Joints start after the header and the unknown block; find the first record.
  let at = 0x10;
  while (at + 4 <= buf.length && reader.u32(at) !== JOINT_MAGIC) at += 4;
  while (at + JOINT_SIZE <= buf.length && reader.u32(at) === JOINT_MAGIC) {
    const size = reader.u32(at + 8);
    if (size < 0x54) throw new Error(`Joint record at 0x${at.toString(16)} is ${size} bytes`);
    const parent = reader.u32(at + 0x10);
    joints.push({
      id: reader.u32(at + 0x0c),
      parent: parent === NONE ? null : parent,
      scale: vec(at + 0x1c),
      rotation: vec(at + 0x2c),
      translation: vec(at + 0x3c),
      chain: reader.u32(at + 0x50),
    });
    at += size;
  }
  if (joints.length === 0) throw new Error("Skeleton has no joint records");
  return joints;
}

/**
 * Model-space position of every joint in the bind pose. Throws if a joint
 * is rotated or scaled (not seen yet, and the rotation format is unknown),
 * or if a parent is missing or the hierarchy loops.
 */
export function jointPositions(joints: Joint[]): Map<number, Vec3> {
  const byId = new Map(joints.map((joint) => [joint.id, joint]));
  for (const joint of joints) {
    if (joint.rotation.some((v) => Math.abs(v) > 1e-4))
      throw new Error(`Joint ${joint.id} is rotated (${joint.rotation.join(", ")})`);
    if (joint.scale.some((v) => Math.abs(v - 1) > 1e-4))
      throw new Error(`Joint ${joint.id} is scaled (${joint.scale.join(", ")})`);
  }
  const positions = new Map<number, Vec3>();
  const resolve = (id: number, depth: number): Vec3 => {
    const known = positions.get(id);
    if (known) return known;
    const joint = byId.get(id);
    if (!joint) throw new Error(`Joint ${id} is missing`);
    if (depth > joints.length) throw new Error(`Joint ${id}'s parents loop`);
    const base: Vec3 = joint.parent === null ? [0, 0, 0] : resolve(joint.parent, depth + 1);
    const position = base.map((v, i) => v + joint.translation[i]!) as Vec3;
    positions.set(id, position);
    return position;
  };
  for (const joint of joints) resolve(joint.id, 0);
  return positions;
}
