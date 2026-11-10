/**
 * The site's hurtbox file for one monster (`public/models/monsters/emNN.hurtboxes.json`,
 * written by `export-site`): the collision records (`collision.ts`) moved from
 * joint space into the model's space with the skeleton (`models/ahi.ts`),
 * each named by the site's hitzone parts that use its row.
 */
import type { CollisionRecord, Vec3 } from "./collision.js";
import type { Bone } from "../models/ahi.js";
import { detachedBoneOffsets, isUnrotatedBone } from "../models/attach.js";

export interface SiteCapsule {
  /** Hitzone row (into each of the monster's hitzone tables). */
  row: number;
  /** The site's hitzone parts on that row, from every table (e.g. "chest" and "chest-broken"). */
  parts: string[];
  /** Body part number (left and right separate). */
  part: number;
  /** The record's unknown flags word; see `collision.ts`. */
  flags: number;
  radius: number;
  /** Capsule ends in model space, the GLB's units. */
  start: Vec3;
  end: Vec3;
}

export interface SiteHurtboxes {
  capsules: SiteCapsule[];
}

/** Hitzone part -> [table, row], as in `overlay/monsters.json`. */
export type HitzoneSlots = Record<string, [number, number]>;

const round = (v: number) => Math.round(v * 10) / 10;

/**
 * Flag bits of the root-joint spheres that are probably body collision, not
 * damage: every monster exported so far has one or two (flags 5 and 0x300,
 * on joint 1 or 2) around the body's centre, on a row that doesn't fit the
 * place (Rathian's on row 0, her head's). No damage capsule seen has bit
 * 0x4 or 0x200; the other bits (0x1, 0x2, 0x100, 0x20000, 0x40000, ...)
 * appear on whole bodies and are kept. Each skip is logged.
 */
export const BODY_COLLISION_FLAG_BITS = 0x204;

/** A joint's bind-pose frame without rotation: where it is, and its scale along each axis. */
export interface JointFrame {
  origin: Vec3;
  scale: Vec3;
}

export interface JointPositions {
  /** Each joint whose chain is unrotated. */
  frames: Map<number, JointFrame>;
  /** Joints with a rotated bone on the way from the root. */
  rotated: Set<number>;
}

/**
 * Bind-pose frame of each joint, the same space as the mesh's vertices (see
 * attach.ts): each bone's translation is in its parent's frame, so scaled by
 * the parent's scale, and scales multiply down the chain. Gravios's and
 * Basarios's neck base scales to 0.77 along z; that shortens the neck, and
 * only then do the eye and jaw joints land inside the head.
 *
 * Rotations aren't handled (their format is unknown), so joints with a
 * rotated bone anywhere up their chain are left out (none under a capsule
 * on the EU disc; noise up to 0.01 rad is ignored). A
 * parentless severed-tail chain moves onto the tail with the tail tip's
 * vertices.
 */
export function jointPositions(bones: Bone[]): JointPositions {
  const offsets = detachedBoneOffsets(bones);
  const frames = new Map<number, JointFrame>();
  const rotated = new Set<number>();
  const visit = (id: number, depth: number): JointFrame | null => {
    const known = frames.get(id);
    if (known) return known;
    const bone = bones[id];
    // Bounded by the bone count, in case the parents loop.
    if (!bone || rotated.has(id) || depth > bones.length) return null;
    const parent = bone.parent >= 0 ? visit(bone.parent, depth + 1) : null;
    if ((bone.parent >= 0 && !parent) || !isUnrotatedBone(bone)) {
      rotated.add(id);
      return null;
    }
    const base = parent ?? { origin: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3 };
    const frame: JointFrame = {
      origin: base.origin.map((c, k) => c + base.scale[k]! * bone.translation[k]!) as Vec3,
      scale: base.scale.map((c, k) => c * bone.scale[k]!) as Vec3,
    };
    frames.set(id, frame);
    return frame;
  };
  for (const bone of bones) visit(bone.id, 0);
  for (const [id, offset] of offsets) {
    const frame = frames.get(id);
    if (frame) frame.origin = frame.origin.map((c, k) => c + offset[k]!) as Vec3;
  }
  return { frames, rotated };
}

export function buildSiteHurtboxes(
  records: CollisionRecord[],
  joints: JointPositions,
  slots: HitzoneSlots = {},
): { hurtboxes: SiteHurtboxes; skipped: string[] } {
  const partsByRow = new Map<number, string[]>();
  for (const [part, [, row]] of Object.entries(slots)) {
    const parts = partsByRow.get(row) ?? [];
    if (!parts.includes(part)) parts.push(part);
    partsByRow.set(row, parts);
  }
  const capsules: SiteCapsule[] = [];
  const skipped: string[] = [];
  records.forEach((record, i) => {
    const frame = joints.frames.get(record.joint);
    if (!frame) {
      skipped.push(
        joints.rotated.has(record.joint)
          ? `record ${i}: joint ${record.joint} has a rotated bone in its chain`
          : `record ${i}: joint ${record.joint} isn't in the skeleton`,
      );
      return;
    }
    if (!(record.radius > 0) || ![...record.start, ...record.end].every(Number.isFinite)) {
      skipped.push(`record ${i}: no size (radius ${record.radius})`);
      return;
    }
    if (record.flags & BODY_COLLISION_FLAG_BITS) {
      skipped.push(
        `record ${i}: flags 0x${record.flags.toString(16)} mark body collision (joint ${record.joint}, row ${record.row})`,
      );
      return;
    }
    // Offsets are in the joint's frame; the radius isn't scaled, as a sphere
    // under a non-uniform scale would no longer be one.
    const place = (offset: Vec3) =>
      offset.map((v, k) => round(frame.origin[k]! + frame.scale[k]! * v)) as Vec3;
    capsules.push({
      row: record.row,
      parts: partsByRow.get(record.row) ?? [],
      part: record.part,
      flags: record.flags,
      radius: round(record.radius),
      start: place(record.start),
      end: place(record.end),
    });
  });
  return { hurtboxes: { capsules }, skipped };
}
