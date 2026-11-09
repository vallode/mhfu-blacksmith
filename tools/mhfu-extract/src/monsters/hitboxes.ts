/**
 * The site's hitbox file for one monster (`public/models/monsters/emNN.hitboxes.json`,
 * written by `export-site`): the collision records (`collision.ts`) moved from
 * joint space into the model's space with the skeleton (`models/ahi.ts`),
 * each named by the site's hitzone parts that use its row.
 */
import type { CollisionRecord, Vec3 } from "./collision.js";
import type { Bone } from "../models/ahi.js";
import { detachedBoneOffsets, isRigidBone } from "../models/attach.js";

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

export interface SiteHitboxes {
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

export interface JointPositions {
  /** Model-space position of each joint whose chain is rigid. */
  positions: Map<number, Vec3>;
  /** Joints with a rotated or scaled bone on the way from the root. */
  rotated: Set<number>;
}

/**
 * Bind-pose position of each joint: the translations summed from the root,
 * as the mesh's vertices are (see attach.ts). Only exact while every bone on
 * the way is unrotated and unscaled; a capsule's offsets are in its joint's
 * frame too, so joints with a rotated or scaled bone anywhere up their
 * chain (Yian Garuga's crest, Basarios's neck) are left out. A parentless
 * severed-tail chain moves onto the tail with the tail tip's vertices.
 */
export function jointPositions(bones: Bone[]): JointPositions {
  const offsets = detachedBoneOffsets(bones);
  const positions = new Map<number, Vec3>();
  const rotated = new Set<number>();
  for (const bone of bones) {
    const sum: Vec3 = [...(offsets.get(bone.id) ?? [0, 0, 0])];
    let rigid = true;
    // Bounded by the bone count, in case the parents loop.
    for (let b: Bone | undefined = bone, n = 0; b && n <= bones.length; n++) {
      if (!isRigidBone(b)) rigid = false;
      b.translation.forEach((c, k) => (sum[k] = sum[k]! + c));
      b = b.parent >= 0 ? bones[b.parent] : undefined;
    }
    if (rigid) positions.set(bone.id, sum);
    else rotated.add(bone.id);
  }
  return { positions, rotated };
}

export function buildSiteHitboxes(
  records: CollisionRecord[],
  joints: JointPositions,
  slots: HitzoneSlots = {},
): { hitboxes: SiteHitboxes; skipped: string[] } {
  const partsByRow = new Map<number, string[]>();
  for (const [part, [, row]] of Object.entries(slots)) {
    const parts = partsByRow.get(row) ?? [];
    if (!parts.includes(part)) parts.push(part);
    partsByRow.set(row, parts);
  }
  const capsules: SiteCapsule[] = [];
  const skipped: string[] = [];
  records.forEach((record, i) => {
    const origin = joints.positions.get(record.joint);
    if (!origin) {
      skipped.push(
        joints.rotated.has(record.joint)
          ? `record ${i}: joint ${record.joint} has a rotated or scaled bone in its chain`
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
    const place = (offset: Vec3) => offset.map((v, k) => round(origin[k]! + v)) as Vec3;
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
  return { hitboxes: { capsules }, skipped };
}
