/**
 * The weapon stitcher's bows and bowguns: what `blob/stitch.c` does for a
 * gunner frame, as `gunner-assemble.ts`'s gunner forge does it, in integers.
 *
 * A recipe as `rollGunnerRecipe` rolls one, from the frame's class: a body;
 * a heavy bowgun's barrel that meets it; a light bowgun's stock, barrel
 * (slid along the bore onto where the body's own started) and, half the
 * time, crossbow limbs (slid to the frame's limb bone); the quiver or
 * another of the same skeleton; a material over all, or over the barrel and
 * limbs (a bow's quiver).
 *
 * Gunner blocks keep their parts as the drawn weapon has them, each vertex
 * on up to two of its model's bones with their weights. Stitched, each
 * vertex's bones are mapped onto the frame's (`boneMap`), and the vertex is
 * put back into the frame's bind pose (`unpose`): the inverse of the frame's
 * drawn skins blended by its weights, so the drawn weapon looks as the
 * parts did and sheathing folds it the frame's way. Skins are Q14, the
 * inverse is worked out by cofactors in 32-bit integers, as the blob does.
 */
import type { XorShift, Instance } from "./stitch.js";
import {
  GFLAG,
  GROLE,
  GUNNER_CLASS,
  NO_SLOT,
  Q,
  type ForgeLibrary,
  type GunnerRecord,
} from "./stitch-library.js";

export const LIGHT_BOWGUN = GUNNER_CLASS;
export const HEAVY_BOWGUN = GUNNER_CLASS + 1;
export const BOW = GUNNER_CLASS + 2;

export interface GunnerStitchRecipe {
  frame: number;
  body: number;
  stock: number | null;
  barrel: number | null;
  limbs: number | null;
  second: number | null;
  /** Material indices, 1-based; 0 for none. */
  material: number;
  accentMaterial: number;
}

/** Rolls a recipe for the gunner at `frame` (an index entry), or null. */
export function rollGunnerStitch(
  library: ForgeLibrary,
  frame: number,
  rng: XorShift,
): GunnerStitchRecipe | null {
  const { index, records } = library;
  const f = index[frame]!;
  const type = f.type;
  const has = (n: number, flag: number) => (index[n]!.flags & flag) !== 0;
  const having = (flag: number) => {
    const out: number[] = [];
    index.forEach((e, n) => {
      if (e.type === type && has(n, flag)) out.push(n);
    });
    return out;
  };
  const pick = (list: number[]) => (list.length > 0 ? list[rng.int(list.length)]! : null);
  const body = pick(having(GFLAG.body));
  if (body === null) return null;
  let stock: number | null = null;
  let barrel: number | null = null;
  let limbs: number | null = null;
  if (type === HEAVY_BOWGUN) {
    const barrels = having(GFLAG.barrel);
    const meets = records[body]!.gunner!.meets;
    const meeting = barrels.filter((n) => n !== body && meets.includes(n));
    const others = barrels.filter((n) => n !== body);
    barrel = pick(meeting) ?? pick(others) ?? pick(barrels);
    if (barrel === null) return null;
  } else if (type === LIGHT_BOWGUN) {
    stock = pick(having(GFLAG.stock));
    const barrels = having(GFLAG.barrel);
    barrel = pick(barrels.filter((n) => n !== body)) ?? pick(barrels);
    if (barrel === null) return null;
    if (rng.int(100) < 50) limbs = has(body, GFLAG.limbs) ? body : pick(having(GFLAG.limbs));
  }
  let second: number | null = null;
  if (f.flags & GFLAG.secondParts) {
    const donors = having(GFLAG.second).filter((n) => n !== frame && index[n]!.shape === f.shape);
    second = rng.int(100) < 50 ? (pick(donors) ?? frame) : frame;
    if (!has(second, GFLAG.second)) second = pick(donors);
  }
  const roll = rng.int(100);
  const which = 1 + rng.int(8);
  return {
    frame,
    body,
    stock,
    barrel,
    limbs,
    second,
    material: roll < 15 ? which : 0,
    accentMaterial: roll >= 15 && roll < 45 ? which : 0,
  };
}

/** The blocks a gunner recipe places: each slid along z (drawn) by `base`, unposed from `source`'s bones. */
export function placeGunnerStitch(library: ForgeLibrary, r: GunnerStitchRecipe): Instance[] | null {
  const type = library.index[r.frame]!.type;
  const g = (n: number) => library.records[n]!.gunner!;
  const out: Instance[] = [];
  const add = (source: number | null, role: number, shift: number, material: number) => {
    if (source === null) return;
    const block = library.records[source]!.refs[role]![0];
    if (block) {
      out.push({
        block,
        base: shift,
        pivot: 0,
        scale: Q,
        turn: false,
        dx: 0,
        dy: 0,
        bone: -1,
        material,
        handle: false,
        source,
      });
    }
  };
  const all = r.material;
  const accent = r.accentMaterial || r.material;
  add(r.body, GROLE.body, 0, all);
  if (out.length === 0) return null;
  if (type === LIGHT_BOWGUN) {
    add(r.stock, GROLE.stock, 0, all);
    // Along the bore, onto where the body's own barrel started.
    add(r.barrel, GROLE.barrel, g(r.body).barrelStart - g(r.barrel!).barrelStart, accent);
    if (r.limbs !== null) add(r.limbs, GROLE.limbs, g(r.frame).limbZ - g(r.limbs).limbZ, accent);
  } else if (type === HEAVY_BOWGUN) {
    add(r.barrel, GROLE.barrel, 0, accent);
  }
  add(r.second, GROLE.second, 0, type === BOW ? accent : all);
  return out;
}

/**
 * The frame bone a source bone maps to: the same bone where the frame has
 * it under the same parent, else its parent's (`gunner-assemble.ts`'s boneMap).
 */
export function boneMap(source: readonly number[], frame: readonly number[], bone: number): number {
  for (let at = bone; at >= 0 && at < source.length; at = source[at]!) {
    if (at < frame.length && source[at] === frame[at]) return at;
  }
  return 0;
}

/** An int32, or a thrown error where the blob's would overflow. */
const i32 = (x: number) => {
  if (x > 0x7fffffff || x < -0x80000000) throw new Error(`overflow: ${x}`);
  return x;
};

/** a / b rounded half away from zero (b != 0), as the blob's. */
export function rdiv(a: number, b: number): number {
  const q = Math.floor((Math.abs(a) + Math.floor(Math.abs(b) / 2)) / Math.abs(b));
  return a < 0 !== b < 0 ? -q : q;
}

/** A Q28 product back to Q14. */
const q14 = (x: number) => (i32(x) + 8192) >> 14;

/** A blend this flat (|det| under 0.05) isn't inverted: the strongest bone's skin is used. */
const DET_MIN = Math.round(0.05 * 2 ** 28);

/** A vertex as the stitched model has it: in the frame's bind pose, on frame bones. */
export interface UnposedVertex {
  position: [number, number, number];
  normal: [number, number, number] | null;
  /** Frame bone and weight, in the vertex's slot order. */
  weights: [number, number][];
}

/** A gunner block vertex's frame bones and weights. */
export function unposedWeights(
  v: readonly number[],
  bones: readonly number[],
  map: (bone: number) => number,
): [number, number][] {
  const slots = [v[6]! & 15, v[6]! >> 4];
  const ws = [v[9]!, v[10]!];
  const out: [number, number][] = [];
  for (let k = 0; k < 2; k++) {
    if (slots[k] === NO_SLOT || ws[k]! <= 0) continue;
    const b = map(bones[slots[k]!]!);
    const at = out.find(([bone]) => bone === b);
    if (at) at[1] += ws[k]!;
    else out.push([b, ws[k]!]);
  }
  if (out.length === 0) out.push([map(bones[slots[0]!]!), 0x80]);
  return out;
}

/** The cofactors of a Q14 3x3 (row by row), in Q14, and its determinant in Q28. */
function cofactors(a: readonly number[]): { c: number[]; det: number } {
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = a as number[];
  const c = [
    q14(a11! * a22! - a12! * a21!),
    q14(a12! * a20! - a10! * a22!),
    q14(a10! * a21! - a11! * a20!),
    q14(a02! * a21! - a01! * a22!),
    q14(a00! * a22! - a02! * a20!),
    q14(a01! * a20! - a00! * a21!),
    q14(a01! * a12! - a02! * a11!),
    q14(a02! * a10! - a00! * a12!),
    q14(a00! * a11! - a01! * a10!),
  ];
  const det = i32(i32(a00! * c[0]!) + i32(a01! * c[1]!) + i32(a02! * c[2]!));
  return { c, det };
}

/**
 * A gunner block vertex (drawn, slid `shift` along z) in the frame's bind
 * pose: the inverse of the frame's drawn `skins` blended by its weights.
 */
export function unpose(
  v: readonly number[],
  hasNormal: boolean,
  shift: number,
  weights: readonly [number, number][],
  skins: GunnerRecord["skins"],
): UnposedVertex {
  const total = weights.reduce((n, [, w]) => n + w, 0);
  let m = Array.from({ length: 12 }, (_, k) =>
    rdiv(
      weights.reduce((n, [b, w]) => n + i32(w * skins[b]![k]!), 0),
      total,
    ),
  );
  let { c, det } = cofactors(m);
  if (Math.abs(det) < DET_MIN) {
    let strongest = weights[0]!;
    for (const w of weights) if (w[1] > strongest[1]) strongest = w;
    m = [...skins[strongest[0]]!];
    ({ c, det } = cofactors(m));
  }
  const d = (det + 8192) >> 14;
  const r = [v[0]! - m[9]!, v[1]! - m[10]!, v[2]! + shift - m[11]!];
  const clampPos = (x: number) => Math.min(0x7fff, Math.max(-0x7fff, x));
  const position = [0, 1, 2].map((i) =>
    d === 0
      ? 0
      : clampPos(
          rdiv(i32(i32(c[i]! * r[0]!) + i32(c[3 + i]! * r[1]!) + i32(c[6 + i]! * r[2]!)), d),
        ),
  ) as [number, number, number];
  let normal: [number, number, number] | null = null;
  if (hasNormal) {
    const n = [v[3]!, v[4]!, v[5]!];
    const t = [0, 1, 2].map((k) => (m[k]! * n[0]! + m[3 + k]! * n[1]! + m[6 + k]! * n[2]!) >> 9);
    const len = isqrtInt(t[0]! * t[0]! + t[1]! * t[1]! + t[2]! * t[2]!);
    normal = t.map((x) => (len === 0 ? 0 : Math.min(127, Math.max(-127, rdiv(x * 127, len))))) as [
      number,
      number,
      number,
    ];
  }
  return { position, normal, weights: [...weights] };
}

/** The integer square root (as `stitch.ts`'s). */
function isqrtInt(n: number): number {
  let root = 0;
  let bit = 1 << 30;
  let x = n >>> 0;
  while (bit > x) bit >>>= 2;
  while (bit !== 0) {
    if (x >= root + bit) {
      x -= root + bit;
      root = (root >>> 1) + bit;
    } else root >>>= 1;
    bit >>>= 2;
  }
  return root;
}
