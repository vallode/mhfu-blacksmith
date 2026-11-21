/**
 * `FORGE.BIN`: the melee forge's parts, cut ahead of time, for the weapon
 * stitcher in the blob (`blob/stitch.c`) to build a new weapon from every
 * time the game builds the hunter's weapon (hook 7). `stitch.ts` is the same
 * stitcher in TypeScript, which the blob's output is checked against.
 *
 * Every model's parts are grouped into blocks, one per role (its handle,
 * head, guard, trim, glows, second piece; a bow's or bowgun's body, stock,
 * barrel, limbs, quiver as `gunner-parts.ts` cuts them), ready to copy into a PMO: GE
 * vertices with positions in fixed units, UVs already in the block's own
 * small texture, and the draw commands encoded. Each block has its own
 * texture (a TMH image record of up to 64 colours), so a weapon's texture
 * set is the images of the blocks it uses, and its materials point at them
 * by index (the game loads every image of a weapon's TMH). Placement is
 * integer: a part moves along the grip and, from another class, is scaled
 * (in Q12 fixed point, Q = 1.0) and maybe turned about it, by amounts worked
 * out from a few numbers per model and per class, as `assemble.ts` does.
 *
 * Layout (little-endian):
 *
 *   header (48): "RFFG", version, file size, unit shift, model count,
 *                index offset, record offset, class offset, piece offset,
 *                piece count
 *   classes:     CLASS_BYTES: per frame class, its usual guard width (u16
 *                units, 0 for none), then per class and frame class the
 *                scale of the one's parts on the other (u16 Q12, `classScale`)
 *   index:       per model, 6 bytes: u16 model, u8 class, u8 flags (FLAG),
 *                u8 shape, u8 class flags (CLASS_FLAG)
 *   records:     per model, RECORD bytes (`writeRecord`), in index order
 *   gunners:     per bow and bowgun, its drawn skins and the barrels that
 *                meet its body (`writeRecord`), among the blocks
 *   blocks:      a block's head (BLOCK_HEAD, `writeBlockHead`), which
 *                records and pieces point at, names its body and its image
 *   bodies:      a block's chunks (`blockBody`), packed (`lz.ts`); blocks
 *                with the same chunks (one part's on another model's
 *                image, a piece that is its role's only part) share one
 *   images:      TMH image records, packed
 *   pieces:      trim and glows other heads may borrow, PIECE_BYTES each
 *                (`writePiece`), by model
 */
import { swizzle, encodeDirectColor, type TmhImage } from "mhfu-extract/src/models/tmh.js";
import type { WeaponTypeName } from "mhfu-extract/src/tables/weapons.js";
import {
  buildLibrary,
  guardCentred,
  hasSlot,
  headScaleFor,
  lendsHandle,
  SCALE_RANGE,
  secondBones,
  type Library,
} from "./assemble.js";
import { reduceColors, type Rgba } from "./atlas.js";
import { gapBetween, hasGunnerSlot, gunnerSlot } from "./gunner-assemble.js";
import { packIslands } from "./gunner-atlas.js";
import {
  GUNNER_TYPES,
  LBG_LIMBS,
  strongestBone as strongestVertexBone,
  type GunnerParts,
  type GunnerSlot,
} from "./gunner-parts.js";
import {
  GUARDED,
  MELEE_TYPES,
  type Part,
  type PartChunk,
  type PartVertex,
  type Slot,
  type Vec3,
  type WeaponParts,
} from "./parts.js";
import { pack, unpack } from "./lz.js";
import { simplified, stripTriangles } from "./simplify.js";

export const FORGE_ISO_PATH = "/PSP_GAME/USRDIR/FORGE.BIN";
export const FORGE_DEVICE_PATH = "disc0:/PSP_GAME/USRDIR/FORGE.BIN";
export const FORGE_MAGIC = 0x47464652; // "RFFG"
export const FORGE_VERSION = 4;
export const HEADER_BYTES = 48;
export const INDEX_BYTES = 6;
export const RECORD_BYTES = 288;
export const PIECE_BYTES = 20;
export const CLASSES = 8;
export const CLASS_BYTES = CLASSES * 2 + CLASSES * CLASSES * 2;

/** Scales are Q12 fixed point: Q is 1.0. */
export const Q = 4096;
/** A seat table's entries (`stairs`): the head's, and its guard's. */
export const HEAD_STAIRS = 16;
export const GUARD_STAIRS = 8;

/** Index flags. */
export const FLAG = {
  /** Its handle can take another model's head (`lendsHandle`). */
  lends: 1,
  /** It has a head, and its trim, guard and glows stay inside its texture. */
  head: 2,
  /** Its head can sit on another handle: not on a shaft of its own, and some of it near the axis. */
  seats: 4,
  /** Its guard sits around its shaft (`guardCentred`). */
  guard: 8,
  /** It has a second piece inside its texture. */
  second: 16,
  /** It has a second piece at all (a frame then always gets one). */
  secondParts: 32,
  /** Its second piece is rebuilt as a copy of the first (dual blades). */
  twin: 64,
  /** Its handle runs through the fist (`gripInHandle`). */
  grip: 128,
} as const;

export const CLASS_FLAG = { guarded: 1 } as const;

/** Bows and bowguns are classes GUNNER_CLASS + GUNNER_TYPES' index (light, heavy, bow). */
export const GUNNER_CLASS = 8;

/** A gunner's index flags: which of its slots can be used, and whether it has a second piece at all. */
export const GFLAG = {
  body: 1,
  stock: 2,
  barrel: 4,
  limbs: 8,
  second: 16,
  secondParts: 32,
} as const;

/** A gunner's block references. */
export const GROLE = { body: 0, stock: 1, barrel: 2, limbs: 3, second: 4 } as const;
const GUNNER_ROLES: GunnerSlot[] = ["body", "stock", "barrel", "limbs", "second"];

/** The most models the blob's index holds (`blob/stitch.c`'s MAX_MODELS). */
export const MAX_MODELS = 640;
/** The most chunks a block has: the blob's MAX_GROUPS is MAX_CHUNKS a part. */
export const MAX_CHUNKS = 4;
/** The most borrowable pieces it holds (MAX_PIECES). */
export const MAX_PIECES = 4096;

/** A gunner's skeleton has at most this many bones; skins are Q14 fixed point. */
export const GUNNER_BONES = 8;
export const SKIN_Q = 1 << 14;
/** The widest gap a heavy bowgun's body and barrel may leave (`gunner-assemble.ts`'s MAX_GAP). */
const MEET_GAP = 6;

/** A borrowed piece of trim is at most this big (`assemble.ts`'s EXTRA_TRIANGLES). */
const EXTRA_TRIANGLES = 40;

/** Block roles: a record's block references, in order. */
export const ROLE = {
  handle: 0,
  head: 1,
  guard: 2,
  /** The head's trim and glows, above its cut less BELOW_CUT and below it. */
  extraHigh: 3,
  extraLow: 4,
  effectHigh: 5,
  effectLow: 6,
  second: 7,
} as const;
export const ROLES = 8;
/** The fewer-vertex take on a role's block, at role + REDUCED (handle, head, guard and second have one). */
export const REDUCED = 8;
export const REFS = 16;

/** How far below its cut a head's trim may reach and still go with it onto another handle (`assemble.ts`). */
const BELOW_CUT = 8;
/** How far from the axis a triangle is on it (`assemble.ts`'s ON_AXIS). */
const ON_AXIS = 6;
/** How near the axis some of a head has to come to be seated (NEAR_AXIS). */
const NEAR_AXIS = 8;
/** How far from the axis a seat table looks: ON_AXIS at the least scale. */
const STAIR_REACH = ON_AXIS / SCALE_RANGE[0];
/** The scale the reduced blocks are simplified for. */
const REDUCED_SCALE = 0.5;
/** Colours a block's texture keeps. */
const COLORS = 64;
/** Texture sizes a block may take, smallest first. */
const SIZES: [number, number][] = [
  [16, 16],
  [32, 16],
  [16, 32],
  [32, 32],
  [64, 16],
  [16, 64],
  [64, 32],
  [32, 64],
  [64, 64],
];
/** The least scale a block's texels may be packed at before a bigger texture is tried. */
const SHARP = 0.94;

/** Positions are model units times 2^shift, and stay within this. */
const UNIT_LIMIT = 16383;

const NO_SPAN_LO = 0x7fff;
const NO_SPAN_HI = -0x8000;

const align16 = (n: number) => (n + 15) & ~15;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const slotParts = (weapon: WeaponParts, ...slots: Slot[]) =>
  weapon.parts.filter((p) => slots.includes(p.slot));

const fitsTexture = (part: Part) =>
  part.uvMin[0] >= -0.001 &&
  part.uvMin[1] >= -0.001 &&
  part.uvMax[0] <= 1.001 &&
  part.uvMax[1] <= 1.001;

/** How far from the axis a triangle's shadow across comes (`assemble.ts`). */
function axisDistance(a: Vec3, b: Vec3, c: Vec3): number {
  const side = (p: Vec3, q: Vec3) => (q[0] - p[0]) * -p[1] - (q[1] - p[1]) * -p[0];
  const sides = [side(a, b), side(b, c), side(c, a)];
  if (sides.every((d) => d >= 0) || sides.every((d) => d <= 0)) return 0;
  const toSegment = (p: Vec3, q: Vec3) => {
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const t = clamp(-(p[0] * dx + p[1] * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(p[0] + t * dx, p[1] + t * dy);
  };
  return Math.min(toSegment(a, b), toSegment(b, c), toSegment(c, a));
}

/** The lowest and highest z of the triangles of `parts` within `reach` of the axis, or null. */
function axisRange(parts: readonly Part[], reach: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const part of parts) {
    for (const chunk of part.chunks) {
      const at = chunk.vertices.map((v) => v.position);
      for (const strip of chunk.strips) {
        for (const [i, j, k] of stripTriangles(strip)) {
          const [a, b, c] = [at[i]!, at[j]!, at[k]!];
          if (axisDistance(a, b, c) > reach) continue;
          lo = Math.min(lo, a[2], b[2], c[2]);
          hi = Math.max(hi, a[2], b[2], c[2]);
        }
      }
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/**
 * A seat table: how low the triangles of `parts` within each distance of
 * the axis reach, as (distance, lowest z) in units, the distance rounded
 * up, out to STAIR_REACH, a step wherever the lowest z drops. A part scaled
 * by s has its triangles within ON_AXIS / s of the axis on the axis, so the
 * table gives its lowest point there at any scale (`stairLow`). Past
 * `limit` steps the farthest are left out (none are on the EU disc).
 */
export function stairs(parts: readonly Part[], unit: number, limit: number): [number, number][] {
  const found: [number, number][] = [];
  for (const part of parts) {
    for (const chunk of part.chunks) {
      const at = chunk.vertices.map((v) => v.position);
      for (const strip of chunk.strips) {
        for (const [i, j, k] of stripTriangles(strip)) {
          const [a, b, c] = [at[i]!, at[j]!, at[k]!];
          const d = axisDistance(a, b, c);
          if (d > STAIR_REACH) continue;
          found.push([Math.ceil(d * unit), Math.round(Math.min(a[2], b[2], c[2]) * unit)]);
        }
      }
    }
  }
  found.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const out: [number, number][] = [];
  for (const [d, z] of found) {
    const last = out[out.length - 1];
    if (last && z >= last[1]) continue;
    if (last && last[0] === d) last[1] = z;
    else out.push([d, z]);
  }
  return out.slice(0, limit);
}

const width = (part: Part) => Math.max(part.max[0] - part.min[0], part.max[1] - part.min[1]);

/** The widest of a weapon's guard pieces (`assemble.ts`'s guardWidthOf). */
const guardWidthOf = (w: WeaponParts) => Math.max(0, ...slotParts(w, "guard").map(width));

/** The head's width across, the wider of its box's x and y (`assemble.ts`'s headWidthOf). */
function headWidthOf(w: WeaponParts): number {
  const heads = slotParts(w, "head");
  if (heads.length === 0) return 0;
  const span = (k: number) =>
    Math.max(...heads.map((p) => p.max[k]!)) - Math.min(...heads.map((p) => p.min[k]!));
  return Math.max(span(0), span(1));
}

/** How much bigger `from`'s parts are made on a `to` frame (`assemble.ts`'s classScale). */
function classScale(library: Library, from: WeaponTypeName, to: WeaponTypeName): number {
  const target = library.headLength.get(to);
  const length = library.headLength.get(from);
  return from === to || !target || !length ? 1 : clamp(target / length, ...SCALE_RANGE);
}

const toQ = (scale: number) => Math.round(scale * Q);

const strongestBone = (weights: number[], bones: number[]) => {
  let best = 0;
  weights.forEach((w, s) => {
    if (w > (weights[best] ?? 0)) best = s;
  });
  return bones[best] ?? -1;
};

// ---------------------------------------------------------------- blocks

/** A block's chunk as the file has it. */
export interface BlockChunk {
  flags: number;
  blend: number;
  diffuse: number;
  ambient: number;
  /** The bones its vertices' slots name; empty for a block on one bone the stitcher picks. */
  bones: number[];
  hasNormal: boolean;
  /** FFACE and PRIM command words. */
  draws: number[];
  /**
   * Per vertex: x, y, z (units), nx, ny, nz (s8), slot, u, v (u16), and two
   * weights. A melee block's slot is its bone's; a gunner block's packs two
   * (low and high nibble, 15 for none) with their weights (`gunnerSlots`).
   */
  vertices: number[][];
  indices: number[];
}

/** How a block's vertices name their bones. */
type BoneMode = "one" | "strongest" | "weights";

/** No slot (a gunner vertex's second). */
export const NO_SLOT = 15;

export interface Block {
  chunks: BlockChunk[];
  /** The image's offset in the file, its packed size and its size. */
  image: number;
  imagePacked: number;
  imageSize: number;
}

/** A block's head: u32 body, u16 packed and unpacked size; u32 image, u16 packed and unpacked size. */
export const BLOCK_HEAD = 16;
const CHUNK_HEAD = 24;
/** A chunk head's layout bits: normals, and a gunner's two weights. */
const LAYOUT_NORMAL = 1;
const LAYOUT_WEIGHTS = 2;

/** Where a packed item is: its offset, packed size and size. */
export interface Packed {
  at: number;
  packed: number;
  size: number;
}

export function writeBlockHead(body: Packed, image: Packed): Buffer {
  const out = Buffer.alloc(BLOCK_HEAD);
  [body, image].forEach((p, k) => {
    if (p.size > 0xffff) throw new Error(`a block's part is ${p.size} bytes`);
    out.writeUInt32LE(p.at, k * 8);
    out.writeUInt16LE(p.packed, k * 8 + 4);
    out.writeUInt16LE(p.size, k * 8 + 6);
  });
  return out;
}

const readPacked = (buf: Buffer, at: number): Packed => ({
  at: buf.readUInt32LE(at),
  packed: buf.readUInt16LE(at + 4),
  size: buf.readUInt16LE(at + 6),
});

/** A packed item's bytes. */
const unpackAt = (buf: Buffer, { at, packed, size }: Packed) =>
  unpack(buf.subarray(at, at + packed), size);

/** A chunk's index size: a byte when its vertices fit one, as the package has them. */
const indexBytes = (vertices: number) => (vertices <= 0x100 ? 1 : 2);

/**
 * A block's body: u16 chunk count, then per chunk u32 flags, blend,
 * diffuse, ambient; u16 vertex and index count; u8 bone count, layout
 * (LAYOUT_*); u16 draw count; its bones (u8 each); its FFACE and PRIM
 * words; its vertices; its indices (`indexBytes` each, each the one
 * before plus it, wrapping, from 0, which packs better). A vertex is s16
 * x, y, z (units); s8 nx, ny, nz if the chunk has normals; u8 slot if it
 * has bones (a gunner's two, `gunnerSlots`); u8 two weights for a gunner;
 * u16 u, v. None is bigger than the package's own, so a take's bodies fit
 * in what its package takes (`blob/stitch.c`'s arena).
 */
export function blockBody(chunks: readonly BlockChunk[], weights: boolean): Buffer {
  const count = Buffer.alloc(2);
  count.writeUInt16LE(chunks.length, 0);
  const parts: Buffer[] = [count];
  for (const c of chunks) {
    const drawsAt = CHUNK_HEAD + c.bones.length;
    const head = Buffer.alloc(drawsAt + c.draws.length * 4);
    head.writeUInt32LE(c.flags >>> 0, 0);
    head.writeUInt32LE(c.blend >>> 0, 4);
    head.writeUInt32LE(c.diffuse >>> 0, 8);
    head.writeUInt32LE(c.ambient >>> 0, 12);
    head.writeUInt16LE(c.vertices.length, 16);
    head.writeUInt16LE(c.indices.length, 18);
    head.writeUInt8(c.bones.length, 20);
    head.writeUInt8((c.hasNormal ? LAYOUT_NORMAL : 0) | (weights ? LAYOUT_WEIGHTS : 0), 21);
    head.writeUInt16LE(c.draws.length, 22);
    c.bones.forEach((b, k) => head.writeUInt8(b, CHUNK_HEAD + k));
    c.draws.forEach((d, k) => head.writeUInt32LE(d >>> 0, drawsAt + k * 4));
    const out: number[] = [];
    for (const v of c.vertices) {
      for (let k = 0; k < 3; k++) out.push(v[k]! & 0xff, (v[k]! >> 8) & 0xff);
      if (c.hasNormal) out.push(v[3]! & 0xff, v[4]! & 0xff, v[5]! & 0xff);
      if (c.bones.length > 0) out.push(v[6]!);
      if (weights) out.push(v[9] ?? 0, v[10] ?? 0);
      out.push(v[7]! & 0xff, v[7]! >> 8, v[8]! & 0xff, v[8]! >> 8);
    }
    const size = indexBytes(c.vertices.length);
    const indices = Buffer.alloc(c.indices.length * size);
    c.indices.forEach((i, k) => {
      const step = (i - (c.indices[k - 1] ?? 0)) & (size === 1 ? 0xff : 0xffff);
      if (size === 1) indices.writeUInt8(step, k);
      else indices.writeUInt16LE(step, k * 2);
    });
    parts.push(head, Buffer.from(out), indices);
  }
  return Buffer.concat(parts);
}

/**
 * How heavy a block's chunks are, to keep a fewer-vertex take only where it
 * is lighter: 16 bytes a vertex, 2 an index (rounded to 4), 4 a draw and
 * 32 a chunk, as FORGE.BIN had them before blocks were packed, so the same
 * takes are kept.
 */
function heft(chunks: readonly BlockChunk[]): number {
  return chunks.reduce(
    (n, c) =>
      n + 32 + c.draws.length * 4 + c.vertices.length * 16 + ((c.indices.length * 2 + 3) & ~3),
    16,
  );
}

/** Reads a block back from its head at `at` (for the TypeScript stitcher). */
export function readBlock(buf: Buffer, at: number): Block {
  const body = unpackAt(buf, readPacked(buf, at));
  const image = readPacked(buf, at + 8);
  const chunks: BlockChunk[] = [];
  let p = 2;
  for (let n = body.readUInt16LE(0); n > 0; n--) {
    const vertexCount = body.readUInt16LE(p + 16);
    const indexCount = body.readUInt16LE(p + 18);
    const boneCount = body.readUInt8(p + 20);
    const layout = body.readUInt8(p + 21);
    const drawCount = body.readUInt16LE(p + 22);
    const hasNormal = (layout & LAYOUT_NORMAL) !== 0;
    const weights = (layout & LAYOUT_WEIGHTS) !== 0;
    const drawsAt = p + CHUNK_HEAD + boneCount;
    const chunk: BlockChunk = {
      flags: body.readUInt32LE(p),
      blend: body.readUInt32LE(p + 4),
      diffuse: body.readUInt32LE(p + 8),
      ambient: body.readUInt32LE(p + 12),
      bones: Array.from({ length: boneCount }, (_, k) => body.readUInt8(p + CHUNK_HEAD + k)),
      hasNormal,
      draws: Array.from({ length: drawCount }, (_, k) => body.readUInt32LE(drawsAt + k * 4)),
      vertices: [],
      indices: [],
    };
    p = drawsAt + drawCount * 4;
    for (let k = 0; k < vertexCount; k++) {
      const vertex = [body.readInt16LE(p), body.readInt16LE(p + 2), body.readInt16LE(p + 4)];
      p += 6;
      if (hasNormal) {
        vertex.push(body.readInt8(p), body.readInt8(p + 1), body.readInt8(p + 2));
        p += 3;
      } else {
        vertex.push(0, 0, 0);
      }
      vertex.push(boneCount > 0 ? body.readUInt8(p++) : 0);
      const weight = weights ? [body.readUInt8(p), body.readUInt8(p + 1)] : [0, 0];
      if (weights) p += 2;
      vertex.push(body.readUInt16LE(p), body.readUInt16LE(p + 2), ...weight);
      p += 4;
      chunk.vertices.push(vertex);
    }
    const size = indexBytes(vertexCount);
    for (let k = 0, i = 0; k < indexCount; k++) {
      i += size === 1 ? body.readUInt8(p + k) : body.readUInt16LE(p + k * 2);
      chunk.indices.push((i &= size === 1 ? 0xff : 0xffff));
    }
    p += indexCount * size;
    chunks.push(chunk);
  }
  if (p !== body.length) throw new Error("a block's body doesn't add up");
  return { chunks, image: image.at, imagePacked: image.packed, imageSize: image.size };
}

/** A block's image record (`imageRecord`), unpacked. */
export const readImage = (buf: Buffer, block: Block) =>
  unpackAt(buf, { at: block.image, packed: block.imagePacked, size: block.imageSize });

const OP_PRIM = 0x04;
const OP_FFACE = 0x9b;
const MAX_BONES = 8;

/** A gunner vertex's bones (source bones) with their weights: those weighted, at most two, else its strongest. */
function gunnerSlots(v: PartVertex): [number, number][] {
  const on: [number, number][] = [];
  v.weights.forEach((w, s) => {
    const bone = v.bones[s] ?? -1;
    if (w > 0 && bone >= 0) on.push([bone, w]);
  });
  if (on.length > 2) throw new Error(`a gunner vertex has ${on.length} weights`);
  return on.length > 0 ? on : [[Math.max(0, strongestVertexBone(v)), 0]];
}

/**
 * `parts`' chunks as block chunks: merged by material and blend, with
 * positions in units and UVs in the block's texture (`place`). Bones by
 * `mode`: "one", the stitcher puts the whole block on one bone; "strongest",
 * each vertex keeps its strongest (a second piece); "weights", each keeps
 * its weights (a gunner's, `gunnerSlots`).
 */
function blockChunks(
  parts: readonly { chunks: readonly PartChunk[] }[],
  unit: number,
  place: (uv: readonly [number, number]) => [number, number],
  mode: BoneMode,
): BlockChunk[] {
  const ownBones = mode !== "one";
  interface Building {
    chunk: BlockChunk;
    strips: { prim: number; frontFace: number; indices: number[] }[];
  }
  const out: Building[] = [];
  const add = (source: PartChunk) => {
    const bonesOf =
      mode === "weights"
        ? [...new Set(source.vertices.flatMap((v) => gunnerSlots(v).map(([b]) => b)))]
        : ownBones
          ? [...new Set(source.vertices.map((v) => Math.max(0, strongestBone(v.weights, v.bones))))]
          : [];
    const hasNormal = source.vertices.every((v) => v.normal);
    let into = out.find(
      ({ chunk: c }) =>
        c.flags === source.flags &&
        c.blend === source.blend &&
        c.diffuse === source.diffuse &&
        c.ambient === source.ambient &&
        c.hasNormal === hasNormal &&
        c.vertices.length + source.vertices.length <= 0xffff &&
        new Set([...c.bones, ...bonesOf]).size <= MAX_BONES,
    );
    if (!into) {
      into = {
        chunk: {
          flags: source.flags,
          blend: source.blend,
          diffuse: source.diffuse,
          ambient: source.ambient,
          bones: [],
          hasNormal,
          draws: [],
          vertices: [],
          indices: [],
        },
        strips: [],
      };
      out.push(into);
    }
    const c = into.chunk;
    for (const b of bonesOf) if (!c.bones.includes(b)) c.bones.push(b);
    const base = c.vertices.length;
    for (const v of source.vertices) {
      const [u, w] = place(v.uv);
      let slot = ownBones ? c.bones.indexOf(Math.max(0, strongestBone(v.weights, v.bones))) : 0;
      let weights = [0, 0];
      if (mode === "weights") {
        const on = gunnerSlots(v);
        const [a, b] = on.map(([bone]) => c.bones.indexOf(bone));
        slot = a! | ((b ?? NO_SLOT) << 4);
        weights = [on[0]![1], on[1]?.[1] ?? 0];
      }
      c.vertices.push([
        ...v.position.map((p) => clamp(Math.round(p * unit), -0x7fff, 0x7fff)),
        ...(v.normal ?? [0, 0, 0]).map((n) =>
          hasNormal ? clamp(Math.round(n * 0x7f), -0x7f, 0x7f) : 0,
        ),
        slot,
        clamp(Math.round(u * 0x8000), 0, 0xffff),
        clamp(Math.round(w * 0x8000), 0, 0xffff),
        ...weights,
      ]);
    }
    for (const s of source.strips) {
      into.strips.push({ ...s, indices: s.indices.map((i) => i + base) });
    }
  };
  for (const part of parts) for (const chunk of part.chunks) add(chunk);
  return out.map(({ chunk, strips }) => {
    let frontFace = -1;
    let last: { prim: number; count: number } | null = null;
    const draws: (number | { prim: number; count: number })[] = [];
    for (const strip of strips) {
      if (strip.frontFace !== frontFace) {
        frontFace = strip.frontFace;
        draws.push(((OP_FFACE << 24) | frontFace) >>> 0);
        last = null;
      }
      // Separate triangle lists draw as one.
      if (
        last &&
        last.prim === 3 &&
        strip.prim === 3 &&
        last.count + strip.indices.length <= 0xffff
      ) {
        last.count += strip.indices.length;
      } else {
        last = { prim: strip.prim, count: strip.indices.length };
        draws.push(last);
      }
      chunk.indices.push(...strip.indices);
    }
    chunk.draws = draws.map((d) =>
      typeof d === "number" ? d : ((OP_PRIM << 24) | ((d.prim & 7) << 16) | d.count) >>> 0,
    );
    return chunk;
  });
}

// ---------------------------------------------------------------- images

/** A TMH image record: an 8-bit swizzled image and its palette of up to 64 colours. */
export function imageRecord(rgba: Buffer, width: number, height: number): Buffer {
  const keys = new Map<string, number>();
  const colors: { rgba: Rgba; count: number }[] = [];
  const pixels: number[] = [];
  let partialAlpha = false;
  for (let p = 0; p < width * height; p++) {
    const c = [...rgba.subarray(p * 4, p * 4 + 4)] as Rgba;
    if (c[3] > 0 && c[3] < 255) partialAlpha = true;
    const key = c.join();
    let i = keys.get(key);
    if (i === undefined) {
      i = colors.push({ rgba: c, count: 0 }) - 1;
      keys.set(key, i);
    }
    colors[i]!.count++;
    pixels.push(i);
  }
  const { palette, index } = reduceColors(colors, COLORS);
  // Palettes load in blocks of 8 entries (the game's CLOAD rounds up).
  const count = Math.max(8, (palette.length + 7) & ~7);
  const format = partialAlpha ? 3 : 1;
  const entry = format === 3 ? 4 : 2;
  const pixelBytes = width * height;
  const total = 16 + 16 + pixelBytes + 16 + count * entry;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(total, 0);
  out.writeUInt32LE(0, 4);
  out.writeUInt32LE(1, 8);
  out.writeUInt32LE(1, 12);
  out.writeUInt32LE(16 + pixelBytes, 16);
  out.writeUInt32LE(1, 20);
  out.writeUInt32LE(5, 24);
  out.writeUInt16LE(width, 28);
  out.writeUInt16LE(height, 30);
  swizzle(Buffer.from(pixels.map((c) => index[c]!)), width, height).copy(out, 32);
  const at = 32 + pixelBytes;
  out.writeUInt32LE(16 + count * entry, at);
  out.writeUInt32LE(2, at + 4);
  out.writeUInt32LE(format, at + 8);
  out.writeUInt32LE(count, at + 12);
  palette.forEach((c, i) => {
    const value = encodeDirectColor(c, format);
    if (entry === 4) out.writeUInt32LE(value >>> 0, at + 16 + i * 4);
    else out.writeUInt16LE(value, at + 16 + i * 2);
  });
  return out;
}

/** `parts`' texels packed into the smallest texture that keeps them about as sharp. */
function packBlock(texture: TmhImage, parts: readonly { chunks: readonly PartChunk[] }[]) {
  const sources = [
    { key: "block", image: texture, material: null, chunks: parts.flatMap((p) => p.chunks) },
  ];
  for (const [w, h] of SIZES) {
    const atlas = packIslands(sources, w, h, SHARP);
    if (atlas) return atlas;
  }
  return packIslands(sources, 64, 64);
}

// ---------------------------------------------------------------- the file

/** One model's numbers for placement, in units (see `stitch.ts`). */
export interface ForgeRecord {
  handleBone: number;
  headBone: number;
  twinHandle: number;
  twinHead: number;
  cut: number;
  /** The highest z of the handle's triangles on the axis, or NO_SPAN_HI. */
  shaftTop: number;
  /** The head's lowest point, its guard's highest and its low trim's, from its cut. */
  headBottom: number;
  guardTop: number;
  extrasUnder: number;
  /** The head's width across and its widest guard piece's. */
  headWidth: number;
  guardWidth: number;
  /** Per role (and REDUCED + role): the block's offset and size, or 0, 0. */
  refs: [number, number][];
  /** The head's scale (Q12) on a frame of each class (`headScaleFor`). */
  headScale: number[];
  /** Seat tables (`stairs`) of the head and its guard. */
  headStairs: [number, number][];
  guardStairs: [number, number][];
  /** The head's top above its cut, and its sides (least x, y, most x, y), in units. */
  headTop: number;
  headBox: [number, number, number, number];
  /** A bow's or bowgun's numbers (its melee ones are 0), or null. */
  gunner: GunnerRecord | null;
}

/** A piece of trim or a glow another head may borrow (`rollRecipe`'s extras and effect). */
export interface ForgePiece {
  /** Its model's index entry. */
  model: number;
  glow: boolean;
  /** Its block's offset. */
  block: number;
  /** Its bounds, in units. */
  min: [number, number, number];
  max: [number, number, number];
}

/** A piece: u16 model (index entry), u8 1 for a glow, u8 0, u32 block, s16 least x, y, z, most x, y, z. */
export function writePiece(p: ForgePiece): Buffer {
  const out = Buffer.alloc(PIECE_BYTES);
  out.writeUInt16LE(p.model, 0);
  out.writeUInt8(p.glow ? 1 : 0, 2);
  out.writeUInt32LE(p.block, 4);
  [...p.min, ...p.max].forEach((v, k) => out.writeInt16LE(clamp(v, -0x8000, 0x7fff), 8 + k * 2));
  return out;
}

/** What the stitcher needs of a bow or bowgun beyond its blocks. */
export interface GunnerRecord {
  /** Light bowguns: where the barrel starts along z, and the limb bone's z (units, drawn). */
  barrelStart: number;
  limbZ: number;
  /** Its skeleton's parents. */
  parents: number[];
  /**
   * Per bone, the drawn pose's skin (bind to drawn): the 3x3 row by row in
   * Q14 (SKIN_Q), then the translation in units.
   */
  skins: number[][];
  /** Heavy bowguns: the models whose barrel meets its body (`gapBetween`). */
  meets: number[];
  /** Where in the file its skins and meets are. */
  at: number;
}

export interface ForgeIndexEntry {
  model: number;
  type: number;
  flags: number;
  shape: number;
  classFlags: number;
}

export interface ForgeLibrary {
  unitShift: number;
  /** Per frame class: its usual guard width in units, or 0. */
  guardTarget: number[];
  /** Per class, per frame class: the scale (Q12) of the one's parts on the other. */
  classScale: number[][];
  index: ForgeIndexEntry[];
  records: ForgeRecord[];
  pieces: ForgePiece[];
}

const HEAD_STAIRS_AT = 176;
const GUARD_STAIRS_AT = HEAD_STAIRS_AT + HEAD_STAIRS * 4;
const HEAD_TOP_AT = GUARD_STAIRS_AT + GUARD_STAIRS * 4;

/**
 * A record: s8 bones (handle, head, twin handle, twin head); s16 cut, shaft
 * top, head bottom, guard top, extras under; u16 head width, guard width;
 * u8 head and guard seat steps; at 32 the block references (u32 offset,
 * size); at 160 the head's scale per frame class (u16 Q12); at 176 and 240
 * the seat tables (s16 distance, s16 z); at 272 s16 the head's top above
 * its cut and its sides (least x, y, most x, y).
 *
 * A gunner's: s16 barrel start, limb z; u8 bone count, s8 parents (8); at
 * 20 u32 where its skins (s32 x 12 per bone) and then its meets (u16 x
 * meet count) are, at 24 u16 meet count; at 32 the block references.
 */
export function writeRecord(r: ForgeRecord): Buffer {
  const out = Buffer.alloc(RECORD_BYTES);
  const s16 = (v: number) => clamp(v, -0x8000, 0x7fff);
  if (r.gunner) {
    const g = r.gunner;
    out.writeInt16LE(s16(g.barrelStart), 4);
    out.writeInt16LE(s16(g.limbZ), 6);
    out.writeUInt8(g.parents.length, 8);
    g.parents.forEach((p, k) => out.writeInt8(p, 9 + k));
    out.writeUInt32LE(g.at, 20);
    out.writeUInt16LE(g.meets.length, 24);
    r.refs.forEach(([offset, size], k) => {
      out.writeUInt32LE(offset, 32 + k * 8);
      out.writeUInt32LE(size, 36 + k * 8);
    });
    return out;
  }
  [r.handleBone, r.headBone, r.twinHandle, r.twinHead].forEach((b, k) => out.writeInt8(b, k));
  [r.cut, r.shaftTop, r.headBottom, r.guardTop, r.extrasUnder].forEach((v, k) =>
    out.writeInt16LE(s16(v), 4 + k * 2),
  );
  out.writeUInt16LE(clamp(r.headWidth, 0, 0xffff), 14);
  out.writeUInt16LE(clamp(r.guardWidth, 0, 0xffff), 16);
  out.writeUInt8(r.headStairs.length, 18);
  out.writeUInt8(r.guardStairs.length, 19);
  r.refs.forEach(([offset, size], k) => {
    out.writeUInt32LE(offset, 32 + k * 8);
    out.writeUInt32LE(size, 36 + k * 8);
  });
  r.headScale.forEach((s, k) => out.writeUInt16LE(s, 160 + k * 2));
  const table = (list: [number, number][], at: number) =>
    list.forEach(([d, z], k) => {
      out.writeInt16LE(s16(d), at + k * 4);
      out.writeInt16LE(s16(z), at + k * 4 + 2);
    });
  table(r.headStairs, HEAD_STAIRS_AT);
  table(r.guardStairs, GUARD_STAIRS_AT);
  [r.headTop, ...r.headBox].forEach((v, k) => out.writeInt16LE(s16(v), HEAD_TOP_AT + k * 2));
  return out;
}

/** A record's melee numbers, for a gunner's. */
const EMPTY_RECORD: Omit<ForgeRecord, "refs" | "gunner"> = {
  handleBone: 0,
  headBone: 0,
  twinHandle: 0,
  twinHead: 0,
  cut: 0,
  shaftTop: 0,
  headBottom: 0,
  guardTop: 0,
  extrasUnder: 0,
  headWidth: 0,
  guardWidth: 0,
  headScale: Array.from({ length: CLASSES }, () => 0),
  headStairs: [],
  guardStairs: [],
  headTop: 0,
  headBox: [0, 0, 0, 0],
};

export function readForgeLibrary(buf: Buffer): ForgeLibrary {
  if (buf.readUInt32LE(0) !== FORGE_MAGIC) throw new Error("not a FORGE.BIN");
  if (buf.readUInt32LE(4) !== FORGE_VERSION) throw new Error("not this version of FORGE.BIN");
  const count = buf.readUInt16LE(16);
  const indexAt = buf.readUInt32LE(20);
  const recordAt = buf.readUInt32LE(24);
  const classAt = buf.readUInt32LE(28);
  const guardTarget = Array.from({ length: CLASSES }, (_, t) => buf.readUInt16LE(classAt + t * 2));
  const classScale = Array.from({ length: CLASSES }, (_, from) =>
    Array.from({ length: CLASSES }, (_, to) =>
      buf.readUInt16LE(classAt + CLASSES * 2 + (from * CLASSES + to) * 2),
    ),
  );
  const index: ForgeIndexEntry[] = [];
  const records: ForgeRecord[] = [];
  for (let n = 0; n < count; n++) {
    const i = indexAt + n * INDEX_BYTES;
    index.push({
      model: buf.readUInt16LE(i),
      type: buf.readUInt8(i + 2),
      flags: buf.readUInt8(i + 3),
      shape: buf.readUInt8(i + 4),
      classFlags: buf.readUInt8(i + 5),
    });
    const r = recordAt + n * RECORD_BYTES;
    const refs = Array.from({ length: REFS }, (_, k): [number, number] => [
      buf.readUInt32LE(r + 32 + k * 8),
      buf.readUInt32LE(r + 36 + k * 8),
    ]);
    if (index[n]!.type >= GUNNER_CLASS) {
      const bones = buf.readUInt8(r + 8);
      const at = buf.readUInt32LE(r + 20);
      const meets = buf.readUInt16LE(r + 24);
      records.push({
        ...EMPTY_RECORD,
        refs,
        gunner: {
          barrelStart: buf.readInt16LE(r + 4),
          limbZ: buf.readInt16LE(r + 6),
          parents: Array.from({ length: bones }, (_, k) => buf.readInt8(r + 9 + k)),
          skins: Array.from({ length: bones }, (_, b) =>
            Array.from({ length: 12 }, (_, k) => buf.readInt32LE(at + (b * 12 + k) * 4)),
          ),
          meets: Array.from({ length: meets }, (_, k) => buf.readUInt16LE(at + bones * 48 + k * 2)),
          at,
        },
      });
      continue;
    }
    const s16 = (k: number) => buf.readInt16LE(r + 4 + k * 2);
    const table = (at: number, length: number) =>
      Array.from({ length }, (_, k): [number, number] => [
        buf.readInt16LE(r + at + k * 4),
        buf.readInt16LE(r + at + k * 4 + 2),
      ]);
    records.push({
      handleBone: buf.readInt8(r),
      headBone: buf.readInt8(r + 1),
      twinHandle: buf.readInt8(r + 2),
      twinHead: buf.readInt8(r + 3),
      cut: s16(0),
      shaftTop: s16(1),
      headBottom: s16(2),
      guardTop: s16(3),
      extrasUnder: s16(4),
      headWidth: buf.readUInt16LE(r + 14),
      guardWidth: buf.readUInt16LE(r + 16),
      refs,
      headScale: Array.from({ length: CLASSES }, (_, k) => buf.readUInt16LE(r + 160 + k * 2)),
      headStairs: table(HEAD_STAIRS_AT, buf.readUInt8(r + 18)),
      guardStairs: table(GUARD_STAIRS_AT, buf.readUInt8(r + 19)),
      headTop: buf.readInt16LE(r + HEAD_TOP_AT),
      headBox: [0, 1, 2, 3].map((k) => buf.readInt16LE(r + HEAD_TOP_AT + 2 + k * 2)) as [
        number,
        number,
        number,
        number,
      ],
      gunner: null,
    });
  }
  const piecesAt = buf.readUInt32LE(32);
  const pieces = Array.from({ length: buf.readUInt32LE(36) }, (_, k): ForgePiece => {
    const p = piecesAt + k * PIECE_BYTES;
    const v = (j: number) => buf.readInt16LE(p + 8 + j * 2);
    return {
      model: buf.readUInt16LE(p),
      glow: buf.readUInt8(p + 2) === 1,
      block: buf.readUInt32LE(p + 4),
      min: [v(0), v(1), v(2)],
      max: [v(3), v(4), v(5)],
    };
  });
  return { unitShift: buf.readUInt32LE(12), guardTarget, classScale, index, records, pieces };
}

/** The parts each role's block takes. */
function roleParts(w: WeaponParts): Part[][] {
  const high = (p: Part) => p.min[2] >= w.cut - BELOW_CUT;
  const extras = slotParts(w, "extra");
  const effects = slotParts(w, "effect");
  return [
    slotParts(w, "handle"),
    slotParts(w, "head"),
    slotParts(w, "guard"),
    extras.filter(high),
    extras.filter((p) => !high(p)),
    effects.filter(high),
    effects.filter((p) => !high(p)),
    slotParts(w, "second"),
  ];
}

/** Whether a weapon's head can be seated on another handle (`rollRecipe`'s `usable`, less the handle). */
const reachesAxis = (w: WeaponParts) =>
  axisRange(slotParts(w, "head", "guard"), NEAR_AXIS) !== null;

export function weaponFlags(w: WeaponParts): number {
  let flags = 0;
  if (lendsHandle(w)) flags |= FLAG.lends;
  if (hasSlot(w, "head") && slotParts(w, "extra", "guard", "effect").every(fitsTexture))
    flags |= FLAG.head;
  if (!w.shafted && reachesAxis(w)) flags |= FLAG.seats;
  if (guardCentred(w)) flags |= FLAG.guard;
  if (hasSlot(w, "second")) flags |= FLAG.second;
  if (slotParts(w, "second").length > 0) flags |= FLAG.secondParts;
  if (w.type === "dual-blades" && secondBones(w) !== null) flags |= FLAG.twin;
  if (w.gripInHandle) flags |= FLAG.grip;
  return flags;
}

export function gunnerFlags(w: GunnerParts): number {
  let flags = 0;
  GUNNER_ROLES.forEach((slot) => {
    if (hasGunnerSlot(w, slot)) flags |= GFLAG[slot];
  });
  if (gunnerSlot(w, "second").length > 0) flags |= GFLAG.secondParts;
  return flags;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * `FORGE.BIN` for `weapons` (every melee model's parts, as `meleeParts`
 * cuts them) and `gunners` (every bow's and bowgun's, as `gunnerParts`
 * cuts them).
 */
export function buildForgeLibrary(
  weapons: readonly WeaponParts[],
  gunners: readonly GunnerParts[] = [],
): Buffer {
  const all = [...weapons, ...gunners].flatMap((w) =>
    w.parts.flatMap((p) => [...p.min, ...p.max].map(Math.abs)),
  );
  const reach = Math.max(1, ...all);
  let unitShift = 0;
  while (reach * 2 ** (unitShift + 1) <= UNIT_LIMIT && unitShift < 8) unitShift++;
  const unit = 2 ** unitShift;
  const toUnits = (v: number) => Math.round(v * unit);
  const library = buildLibrary([...weapons]);

  const shapes: string[] = [];
  const shapeOf = (shape: string) => {
    if (!shapes.includes(shape)) shapes.push(shape);
    return shapes.indexOf(shape);
  };
  const index: ForgeIndexEntry[] = [
    ...weapons.map((w) => ({
      model: w.model,
      type: MELEE_TYPES.indexOf(w.type),
      flags: weaponFlags(w),
      shape: shapeOf(w.shape),
      classFlags: GUARDED.has(w.type) ? CLASS_FLAG.guarded : 0,
    })),
    ...gunners.map((w) => ({
      model: w.model,
      type: GUNNER_CLASS + GUNNER_TYPES.indexOf(w.type),
      flags: gunnerFlags(w),
      shape: shapeOf(w.shape),
      classFlags: 0,
    })),
  ];
  const count = index.length;
  if (count > MAX_MODELS) throw new Error(`${count} models; the blob reads at most ${MAX_MODELS}`);

  const indexAt = HEADER_BYTES + CLASS_BYTES;
  const recordAt = indexAt + count * INDEX_BYTES;
  const blocksStart = align16(recordAt + count * RECORD_BYTES);
  const chunks: Buffer[] = [];
  let at = blocksStart;
  const append = (b: Buffer) => {
    const offset = at;
    chunks.push(b);
    at += b.length;
    return offset;
  };
  const packed = (data: Buffer): Packed => {
    const p = pack(data);
    return { at: append(p), packed: p.length, size: data.length };
  };
  /** Bodies by their bytes: a block with the same chunks as another shares its body. */
  const bodies = new Map<string, Packed>();
  /** A block's head on `image`; its offset and its body's size. */
  const block = (chunks: BlockChunk[], image: Packed, weights = false): [number, number] => {
    if (chunks.length > MAX_CHUNKS) throw new Error(`a block has ${chunks.length} chunks`);
    const body = blockBody(chunks, weights);
    const key = body.toString("latin1");
    let at = bodies.get(key);
    if (!at) bodies.set(key, (at = packed(body)));
    return [append(writeBlockHead(at, image)), body.length];
  };

  const pieces: ForgePiece[] = [];
  const records = weapons.map((w, model): ForgeRecord => {
    const roles = roleParts(w);
    const refs: [number, number][] = Array.from({ length: REFS }, () => [0, 0]);
    roles.forEach((parts, role) => {
      const usable = parts.filter(fitsTexture);
      if (usable.length === 0 || usable.length !== parts.length) return;
      const atlas = packBlock(w.texture, parts);
      if (!atlas) return;
      const image = packed(imageRecord(atlas.rgba, atlas.size, atlas.height));
      const place = (uv: readonly [number, number]) => atlas.place("block", uv);
      const own = role === ROLE.second ? "strongest" : "one";
      const full = blockChunks(parts, unit, place, own);
      refs[role] = block(full, image);
      // Trim and glows another head may borrow, one block each on the role's image.
      const glow = role === ROLE.effectHigh || role === ROLE.effectLow;
      if (glow || role === ROLE.extraHigh) {
        for (const p of parts) {
          if (!glow && p.triangles > EXTRA_TRIANGLES) continue;
          pieces.push({
            model,
            glow,
            block: block(blockChunks([p], unit, place, own), image)[0],
            min: p.min.map(toUnits) as [number, number, number],
            max: p.max.map(toUnits) as [number, number, number],
          });
        }
      }
      if (
        role === ROLE.handle ||
        role === ROLE.head ||
        role === ROLE.guard ||
        role === ROLE.second
      ) {
        const lighter = parts.map((p) => simplified(p, REDUCED_SCALE));
        if (lighter.some((p, k) => p !== parts[k])) {
          const reduced = blockChunks(lighter, unit, place, own);
          if (heft(reduced) < heft(full)) refs[REDUCED + role] = block(reduced, image);
        }
      }
    });
    const shaft = axisRange(slotParts(w, "handle"), ON_AXIS);
    const headParts = slotParts(w, "head");
    const headBottom =
      headParts.length > 0 ? Math.min(...headParts.map((p) => p.min[2])) - w.cut : 0;
    const top = (parts: Part[]) => Math.max(0, ...parts.map((p) => p.max[2] - w.cut));
    const twin = w.type === "dual-blades" ? secondBones(w) : null;
    const bone = (b: number) => (b >= 0 ? b : Math.max(0, w.headBone, w.handleBone));
    return {
      handleBone: bone(w.handleBone),
      headBone: bone(w.headBone),
      twinHandle: twin?.[0] ?? -1,
      twinHead: twin?.[1] ?? -1,
      cut: toUnits(w.cut),
      shaftTop: shaft ? toUnits(shaft[1]) : NO_SPAN_HI,
      headBottom: toUnits(headBottom),
      guardTop: toUnits(top(slotParts(w, "guard"))),
      extrasUnder: toUnits(top(slotParts(w, "extra").filter((p) => p.min[2] - w.cut < headBottom))),
      headWidth: toUnits(headWidthOf(w)),
      guardWidth: toUnits(guardWidthOf(w)),
      refs,
      headScale: MELEE_TYPES.map((type) => toQ(headScaleFor(w, type, library))),
      headStairs: stairs(headParts, unit, HEAD_STAIRS),
      guardStairs: stairs(slotParts(w, "guard"), unit, GUARD_STAIRS),
      // As `forgeWeapon` measures a head for borrowed trim: its length and sides.
      headTop:
        headParts.length > 0 ? toUnits(Math.max(...headParts.map((p) => p.max[2])) - w.cut) : 0,
      headBox: (headParts.length > 0
        ? [
            ...[0, 1].map((k) => toUnits(Math.min(...headParts.map((p) => p.min[k]!)))),
            ...[0, 1].map((k) => toUnits(Math.max(...headParts.map((p) => p.max[k]!)))),
          ]
        : [0, 0, 0, 0]) as [number, number, number, number],
      gunner: null,
    };
  });
  const gunnerAt = weapons.length;
  gunners.forEach((w) => {
    const refs: [number, number][] = Array.from({ length: REFS }, () => [0, 0]);
    GUNNER_ROLES.forEach((slot, role) => {
      if (!hasGunnerSlot(w, slot)) return;
      const parts = gunnerSlot(w, slot);
      const atlas = packBlock(w.texture, parts);
      if (!atlas) return;
      const image = packed(imageRecord(atlas.rgba, atlas.size, atlas.height));
      const place = (uv: readonly [number, number]) => atlas.place("block", uv);
      refs[role] = block(blockChunks(parts, unit, place, "weights"), image, true);
    });
    if (w.bones.length > GUNNER_BONES)
      throw new Error(`model ${w.model} has ${w.bones.length} bones`);
    const skins = w.bones.map((_, b) => {
      const m = w.drawn[b] ?? IDENTITY;
      const rows = [0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => Math.round(m[c * 4 + r]! * SKIN_Q)),
      );
      return [...rows, ...[12, 13, 14].map((k) => toUnits(m[k]!))];
    });
    const meets =
      w.type === "heavy-bowgun"
        ? gunners.flatMap((v, k) =>
            v !== w &&
            v.type === w.type &&
            hasGunnerSlot(v, "barrel") &&
            gapBetween(w, v) <= MEET_GAP
              ? [gunnerAt + k]
              : [],
          )
        : [];
    const extra = Buffer.alloc(skins.length * 48 + meets.length * 2);
    skins.flat().forEach((v, k) => extra.writeInt32LE(v, k * 4));
    meets.forEach((m, k) => extra.writeUInt16LE(m, skins.length * 48 + k * 2));
    records.push({
      ...EMPTY_RECORD,
      refs,
      gunner: {
        barrelStart: toUnits(w.barrelStart),
        limbZ: toUnits(w.bones[LBG_LIMBS]?.translation[2] ?? 0),
        parents: w.bones.map((b) => b.parent),
        skins,
        meets,
        at: append(extra),
      },
    });
  });

  if (pieces.length > MAX_PIECES)
    throw new Error(`${pieces.length} pieces; the blob reads at most ${MAX_PIECES}`);
  const piecesAt = append(Buffer.concat(pieces.map(writePiece)));
  const head = Buffer.alloc(blocksStart);
  head.writeUInt32LE(FORGE_MAGIC, 0);
  head.writeUInt32LE(FORGE_VERSION, 4);
  head.writeUInt32LE(at, 8);
  head.writeUInt32LE(unitShift, 12);
  head.writeUInt16LE(count, 16);
  head.writeUInt32LE(indexAt, 20);
  head.writeUInt32LE(recordAt, 24);
  head.writeUInt32LE(HEADER_BYTES, 28);
  head.writeUInt32LE(piecesAt, 32);
  head.writeUInt32LE(pieces.length, 36);
  MELEE_TYPES.forEach((to, t) => {
    const target = library.guardWidth.get(to);
    head.writeUInt16LE(
      target === undefined ? 0 : clamp(toUnits(target), 0, 0xffff),
      HEADER_BYTES + t * 2,
    );
    MELEE_TYPES.forEach((from, f) => {
      const at = HEADER_BYTES + CLASSES * 2 + (f * CLASSES + t) * 2;
      head.writeUInt16LE(toQ(classScale(library, from, to)), at);
    });
  });
  index.forEach((e, n) => {
    const i = indexAt + n * INDEX_BYTES;
    head.writeUInt16LE(e.model, i);
    head.writeUInt8(e.type, i + 2);
    head.writeUInt8(e.flags, i + 3);
    head.writeUInt8(e.shape, i + 4);
    head.writeUInt8(e.classFlags, i + 5);
  });
  records.forEach((r, n) => writeRecord(r).copy(head, recordAt + n * RECORD_BYTES));
  return Buffer.concat([head, ...chunks]);
}

export const NO_SPAN = { lo: NO_SPAN_LO, hi: NO_SPAN_HI } as const;
export type { WeaponTypeName };
