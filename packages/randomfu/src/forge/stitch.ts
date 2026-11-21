/**
 * The weapon stitcher in TypeScript: what `blob/stitch.c` does in game, step
 * for step and in the same integer maths, so the blob's output can be
 * checked against it byte for byte (`test/stitch.test.ts`), and so stitched
 * weapons can be rendered offline.
 *
 * Given the model the game is building and its package as DATA.BIN has it,
 * it rolls a recipe from `FORGE.BIN` (`stitch-library.ts`), as
 * `assemble.ts`'s `rollRecipe` does in its mode: another handle of the
 * class, a head (in "any" and "wild" mode often from another class), maybe
 * another guard, borrowed trim and a glow, the second piece, a material. Then it places the parts as
 * `assemble.ts` does, in integers: a head from another class scaled to the
 * frame's class (Q12 fixed point) and turned if its class faces the other
 * way, onto the handle's cut when it carries its own grip, let down onto
 * what is under it, then seated on the handle's shaft. Then it writes the
 * package: the model, the frame's skeleton, and a texture set of the
 * blocks' images.
 *
 * A recipe that doesn't fit the slot is tried lighter (without the head's
 * trim, then with fewer vertices, then without the matching second blade),
 * then rolled again; after ROLLS, the package stays as it was.
 */
import { readPac, writePac } from "mhfu-extract/src/models/pac.js";
import {
  writePmo,
  type GeDraw,
  type PmoMaterialRecord,
  type PmoMeshRecord,
  type PmoVertexGroup,
} from "mhfu-extract/src/models/pmo-file.js";
import {
  boneMap,
  placeGunnerStitch,
  rollGunnerStitch,
  unpose,
  unposedWeights,
  type GunnerStitchRecipe,
} from "./stitch-gunner.js";
import {
  CLASS_FLAG,
  CLASSES,
  GUNNER_CLASS,
  FLAG,
  NO_SPAN,
  Q,
  REDUCED,
  ROLE,
  readBlock,
  readImage,
  readForgeLibrary,
  type Block,
  type BlockChunk,
  type ForgeIndexEntry,
  type ForgeLibrary,
  type ForgePiece,
  type ForgeRecord,
} from "./stitch-library.js";

/** Recipes rolled before the package is left as it was. */
export const ROLLS = 6;

/** Where a weapon's parts may come from (`assemble.ts`'s ForgeMode), in the order the blob numbers them. */
export const STITCH_MODES = ["class", "any", "wild"] as const;
export type StitchMode = (typeof STITCH_MODES)[number];

/** How often (in 100) the head comes from another class, per mode (`assemble.ts`'s CROSS_CLASS). */
const CROSS = [0, 50, 90];

/** The class that faces the other way (`assemble.ts`'s TURNED): dual blades. */
const TURNED_CLASS = 3;
const turns = (from: number, frame: number) => (from === TURNED_CLASS) !== (frame === TURNED_CLASS);

/** A guard's scale on another class, from its usual guard width: between 0.6 and 1.6. */
const GUARD_FIT = [2458, 6554] as const;
/** The least scale (0.25) and the scale below which the reduced blocks are used (0.8). */
const LEAST_SCALE = 1024;
const REDUCE_BELOW = 3277;
/** How far from the axis a triangle is on it (`assemble.ts`'s ON_AXIS). */
const ON_AXIS = 6;
/** Borrowed trim sits 0.25 to 0.85 along the head (Q12), and a glow is borrowed 15 times in 100. */
const ALONG = [1024, 2458] as const;
const EFFECT = 15;

/** `v` scaled by `s` (Q12), rounded. */
export const scaled = (v: number, s: number) => (v * s + 2048) >> 12;

/** Material ramps, dark to light, as `atlas.ts`'s MATERIALS (1-based in recipes; 0 is none). */
export const RAMPS: readonly (readonly [number, number, number][])[] = [
  [
    [60, 35, 5],
    [170, 120, 30],
    [255, 220, 120],
  ],
  [
    [10, 5, 20],
    [60, 40, 90],
    [170, 150, 220],
  ],
  [
    [70, 60, 40],
    [190, 175, 140],
    [250, 245, 225],
  ],
  [
    [50, 0, 10],
    [170, 20, 40],
    [255, 140, 150],
  ],
  [
    [0, 40, 25],
    [40, 150, 90],
    [190, 255, 210],
  ],
  [
    [20, 40, 80],
    [110, 170, 230],
    [235, 250, 255],
  ],
  [
    [40, 20, 10],
    [130, 65, 30],
    [210, 150, 90],
  ],
  [
    [30, 32, 38],
    [120, 125, 135],
    [230, 235, 245],
  ],
];

/** xorshift32, as the blob's. */
export class XorShift {
  constructor(public state: number) {
    if (this.state === 0) this.state = 0x2545f491;
  }
  next(): number {
    let x = this.state >>> 0;
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    this.state = x;
    return x;
  }
  int(n: number): number {
    return this.next() % n;
  }
}

export interface StitchRecipe {
  frame: number;
  handle: number;
  head: number;
  guard: number | null;
  /** Borrowed trim (pieces), each with how far along the head it sits (Q12), and a borrowed glow. */
  extras: { piece: number; along: number }[];
  effect: number | null;
  second: number | null;
  /** The head's scale and the guard's (Q12). */
  headScale: number;
  guardScale: number;
  twin: boolean;
  /** Material indices, 1-based; 0 for none. */
  material: number;
  headMaterial: number;
}

/** Which lighter take of a recipe. */
export interface Take {
  extras: boolean;
  reduced: boolean;
  twin: boolean;
}

/** The takes tried for a recipe, heaviest first. */
export function takes(twin: boolean): Take[] {
  const out: Take[] = [
    { extras: true, reduced: false, twin },
    { extras: false, reduced: false, twin },
    { extras: false, reduced: true, twin },
  ];
  if (twin) out.push({ extras: false, reduced: true, twin: false });
  return out;
}

/**
 * Rolls a recipe for the model at `frame` (an index entry), or null if its
 * class has no handle or no head.
 */
export function rollStitch(
  library: ForgeLibrary,
  frame: number,
  rng: XorShift,
  mode: StitchMode = "class",
): StitchRecipe | null {
  const { index, records } = library;
  const f = index[frame]!;
  const type = f.type;
  const m = STITCH_MODES.indexOf(mode);
  const wild = mode === "wild";
  const has = (n: number, flag: number) => (index[n]!.flags & flag) !== 0;
  const where = (keep: (e: ForgeIndexEntry, n: number) => boolean) => {
    const out: number[] = [];
    index.forEach((e, n) => {
      if (keep(e, n)) out.push(n);
    });
    return out;
  };
  const pick = (list: number[]) => list[rng.int(list.length)]!;
  const handles = where((e, n) => e.type === type && has(n, FLAG.lends));
  if (handles.length === 0) return null;
  const handle = pick(handles);
  // Another class's head is never its own handle's, so it has to seat.
  const seats = (n: number) => has(n, FLAG.head) && has(n, FLAG.seats);
  let heads = where((e, n) => e.type === type && has(n, FLAG.head) && (n === handle || seats(n)));
  if (rng.int(100) < CROSS[m]!) {
    const classes: number[] = [];
    for (let t = 0; t < CLASSES; t++) {
      if (t !== type && index.some((e, n) => e.type === t && seats(n))) classes.push(t);
    }
    if (classes.length > 0) {
      const t = pick(classes);
      heads = where((e, n) => e.type === t && seats(n));
    }
  }
  if (heads.length === 0) return null;
  const head = pick(heads);
  let wantsGuard = false;
  if (f.classFlags & CLASS_FLAG.guarded) wantsGuard = rng.int(100) < (wild ? 60 : 50);
  else if (m !== 0) wantsGuard = rng.int(100) < (wild ? 35 : 20);
  let guard: number | null = null;
  if (wantsGuard) {
    const guards = where(
      (e, n) =>
        (m !== 0 ? e.type < GUNNER_CLASS : e.type === type) && n !== head && has(n, FLAG.guard),
    );
    if (guards.length > 0) guard = pick(guards);
  }
  // Borrowed trim and a glow, from the classes the head may come from.
  const lends = (n: number) => n !== head && (m !== 0 || index[n]!.type === type);
  const trims: number[] = [];
  library.pieces.forEach((p, k) => {
    if (!p.glow && lends(p.model)) trims.push(k);
  });
  const many = rng.int(100);
  const count = wild ? (many < 35 ? 0 : many < 75 ? 1 : 2) : many < 60 ? 0 : many < 90 ? 1 : 2;
  const extras: StitchRecipe["extras"] = [];
  for (let k = 0; k < count && trims.length > 0; k++) {
    const piece = pick(trims);
    extras.push({ piece, along: ALONG[0] + rng.int(ALONG[1]) });
  }
  let effect: number | null = null;
  if (rng.int(100) < EFFECT) {
    const from: number[] = [];
    for (const p of library.pieces) {
      if (p.glow && lends(p.model) && from[from.length - 1] !== p.model) from.push(p.model);
    }
    if (from.length > 0) {
      const model = pick(from);
      const glows: number[] = [];
      library.pieces.forEach((p, k) => {
        if (p.glow && p.model === model) glows.push(k);
      });
      effect = pick(glows);
    }
  }
  let second: number | null = null;
  if (f.flags & FLAG.secondParts) {
    const donors = where(
      (e, n) => e.type === type && n !== frame && e.shape === f.shape && has(n, FLAG.second),
    );
    second = rng.int(100) < 30 && donors.length > 0 ? pick(donors) : frame;
    if (!has(second, FLAG.second)) second = donors.length > 0 ? pick(donors) : null;
  }
  const roll = rng.int(100);
  const which = 1 + rng.int(RAMPS.length);

  // Sizes, as `rollRecipe` works them out.
  const D = records[head]!;
  const headType = index[head]!.type;
  const headScale = D.headScale[type]!;
  const sized = guard ?? head;
  const sizedType = index[sized]!.type;
  const width = records[sized]!.guardWidth;
  const target = library.guardTarget[type]!;
  let fitted: number;
  if (sizedType === type || width <= 0) fitted = Q;
  else if (target > 0)
    fitted = Math.min(GUARD_FIT[1], Math.max(GUARD_FIT[0], Math.floor((target * Q) / width)));
  else if (sized === head) fitted = headScale;
  else fitted = library.classScale[sizedType]![type]!;
  let guardScale = fitted;
  if (headType !== type && width > 0) {
    const around = Math.floor((3 * D.headWidth * headScale) / (2 * width));
    guardScale = Math.min(fitted, Math.max(LEAST_SCALE, around));
  }
  return {
    frame,
    handle,
    head,
    guard,
    extras,
    effect,
    second,
    headScale,
    guardScale,
    twin: (f.flags & FLAG.twin) !== 0,
    material: roll < 15 ? which : 0,
    headMaterial: roll >= 15 && roll < 45 ? which : 0,
  };
}

/**
 * A block placed: each vertex's x and y scaled by `scale` (Q12), turned
 * half about the axis if `turn` and moved across by `dx`, `dy`, its z put at
 * `base` + (z - `pivot`) scaled; on a bone (or its own, -1), recoloured.
 */
export interface Instance {
  block: number;
  base: number;
  pivot: number;
  scale: number;
  turn: boolean;
  dx: number;
  dy: number;
  bone: number;
  material: number;
  handle: boolean;
  /** A gunner block's model (index entry), whose bones its vertices name; else absent. */
  source?: number;
}

/** Where a part goes: z' = base + (z - pivot) scaled; x' and y' scaled, turned, then moved by dx, dy. */
interface Placing {
  base: number;
  pivot: number;
  scale: number;
  turn: boolean;
  dx: number;
  dy: number;
}

/** The lowest z on the axis of a part with seat table `stairs` scaled by `s`, or null. */
export function stairLow(
  stairs: readonly [number, number][],
  s: number,
  unit: number,
): number | null {
  let low: number | null = null;
  for (const [d, z] of stairs) {
    if (d * s > ON_AXIS * unit * Q) break;
    low = z;
  }
  return low;
}

/** The blocks a take of a recipe places, and where; null if a block it needs is missing. */
export function placeStitch(library: ForgeLibrary, r: StitchRecipe, take: Take): Instance[] | null {
  const rec = (n: number) => library.records[n]!;
  const entry = (n: number): ForgeIndexEntry => library.index[n]!;
  const one = 1 << library.unitShift;
  const type = entry(r.frame).type;
  const headType = entry(r.head).type;
  const F = rec(r.frame);
  const H = rec(r.handle);
  const D = rec(r.head);
  const G = r.guard !== null ? rec(r.guard) : null;
  const hs = r.headScale;
  const gs = r.guardScale;
  const ref = (R: ForgeRecord, role: number, scale: number) => {
    const lighter = take.reduced || scale < REDUCE_BELOW;
    return (lighter ? R.refs[REDUCED + role]![0] : 0) || R.refs[role]![0];
  };
  const grip = (entry(r.head).flags & FLAG.grip) !== 0;
  // Let down onto what is under it: a borrowed guard, or from another class its own.
  let drop = 0;
  if (grip && (headType !== type || G)) {
    const bottom = scaled(D.headBottom, hs);
    const guardTop = G ? scaled(G.guardTop, gs) : scaled(D.guardTop, headType === type ? hs : gs);
    const under = Math.max(guardTop, scaled(D.extrasUnder, hs));
    drop = Math.max(0, bottom - under - one);
  }
  const onHead: Placing = {
    base: grip ? H.cut - drop : 0,
    pivot: grip ? D.cut : 0,
    scale: hs,
    turn: turns(headType, type),
    dx: 0,
    dy: 0,
  };
  const socket = grip ? H.cut : scaled(D.cut, hs);
  const headBone = F.headBone;
  const out: Instance[] = [];
  const add = (block: number, at: Placing, material: number, handle = false) => {
    if (block) {
      out.push({ block, ...at, bone: handle ? F.handleBone : headBone, material, handle });
    }
  };
  const still: Placing = { base: 0, pivot: 0, scale: Q, turn: false, dx: 0, dy: 0 };
  const handleBlock = ref(H, ROLE.handle, Q);
  const headBlock = ref(D, ROLE.head, hs);
  if (!handleBlock || !headBlock) return null;
  const all = r.material;
  const top = r.headMaterial || r.material;
  add(handleBlock, still, all, true);
  add(headBlock, onHead, top);
  const low = r.head === r.handle || !grip;
  if (take.extras) {
    add(D.refs[ROLE.extraHigh]![0], onHead, top);
    if (low) add(D.refs[ROLE.extraLow]![0], onHead, top);
  }
  add(D.refs[ROLE.effectHigh]![0], onHead, 0);
  if (low) add(D.refs[ROLE.effectLow]![0], onHead, 0);
  // The guard: a borrowed one on the socket, sized for the frame's class;
  // the head's own with it, or from another class on the socket if it is
  // around the shaft (else none).
  let guard: { stairs: [number, number][]; at: Placing } | null = null;
  const onSocket = (R: ForgeRecord, from: number): Placing => ({
    base: socket,
    pivot: R.cut,
    scale: gs,
    turn: turns(from, type),
    dx: 0,
    dy: 0,
  });
  if (G) guard = { stairs: G.guardStairs, at: onSocket(G, entry(r.guard!).type) };
  else if (headType === type) guard = { stairs: D.guardStairs, at: onHead };
  else if (entry(r.head).flags & FLAG.guard)
    guard = { stairs: D.guardStairs, at: onSocket(D, headType) };
  if (guard) add(ref(G ?? D, ROLE.guard, guard.at.scale), guard.at, top);
  if (take.extras) {
    // Borrowed pieces, sized for the frame's class, moved in across to the head's sides.
    const box = D.headBox.map((v) => scaled(v, hs));
    const sides = [0, 1].map((k) =>
      onHead.turn ? [-box[2 + k]!, -box[k]!] : [box[k]!, box[2 + k]!],
    );
    const across = (p: ForgePiece, s: number, turn: boolean) =>
      [0, 1].map((k) => {
        // Doubled, to stay in integers.
        const center = (turn ? -1 : 1) * scaled(p.min[k]! + p.max[k]!, s);
        const [lo, hi] = sides[k]!;
        const mid = lo! + hi!;
        const half = Math.floor(((hi! - lo!) * 3) / 5);
        return (Math.min(mid + half, Math.max(mid - half, center)) - center) >> 1;
      });
    const length = scaled(D.headTop, hs);
    // The head's span along z as placed; a piece is kept within it.
    const lo = onHead.base + scaled(D.cut + D.headBottom - onHead.pivot, hs);
    const hi = onHead.base + scaled(D.cut + D.headTop - onHead.pivot, hs);
    const fit = (p: ForgePiece, s: number, at: number) => {
      const half = scaled(p.max[2] - p.min[2], s) >> 1;
      return hi - lo < 2 * half ? (lo + hi) >> 1 : Math.min(hi - half, Math.max(lo + half, at));
    };
    const put = (p: ForgePiece, s: number, at: number, material: number) => {
      const turn = turns(entry(p.model).type, type);
      const [dx, dy] = across(p, s, turn);
      const pivot = (p.min[2] + p.max[2]) >> 1;
      add(p.block, { base: fit(p, s, at), pivot, scale: s, turn, dx: dx!, dy: dy! }, material);
    };
    for (const { piece, along } of r.extras) {
      const p = library.pieces[piece]!;
      put(p, library.classScale[entry(p.model).type]![type]!, socket + scaled(length, along), top);
    }
    if (r.effect !== null) {
      // As far along this head as along its own, no larger than this head is
      // to its own and no longer than it (a hammer's ring hung past a short blade's tip).
      const p = library.pieces[r.effect]!;
      const R = rec(p.model);
      const own = R.headTop - R.headBottom;
      let s = library.classScale[entry(p.model).type]![type]!;
      let along = Q >> 1;
      const room = Math.max(0, hi - lo) * Q;
      const long = p.max[2] - p.min[2];
      if (long > 0) s = Math.min(s, Math.floor(room / long));
      if (own > 0) {
        s = Math.min(s, Math.floor(room / own));
        const mid = (p.min[2] + p.max[2]) >> 1;
        along = Math.min(Q, Math.floor((Math.max(0, mid - R.cut - R.headBottom) * Q) / own));
      }
      put(p, s, lo + scaled(hi - lo, along), 0);
    }
  }
  // Seated on the handle's shaft: the lowest point of the head and guard on the axis let down onto its top.
  if (r.head !== r.handle && H.shaftTop !== NO_SPAN.hi) {
    let body: number | null = null;
    const seat = (stairs: [number, number][], at: Placing) => {
      const z = stairLow(stairs, at.scale, one);
      if (z === null) return;
      const placed = at.base + scaled(z - at.pivot, at.scale);
      body = body === null ? placed : Math.min(body, placed);
    };
    seat(D.headStairs, onHead);
    if (guard) seat(guard.stairs, guard.at);
    if (body !== null) {
      const gap = body - H.shaftTop;
      if (gap > 0) for (const i of out) if (!i.handle) i.base -= gap + one;
    }
  }
  if (take.twin) {
    for (const i of [...out]) out.push({ ...i, bone: i.handle ? F.twinHandle : F.twinHead });
  } else if (r.second !== null) {
    const S = rec(r.second);
    const block = ref(S, ROLE.second, Q);
    if (block) out.push({ block, ...still, bone: -1, material: all, handle: false });
  }
  return out;
}

/** A palette entry recoloured by ramp `material` (1-based), in the palette's format. */
export function recolor(entry: number, format: number, material: number): number {
  const ramp = RAMPS[material - 1];
  if (!ramp) return entry;
  let r: number, g: number, b: number;
  if (format === 3) {
    r = entry & 0xff;
    g = (entry >>> 8) & 0xff;
    b = (entry >>> 16) & 0xff;
  } else {
    const up = (v: number) => Math.floor((v * 510 + 31) / 62);
    r = up(entry & 31);
    g = up((entry >>> 5) & 31);
    b = up((entry >>> 10) & 31);
  }
  const lum = 299 * r + 587 * g + 114 * b;
  const at = Math.floor((lum * 512) / 255000);
  const i = Math.min(at >> 8, 1);
  const f = at - (i << 8);
  const mix = (k: number) => {
    const target = (ramp[i]![k]! * (256 - f) + ramp[i + 1]![k]! * f + 128) >> 8;
    return ([r, g, b][k]! * 64 + target * 192 + 128) >> 8;
  };
  const [nr, ng, nb] = [mix(0), mix(1), mix(2)];
  if (format === 3) return ((entry & 0xff000000) | (nb << 16) | (ng << 8) | nr) >>> 0;
  const down = (c: number) => Math.floor((c * 62 + 255) / 510);
  return (entry & 0x8000) | (down(nb) << 10) | (down(ng) << 5) | down(nr);
}

/** The integer square root. */
export function isqrt(n: number): number {
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

/** Positions placed stay within s16. */
const PLACED_LIMIT = 0x7fff;

/** A block vertex's position as `at` places it, in units. */
export function place(at: Instance, v: readonly number[]): [number, number, number] {
  const sign = at.turn ? -1 : 1;
  const c = (x: number) => Math.min(PLACED_LIMIT, Math.max(-PLACED_LIMIT, x));
  return [
    c(sign * scaled(v[0]!, at.scale) + at.dx),
    c(sign * scaled(v[1]!, at.scale) + at.dy),
    c(at.base + scaled(v[2]! - at.pivot, at.scale)),
  ];
}

const VT_UV16 = 2;
const VT_NORMAL8 = 1 << 5;
const VT_POSITION16 = 2 << 7;
const VT_WEIGHT8 = 1 << 9;

/** A vertex as the package has it, in units: its position, normal, and weight per palette bone. */
interface OutVertex {
  p: [number, number, number];
  n: number[] | null;
  w: number[];
}

/**
 * The package a take writes, from the blocks it places and the frame's
 * skeleton; `frame` (an index entry) unposes gunner blocks, and `extra` is
 * the materials' last word.
 */
export function writeStitch(
  forge: Buffer,
  library: ForgeLibrary,
  instances: readonly Instance[],
  skeleton: Buffer,
  frame = -1,
  extra = 0,
): Buffer {
  const blocks = new Map<number, Block>();
  const blockAt = (offset: number) => {
    let b = blocks.get(offset);
    if (!b) blocks.set(offset, (b = readBlock(forge, offset)));
    return b;
  };
  // Images by (image, material), first use first.
  const images: { block: Block; material: number }[] = [];
  const imageOf = (block: Block, material: number) => {
    let i = images.findIndex((m) => m.block.image === block.image && m.material === material);
    if (i < 0) i = images.push({ block, material }) - 1;
    return i;
  };
  interface Group {
    chunk: BlockChunk;
    material: number;
    palette: number[];
    vertices: OutVertex[];
  }
  /** A chunk's bones and vertices as `at` places it. */
  const prepare = (c: BlockChunk, at: Instance): Pick<Group, "palette" | "vertices"> => {
    if (at.source === undefined) {
      const palette = at.bone < 0 ? c.bones : [at.bone];
      return {
        palette,
        vertices: c.vertices.map((v) => ({
          p: place(at, v),
          n: c.hasNormal ? (at.turn ? [-v[3]!, -v[4]!, v[5]!] : [v[3]!, v[4]!, v[5]!]) : null,
          w: palette.map((_, k) => (k === (at.bone < 0 ? v[6]! : 0) ? 0x80 : 0)),
        })),
      };
    }
    const target = library.records[frame]!.gunner!;
    const from = library.records[at.source]!.gunner!.parents;
    const map = (b: number) => boneMap(from, target.parents, b);
    const unposed = c.vertices.map((v) =>
      unpose(v, c.hasNormal, at.base, unposedWeights(v, c.bones, map), target.skins),
    );
    const palette = [...new Set(unposed.flatMap((u) => u.weights.map(([b]) => b)))].sort(
      (a, b) => a - b,
    );
    return {
      palette,
      vertices: unposed.map((u) => ({
        p: u.position,
        n: u.normal,
        w: palette.map((b) => Math.min(255, u.weights.find(([x]) => x === b)?.[1] ?? 0)),
      })),
    };
  };
  const groups: Group[] = [];
  const materials: PmoMaterialRecord[] = [];
  for (const inst of instances) {
    const block = blockAt(inst.block);
    const image = imageOf(block, inst.material);
    for (const chunk of block.chunks) {
      let m = materials.findIndex(
        (x) =>
          x.diffuse === chunk.diffuse && x.ambient === chunk.ambient && x.textureIndex === image,
      );
      if (m < 0) {
        m =
          materials.push({
            diffuse: chunk.diffuse,
            ambient: chunk.ambient,
            textureIndex: image,
            extra,
          }) - 1;
      }
      groups.push({ chunk, material: m, ...prepare(chunk, inst) });
    }
  }
  const max = [1, 1, 1];
  let radius2 = 0;
  for (const g of groups) {
    for (const { p } of g.vertices) {
      p.forEach((c, k) => (max[k] = Math.max(max[k]!, Math.abs(c))));
      radius2 = Math.max(radius2, isqrt(p[0]! * p[0]! + p[1]! * p[1]! + p[2]! * p[2]!));
    }
  }
  const unit = 2 ** library.unitShift;
  const quantize = (c: number, k: number) => {
    const q = Math.floor((Math.abs(c) * 0x7fff + (max[k]! >> 1)) / max[k]!);
    return c < 0 ? -q : q;
  };

  const meshes: PmoMeshRecord[] = [];
  const meshKeys: string[] = [];
  const ordered = [
    ...groups.filter((g) => g.chunk.blend === 0),
    ...groups.filter((g) => g.chunk.blend !== 0),
  ];
  for (const g of ordered) {
    const key = `${g.chunk.blend}/${g.chunk.flags}`;
    let i = meshKeys.indexOf(key);
    if (i < 0) {
      i = meshKeys.push(key) - 1;
      meshes.push({
        uvScale: [1, 1],
        flags: g.chunk.flags,
        blend: g.chunk.blend,
        materialSlots: [],
        groups: [],
      });
    }
    const mesh = meshes[i]!;
    let slot = mesh.materialSlots.indexOf(g.material);
    if (slot < 0) slot = mesh.materialSlots.push(g.material) - 1;
    const c = g.chunk;
    const bones = g.palette;
    const indexSize = c.vertices.length <= 0x100 ? 1 : 2;
    const vertexType =
      VT_UV16 |
      (c.hasNormal ? VT_NORMAL8 : 0) |
      VT_POSITION16 |
      VT_WEIGHT8 |
      ((bones.length - 1) << 14) |
      (indexSize << 11);
    const draws: GeDraw[] = c.draws.map((w) =>
      w >>> 24 === 0x9b ? { frontFace: w & 0xffffff } : { prim: (w >>> 16) & 7, count: w & 0xffff },
    );
    const group: PmoVertexGroup = {
      materialSlot: slot,
      palette: bones.map((b, k): [number, number] => [k, b]),
      list: {
        vertexType,
        vertices: c.vertices.map((v, k) => {
          const out = g.vertices[k]!;
          return {
            weights: out.w,
            uv: [v[7]!, v[8]!] as [number, number],
            color: null,
            normal: out.n as [number, number, number] | null,
            position: out.p.map(quantize) as [number, number, number],
          };
        }),
        indices: c.indices,
        draws,
      },
    };
    mesh.groups.push(group);
  }
  const pmo = writePmo({
    radius: radius2 / unit,
    scale: max.map((m) => m / unit) as [number, number, number],
    meshes,
    materials,
  });

  const imageBytes = images.map(({ block, material }) => {
    const image = readImage(forge, block);
    if (material) {
      const pixels = image.readUInt32LE(16);
      const palette = 16 + pixels;
      const format = image.readUInt32LE(palette + 8);
      const count = image.readUInt32LE(palette + 12);
      for (let k = 0; k < count; k++) {
        if (format === 3) {
          const p = palette + 16 + k * 4;
          image.writeUInt32LE(recolor(image.readUInt32LE(p), 3, material), p);
        } else {
          const p = palette + 16 + k * 2;
          image.writeUInt16LE(recolor(image.readUInt16LE(p), format, material), p);
        }
      }
    }
    return image;
  });
  const tmh = Buffer.alloc(16);
  tmh.write(".TMH0.14", "latin1");
  tmh.writeUInt32LE(images.length, 8);
  return writePac([pmo, skeleton, Buffer.concat([tmh, ...imageBytes])]);
}

/** A gunner recipe's only take. */
const GUNNER_TAKE: Take = { extras: false, reduced: false, twin: false };

/** The last word of a PMO's first material (the gunner forge keeps the frame's), or 0. */
export function materialExtra(pmo: Buffer): number {
  if (pmo.length < 0x38 || pmo.readUInt16LE(0x1e) === 0) return 0;
  return pmo.readUInt32LE(pmo.readUInt32LE(0x30) + 12);
}

export interface Stitched {
  pac: Buffer;
  /** A melee recipe, or a bow's or bowgun's. */
  recipe: StitchRecipe | GunnerStitchRecipe;
  take: Take;
  /** Recipes rolled, this one included. */
  rolls: number;
}

/**
 * A new package for `model` (its DATA.BIN package `pac`), at most
 * `capacity` bytes, or null to keep `pac`: the model isn't in the library,
 * or nothing rolled fits.
 */
export function stitchWeapon(
  forge: Buffer,
  model: number,
  pac: Buffer,
  capacity: number,
  rng: XorShift,
  library: ForgeLibrary = readForgeLibrary(forge),
  mode: StitchMode = "class",
): Stitched | null {
  const frame = library.index.findIndex((e) => e.model === model);
  if (frame < 0) return null;
  const entries = readPac(pac);
  const skeleton = entries[1]?.data;
  if (!skeleton) return null;
  if (library.index[frame]!.type >= GUNNER_CLASS) {
    const extra = materialExtra(Buffer.from(entries[0]!.data));
    for (let rolls = 1; rolls <= ROLLS; rolls++) {
      const recipe = rollGunnerStitch(library, frame, rng);
      if (!recipe) return null;
      const placed = placeGunnerStitch(library, recipe);
      if (!placed) continue;
      const out = writeStitch(forge, library, placed, Buffer.from(skeleton), frame, extra);
      if (out.length <= capacity) return { pac: out, recipe, take: GUNNER_TAKE, rolls };
    }
    return null;
  }
  for (let rolls = 1; rolls <= ROLLS; rolls++) {
    const recipe = rollStitch(library, frame, rng, mode);
    if (!recipe) return null;
    for (const take of takes(recipe.twin)) {
      const placed = placeStitch(library, recipe, take);
      if (!placed) continue;
      const out = writeStitch(forge, library, placed, Buffer.from(skeleton));
      if (out.length <= capacity) return { pac: out, recipe, take, rolls };
    }
  }
  return null;
}
