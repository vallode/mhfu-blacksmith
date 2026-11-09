/**
 * The site's hitbox file for one monster (`public/models/monsters/emNN.hitboxes.json`,
 * written by `export-site`): the collision records (`collision.ts`) moved from
 * joint space into the model's space with the skeleton (`models/skeleton.ts`),
 * each named by the site's hitzone parts that use its row.
 */
import type { CollisionRecord } from "./collision.js";
import type { Vec3 } from "../models/skeleton.js";

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
 * Flag bits seen on damage capsules: 0x1 and 0x100 (Rathian's legs, belly
 * and thighs) and 0x08000000 (its head). Records with any other bit are
 * skipped: on Rathian those are the two root-joint spheres (flags 5 and
 * 0x300) around the body's centre, on row 0 but nowhere near the head, so
 * probably body collision. Each skip is logged, so a damage capsule with a
 * new flag shows up in the export log rather than going missing silently.
 */
export const DAMAGE_FLAG_BITS = 0x08000101;

export function buildSiteHitboxes(
  records: CollisionRecord[],
  joints: ReadonlyMap<number, Vec3>,
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
    const origin = joints.get(record.joint);
    if (!origin) {
      skipped.push(`record ${i}: joint ${record.joint} isn't in the skeleton`);
      return;
    }
    if (!(record.radius > 0) || ![...record.start, ...record.end].every(Number.isFinite)) {
      skipped.push(`record ${i}: no size (radius ${record.radius})`);
      return;
    }
    if ((record.flags & ~DAMAGE_FLAG_BITS) >>> 0 !== 0) {
      skipped.push(
        `record ${i}: flags 0x${record.flags.toString(16)} aren't a damage capsule's (joint ${record.joint}, row ${record.row})`,
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
