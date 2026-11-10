/**
 * Monster motions (motion.ts) as glTF-ready animation clips: per bone, a
 * translation, rotation (quaternion) and scale track sampled at every frame
 * and thinned to the keys that glTF's interpolation (linear, spherical for
 * rotations) can't rebuild within a small tolerance. One clip per motion slot: the body, head and tail
 * motions in the same slot play together (see motion.ts).
 *
 * Rotations are Euler angles applied X, then Y, then Z (q = qz * qy * qx),
 * the same for the skeleton's bind pose; the order isn't confirmed (see
 * motion.ts), but it makes no visible difference in the motions checked.
 */
import type { Bone } from "./ahi.js";
import { partMotions, sampleChannel, type Motion } from "./motion.js";

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

/**
 * Motion frames per second. Motions count frames at 60 a second, which the
 * game, running at 30, steps two at a time: 9,972 of the disc's 9,995
 * motions last an even number of frames (see motion.ts).
 */
export const FRAMES_PER_SECOND = 60;

export interface Track {
  bone: number;
  path: "translation" | "rotation" | "scale";
  /** Seconds. */
  times: number[];
  /** 3 (translation, scale) or 4 (rotation, x y z w) numbers per key. */
  values: number[];
}

export interface Clip {
  /** Motion slot, numbered as the game does within each part. */
  slot: number;
  /** Seconds. */
  duration: number;
  loop: boolean;
  /** Seconds; where the game restarts a looping motion. */
  loopStart: number;
  tracks: Track[];
}

export interface ClipOptions {
  /** Largest rotation error, radians. Default 0.002 (~0.1 degree). */
  rotationTolerance?: number;
  /** Largest translation error, model units. Default 0.02. */
  translationTolerance?: number;
  /** Largest scale error. Default 0.001. */
  scaleTolerance?: number;
}

/** Quaternion for Euler angles applied X, then Y, then Z. */
export function eulerToQuat([x, y, z]: Vec3): Quat {
  const [sx, cx] = [Math.sin(x / 2), Math.cos(x / 2)];
  const [sy, cy] = [Math.sin(y / 2), Math.cos(y / 2)];
  const [sz, cz] = [Math.sin(z / 2), Math.cos(z / 2)];
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

const lerp = (a: readonly number[], b: readonly number[], t: number): number[] =>
  a.map((c, k) => c + (b[k]! - c) * t);

/** Angle between two unit quaternions. */
function quatAngle(a: readonly number[], b: readonly number[]): number {
  const dot = Math.abs(a.reduce((s, c, k) => s + c * b[k]!, 0));
  return 2 * Math.acos(Math.min(1, dot));
}

/** Spherical interpolation, as glTF players turn rotation keys. */
function slerp(a: readonly number[], b: readonly number[], t: number): number[] {
  let dot = a.reduce((s, c, k) => s + c * b[k]!, 0);
  const sign = dot < 0 ? -1 : 1;
  dot *= sign;
  if (dot > 0.9995) {
    // Nearly equal: normalized linear interpolation is as good and stable.
    const q = a.map((c, k) => c + (sign * b[k]! - c) * t);
    const length = Math.hypot(...q);
    return q.map((c) => c / length);
  }
  const angle = Math.acos(dot);
  const wa = Math.sin((1 - t) * angle) / Math.sin(angle);
  const wb = (sign * Math.sin(t * angle)) / Math.sin(angle);
  return a.map((c, k) => c * wa + b[k]! * wb);
}

/**
 * Indices of the keys to keep from `values` (one per frame) so that linear
 * interpolation between kept keys stays within `tolerance` of every frame.
 */
export function keepKeys(
  values: readonly (readonly number[])[],
  error: (a: readonly number[], b: readonly number[]) => number,
  interpolate: (a: readonly number[], b: readonly number[], t: number) => number[],
  tolerance: number,
): number[] {
  const last = values.length - 1;
  /** Whether the segment start..end rebuilds every frame inside it closely enough. */
  const fits = (start: number, end: number): boolean => {
    for (let i = start + 1; i < end; i++) {
      const t = (i - start) / (end - start);
      if (error(interpolate(values[start]!, values[end]!, t), values[i]!) > tolerance) return false;
    }
    return true;
  };
  const kept = [0];
  let start = 0;
  while (start < last) {
    // The segment's end: doubling its length until it no longer fits, then
    // bisecting, so a long steady stretch costs O(n log n) checks, not O(n^2).
    let good = start + 1;
    let bad = -1;
    for (let length = 2; good < last; length *= 2) {
      const end = Math.min(last, start + length);
      if (!fits(start, end)) {
        bad = end;
        break;
      }
      good = end;
    }
    while (bad !== -1 && bad - good > 1) {
      const mid = (good + bad) >> 1;
      if (fits(start, mid)) good = mid;
      else bad = mid;
    }
    kept.push(good);
    start = good;
  }
  return kept;
}

const distance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(...a.map((c, k) => c - b[k]!));

/** The bones of each skeleton part, in skeleton order (a part's motions animate them in this order). */
export function bonesByPart(bones: readonly Bone[]): number[][] {
  const parts: number[][] = [];
  for (const bone of bones) (parts[bone.part] ??= []).push(bone.id);
  return parts;
}

/**
 * The clips for a skeleton from its motion bank's tables. A part's motion
 * whose bone count isn't the part's (three of em82's) is left out.
 */
export function buildClips(
  bones: readonly Bone[],
  tables: (Motion | null)[][],
  options: ClipOptions = {},
): Clip[] {
  const rotationTolerance = options.rotationTolerance ?? 0.002;
  const translationTolerance = options.translationTolerance ?? 0.02;
  const scaleTolerance = options.scaleTolerance ?? 0.001;
  const parts = bonesByPart(bones);
  const byPart = parts.map((_, p) => partMotions(tables, p));
  const slots = Math.max(0, ...byPart.map((m) => m.length));

  const clips: Clip[] = [];
  for (let slot = 0; slot < slots; slot++) {
    // Bone -> its motion channels, from every part with a motion in this slot.
    const animated = new Map<number, Motion["bones"][number]>();
    const motions: Motion[] = [];
    byPart.forEach((list, p) => {
      const motion = list[slot];
      if (!motion || motion.bones.length !== parts[p]!.length) return;
      motions.push(motion);
      parts[p]!.forEach((bone, i) => animated.set(bone, motion.bones[i]!));
    });
    if (motions.length === 0) continue;
    const frames = Math.max(...motions.map((m) => m.frames));
    const tracks: Track[] = [];
    for (const [id, channels] of animated) {
      if (channels.length === 0) continue;
      const bone = bones[id]!;
      const sampled = { scale: [] as Vec3[], rotation: [] as Quat[], translation: [] as Vec3[] };
      for (let frame = 0; frame <= frames; frame++) {
        const value = {
          scale: [...bone.scale] as Vec3,
          rotation: [...bone.rotation] as Vec3,
          translation: [...bone.translation] as Vec3,
        };
        for (const channel of channels)
          value[channel.property][channel.axis] = sampleChannel(channel.keys, frame);
        sampled.scale.push(value.scale);
        sampled.translation.push(value.translation);
        const q = eulerToQuat(value.rotation);
        // Keep each key on the same side as the last, so interpolation takes the short way.
        const last = sampled.rotation.at(-1);
        if (last && q.reduce((s, c, k) => s + c * last[k]!, 0) < 0)
          q.forEach((c, k) => (q[k] = -c));
        sampled.rotation.push(q);
      }
      const bind = {
        scale: bone.scale,
        rotation: eulerToQuat(bone.rotation),
        translation: bone.translation,
      };
      for (const path of ["translation", "rotation", "scale"] as const) {
        if (!channels.some((c) => c.property === path)) continue;
        const values: readonly (readonly number[])[] = sampled[path];
        const [error, interpolate, tolerance] =
          path === "rotation"
            ? [quatAngle, slerp, rotationTolerance]
            : [distance, lerp, path === "scale" ? scaleTolerance : translationTolerance];
        // A track that never leaves the bind pose adds nothing.
        if (values.every((v) => error(v, bind[path]) <= tolerance)) continue;
        const keys = keepKeys(values, error, interpolate, tolerance);
        if (keys.length === 2 && error(values[0]!, values.at(-1)!) <= tolerance) keys.pop();
        tracks.push({
          bone: id,
          path,
          times: keys.map((k) => k / FRAMES_PER_SECOND),
          values: keys.flatMap((k) => [...values[k]!]),
        });
      }
    }
    const lead = motions[0]!;
    clips.push({
      slot,
      duration: frames / FRAMES_PER_SECOND,
      loop: lead.loop,
      loopStart: lead.loopStart / FRAMES_PER_SECOND,
      tracks,
    });
  }
  return clips;
}

/** A 4x4 matrix, column-major (glTF's order). */
export type Mat4 = number[];

/** Translation, rotation and scale as one matrix (T * R * S). */
export function composeMatrix(translation: Vec3, rotation: Quat, scale: Vec3): Mat4 {
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    ...translation,
    1,
  ];
}

export function multiplyMatrices(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) out[col * 4 + row]! += a[k * 4 + row]! * b[col * 4 + k]!;
  return out;
}

/** Inverse of an affine matrix (last row 0 0 0 1). */
export function invertAffine(m: Mat4): Mat4 {
  const [a, b, c, , d, e, f, , g, h, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
  const r = [
    (e * i - f * h) / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    (f * g - d * i) / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    (d * h - e * g) / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
  const [tx, ty, tz] = [m[12]!, m[13]!, m[14]!];
  return [
    r[0]!,
    r[1]!,
    r[2]!,
    0,
    r[3]!,
    r[4]!,
    r[5]!,
    0,
    r[6]!,
    r[7]!,
    r[8]!,
    0,
    -(r[0]! * tx + r[3]! * ty + r[6]! * tz),
    -(r[1]! * tx + r[4]! * ty + r[7]! * tz),
    -(r[2]! * tx + r[5]! * ty + r[8]! * tz),
    1,
  ];
}

/** Each bone's bind-pose transform from its own space to model space (invert for glTF's inverse bind matrices). */
export function bindMatrices(bones: readonly Bone[]): Mat4[] {
  const world: Mat4[] = [];
  const resolve = (id: number): Mat4 => {
    const cached = world[id];
    if (cached) return cached;
    const bone = bones[id]!;
    const local = composeMatrix(bone.translation, eulerToQuat(bone.rotation), bone.scale);
    return (world[id] = bone.parent >= 0 ? multiplyMatrices(resolve(bone.parent), local) : local);
  };
  return bones.map((bone) => resolve(bone.id));
}
