/**
 * Weapon parts: a melee weapon model cut into the slots the forge
 * (`assemble.ts`) builds new weapons from.
 *
 * Every melee model lies along +z with the grip at the origin, where the
 * hunter's fist holds it, so the handle is what lies below the point where
 * the weapon widens out of the grip (`cut`) and the head is what lies above.
 * The models are made of loose, unwelded pieces (a pommel, grip wraps, a
 * guard, blade halves, rings, spikes): pieces are the unit a slot takes,
 * and a piece running through the cut (some blades are one piece from
 * pommel to tip) is split there by strip.
 *
 * - handle: everything below the cut.
 * - guard: wide, short pieces sitting on the cut.
 * - head: the big pieces above the cut (the blade, hammer head, horn).
 * - extra: the small pieces above it (rings, spikes, studs).
 * - effect: pieces drawn blended (glows, translucent layers).
 * - second: the second piece's (shield, other blade) pieces, together.
 *
 * Geometry is kept in model units with UVs in texture space, so parts from
 * different models can be placed, scaled and packed together.
 */
import { readAhi, isAhi } from "mhfu-extract/src/models/ahi.js";
import { decodeVertexType } from "mhfu-extract/src/models/ge.js";
import { readPac } from "mhfu-extract/src/models/pac.js";
import { isPmo } from "mhfu-extract/src/models/pmo.js";
import { parsePmoFile } from "mhfu-extract/src/models/pmo-file.js";
import { isTmh, readTmh, type TmhImage } from "mhfu-extract/src/models/tmh.js";
import type { WeaponTypeName } from "mhfu-extract/src/tables/weapons.js";

export type Vec3 = [number, number, number];

export type Slot = "handle" | "guard" | "head" | "extra" | "effect" | "second";

export interface PartVertex {
  /** Model units. */
  position: Vec3;
  /** Unit length, or null when the model has none. */
  normal: Vec3 | null;
  /** Texture space: 0-1 spans the source texture. */
  uv: [number, number];
  /** Raw u8 weights (0x80 = 1) and the bone each applies. */
  weights: number[];
  bones: number[];
}

/** One PRIM as the source drew it, with indices into its chunk's vertices. */
export interface PartStrip {
  prim: number;
  frontFace: number;
  indices: number[];
}

/** A part's strips that share a material and blend. */
export interface PartChunk {
  /** The source mesh's flags and blend. */
  flags: number;
  blend: number;
  diffuse: number;
  ambient: number;
  vertices: PartVertex[];
  strips: PartStrip[];
}

export interface Part {
  slot: Slot;
  model: number;
  type: WeaponTypeName;
  chunks: PartChunk[];
  min: Vec3;
  max: Vec3;
  uvMin: [number, number];
  uvMax: [number, number];
  triangles: number;
  /** Triangle area, model units squared. */
  area: number;
}

export interface WeaponParts {
  model: number;
  type: WeaponTypeName;
  parts: Part[];
  texture: TmhImage;
  /** Where the handle ends, along z. */
  cut: number;
  /**
   * Whether the handle runs through the fist (z = 0). Many great swords,
   * long swords, lances and gunlances have their grip inside the blade or
   * vamplate piece instead, and only a pommel below it.
   */
  gripInHandle: boolean;
  /**
   * Whether the head hangs on the weapon's own shaft: the handle runs on up
   * past the cut to where the head widens out, with only the head's thin
   * neck (if anything) around it. Dual Diablo's club and Gunhammer's drum do.
   */
  shafted: boolean;
  /** The bone most of the handle's and head's vertices follow. */
  handleBone: number;
  headBone: number;
  /** The skeleton's parents, joined: models with the same shape share bones. */
  shape: string;
  rootOf: number[];
}

/** The classes whose models have a guard between grip and head (hammers and horns don't). */
export const GUARDED: ReadonlySet<WeaponTypeName> = new Set([
  "great-sword",
  "long-sword",
  "sword-and-shield",
  "dual-blades",
  "lance",
  "gunlance",
]);

export const MELEE_TYPES: readonly WeaponTypeName[] = [
  "great-sword",
  "long-sword",
  "sword-and-shield",
  "dual-blades",
  "hammer",
  "hunting-horn",
  "lance",
  "gunlance",
];

const POSITION_FULL = [0, 0x7f, 0x7fff, 0, 1] as const;
const NORMAL_FULL = [0, 0x7f, 0x7fff, 0, 1] as const;
const UV_FULL = [0, 0x80, 0x8000, 0, 1] as const;

/** A strip with its vertices resolved, before it is sorted into a part. */
interface RawStrip {
  flags: number;
  blend: number;
  diffuse: number;
  ambient: number;
  prim: number;
  frontFace: number;
  vertices: PartVertex[];
  root: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** The triangles a strip draws, as vertex triples (degenerates dropped). */
export function stripTriangles<T>(prim: number, vertices: readonly T[]): [T, T, T][] {
  const out: [T, T, T][] = [];
  const push = (a: T, b: T, c: T) => {
    if (a !== b && b !== c && a !== c) out.push([a, b, c]);
  };
  if (prim === 3)
    for (let i = 0; i + 2 < vertices.length; i += 3)
      push(vertices[i]!, vertices[i + 1]!, vertices[i + 2]!);
  else if (prim === 4)
    for (let i = 0; i + 2 < vertices.length; i++)
      push(vertices[i]!, vertices[i + 1]!, vertices[i + 2]!);
  else if (prim === 5)
    for (let i = 1; i + 1 < vertices.length; i++)
      push(vertices[0]!, vertices[i]!, vertices[i + 1]!);
  return out;
}

function stripArea(strip: RawStrip): number {
  return stripTriangles(strip.prim, strip.vertices).reduce(
    (sum, [a, b, c]) =>
      sum + length(cross(sub(b.position, a.position), sub(c.position, a.position))) / 2,
    0,
  );
}

/** Reads a model's strips with their vertices in model units. */
export function readStrips(pmoBytes: Buffer, rootOf: number[]): RawStrip[] {
  const pmo = parsePmoFile(pmoBytes);
  const slots: number[] = [];
  const strips: RawStrip[] = [];
  for (const mesh of pmo.meshes) {
    for (const group of mesh.groups) {
      for (const [slot, bone] of group.palette) slots[slot] = bone;
      const fmt = decodeVertexType(group.list.vertexType);
      const material = pmo.materials[mesh.materialSlots[group.materialSlot]!]!;
      const vertices = group.list.vertices.map((v): PartVertex => {
        const position = v.position.map(
          (q, i) => (q / POSITION_FULL[fmt.positionSize]!) * pmo.scale[i]!,
        ) as Vec3;
        const n = v.normal?.map((q) => q / NORMAL_FULL[fmt.normalSize]!) as Vec3 | undefined;
        const nl = n ? length(n) : 0;
        return {
          position,
          normal: n && nl > 0 ? (n.map((c) => c / nl) as Vec3) : null,
          uv: v.uv
            ? [
                (v.uv[0] / UV_FULL[fmt.uvSize]!) * mesh.uvScale[0],
                (v.uv[1] / UV_FULL[fmt.uvSize]!) * mesh.uvScale[1],
              ]
            : [0, 0],
          weights: v.weights.map((w) => (fmt.weightSize === 1 ? w : Math.round(w / 0x100))),
          bones: v.weights.map((_, s) => slots[s] ?? -1),
        };
      });
      let frontFace = 0;
      let at = 0;
      for (const draw of group.list.draws) {
        if ("frontFace" in draw) {
          frontFace = draw.frontFace;
          continue;
        }
        const ids = group.list.indices.slice(at, at + draw.count);
        at += draw.count;
        // Triangle lists split into single triangles, so each lands in its own piece.
        const runs =
          draw.prim === 3
            ? Array.from({ length: Math.floor(ids.length / 3) }, (_, t) =>
                ids.slice(t * 3, t * 3 + 3),
              )
            : [ids];
        for (const run of runs) {
          const strip = run.map((i) => vertices[i]!);
          const bone = dominantBone(strip);
          strips.push({
            flags: mesh.flags,
            blend: mesh.blend,
            diffuse: material.diffuse,
            ambient: material.ambient,
            prim: draw.prim,
            frontFace,
            vertices: strip,
            root: rootOf[bone] ?? 0,
          });
        }
      }
    }
  }
  return strips;
}

function dominantBone(vertices: readonly PartVertex[]): number {
  const weight = new Map<number, number>();
  for (const v of vertices) {
    v.weights.forEach((w, s) => weight.set(v.bones[s]!, (weight.get(v.bones[s]!) ?? 0) + w));
  }
  let best = -1;
  for (const [bone, w] of weight) if (bone >= 0 && (best < 0 || w > weight.get(best)!)) best = bone;
  return best;
}

/** Strips joined into pieces wherever they share a vertex position. */
function pieces(strips: RawStrip[]): RawStrip[][] {
  const parent = strips.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const owner = new Map<string, number>();
  strips.forEach((strip, i) => {
    for (const v of strip.vertices) {
      const key = v.position.map((c) => c.toFixed(2)).join(",");
      const other = owner.get(key);
      if (other === undefined) owner.set(key, i);
      else parent[find(i)] = find(other);
    }
  });
  const groups = new Map<number, RawStrip[]>();
  strips.forEach((strip, i) => {
    const root = find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(strip);
  });
  return [...groups.values()];
}

function bounds(strips: readonly RawStrip[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of strips) {
    for (const v of s.vertices) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, v.position[k]!);
        max[k] = Math.max(max[k]!, v.position[k]!);
      }
    }
  }
  return { min, max };
}

const centroidZ = (strip: RawStrip) =>
  strip.vertices.reduce((sum, v) => sum + v.position[2], 0) / strip.vertices.length;

/** Builds a part from strips, sharing vertices within each material and blend. */
function makePart(slot: Slot, model: number, type: WeaponTypeName, strips: RawStrip[]): Part {
  const chunks = new Map<string, PartChunk & { index: Map<PartVertex, number> }>();
  let triangles = 0;
  for (const strip of strips) {
    const key = `${strip.flags}/${strip.blend}/${strip.diffuse}/${strip.ambient}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = {
        flags: strip.flags,
        blend: strip.blend,
        diffuse: strip.diffuse,
        ambient: strip.ambient,
        vertices: [],
        strips: [],
        index: new Map(),
      };
      chunks.set(key, chunk);
    }
    const indices = strip.vertices.map((v) => {
      let i = chunk!.index.get(v);
      if (i === undefined) {
        i = chunk!.vertices.length;
        chunk!.vertices.push(v);
        chunk!.index.set(v, i);
      }
      return i;
    });
    chunk.strips.push({ prim: strip.prim, frontFace: strip.frontFace, indices });
    triangles += stripTriangles(strip.prim, strip.vertices).length;
  }
  const { min, max } = bounds(strips);
  const uvs = strips.flatMap((s) => s.vertices.map((v) => v.uv));
  return {
    slot,
    model,
    type,
    chunks: [...chunks.values()].map(({ index: _, ...chunk }) => chunk),
    min,
    max,
    uvMin: [Math.min(...uvs.map((t) => t[0])), Math.min(...uvs.map((t) => t[1]))],
    uvMax: [Math.max(...uvs.map((t) => t[0])), Math.max(...uvs.map((t) => t[1]))],
    triangles,
    area: strips.reduce((sum, s) => sum + stripArea(s), 0),
  };
}

/** The width of the weapon (the wider of x and y) in 4-unit slices along z, from its triangles. */
export function widthProfile(strips: readonly RawStrip[]): Map<number, number> {
  const slices = new Map<number, [number, number, number, number]>();
  for (const strip of strips) {
    for (const tri of stripTriangles(strip.prim, strip.vertices)) {
      const zs = tri.map((v) => v.position[2]);
      const xs = tri.map((v) => v.position[0]);
      const ys = tri.map((v) => v.position[1]);
      for (let z = Math.floor(Math.min(...zs) / 4); z <= Math.floor(Math.max(...zs) / 4); z++) {
        const [x0, x1, y0, y1] = slices.get(z) ?? [Infinity, -Infinity, Infinity, -Infinity];
        slices.set(z, [
          Math.min(x0, ...xs),
          Math.max(x1, ...xs),
          Math.min(y0, ...ys),
          Math.max(y1, ...ys),
        ]);
      }
    }
  }
  return new Map([...slices].map(([z, [x0, x1, y0, y1]]) => [z, Math.max(x1 - x0, y1 - y0)]));
}

/**
 * Where the weapon widens out of the grip. The grip is the narrowest 4-unit
 * slice between 60 below the origin and 20 above it (not counting the
 * pommel's last two slices; some great swords' blades start below the
 * origin), and the cut is the first slice above it at least twice as wide
 * (and 8 units wider).
 */
function findCut(strips: readonly RawStrip[]): number {
  const profile = widthProfile(strips);
  const width = (z: number) => profile.get(z) ?? 0;
  const bottom = Math.min(...profile.keys());
  const top = Math.max(...profile.keys());
  let grip = 0;
  let gripWidth = Infinity;
  for (let z = Math.max(-15, bottom + 2); z <= Math.min(5, top); z++) {
    if (width(z) > 0 && width(z) < gripWidth) {
      grip = z;
      gripWidth = width(z);
    }
  }
  if (!Number.isFinite(gripWidth)) return 0;
  gripWidth = Math.max(gripWidth, 4);
  for (let z = grip; z <= top; z++) {
    if (width(z) >= Math.max(gripWidth * 2, gripWidth + 8)) return z * 4;
  }
  return 0;
}

/**
 * Whether a head (and guard) hangs on its handle's shaft: it first reaches
 * 40% of its widest 12 or more above where it starts (or the cut), and the
 * handle goes on up to there.
 */
function shafted(head: readonly RawStrip[], cut: number, handleTop: number): boolean {
  const profile = widthProfile(head);
  if (profile.size === 0) return false;
  const widest = Math.max(...profile.values());
  const bottom = Math.min(...profile.keys()) * 4;
  const bulk = Math.min(...[...profile].filter(([, w]) => w >= widest * 0.4).map(([z]) => z)) * 4;
  return bulk - Math.max(cut, bottom) >= 12 && handleTop >= bulk - 4;
}

/** A melee model's parts, or why it has none. */
export function cutWeapon(model: number, type: WeaponTypeName, pac: Buffer): WeaponParts | string {
  const entries = readPac(pac).map((e) => e.data);
  const [pmo, skeleton, texture] = entries;
  if (!pmo || !skeleton || !texture || !isPmo(pmo) || !isAhi(skeleton) || !isTmh(texture)) {
    return "not a PMO, skeleton and texture package";
  }
  const images = readTmh(texture);
  if (images.length !== 1) return `${images.length} textures`;
  const bones = readAhi(skeleton);
  const rootOf = bones.map((bone) => {
    let at = bone;
    while (at.parent >= 0) at = bones[at.parent]!;
    return at.id;
  });
  const strips = readStrips(pmo, rootOf);
  const main = strips.filter((s) => s.root === 0);
  const opaque = main.filter((s) => s.blend === 0);
  if (opaque.length === 0) return "no opaque main piece";
  const cut = findCut(opaque);

  const parts: Part[] = [];
  const add = (slot: Slot, group: RawStrip[]) => {
    if (group.length > 0) parts.push(makePart(slot, model, type, group));
  };
  add(
    "second",
    strips.filter((s) => s.root !== 0),
  );
  for (const piece of pieces(main.filter((s) => s.blend !== 0))) add("effect", piece);

  const above: RawStrip[][] = [];
  for (const piece of pieces(opaque)) {
    const { min, max } = bounds(piece);
    if (min[2] < cut - 8 && max[2] > cut + 8) {
      add(
        "handle",
        piece.filter((s) => centroidZ(s) < cut),
      );
      const rest = piece.filter((s) => centroidZ(s) >= cut);
      if (rest.length > 0) above.push(rest);
    } else if ((min[2] + max[2]) / 2 < cut) add("handle", piece);
    else above.push(piece);
  }
  if (above.length === 0) return "nothing above the grip";

  const headStrips: RawStrip[] = [];
  const areas = above.map((p) => p.reduce((sum, s) => sum + stripArea(s), 0));
  const core = Math.max(...areas);
  const coreBounds = bounds(above[areas.indexOf(core)]!);
  const coreLength = coreBounds.max[2] - coreBounds.min[2];
  const gripWidth = (() => {
    const handle = parts.filter((p) => p.slot === "handle");
    const w = handle
      .map((p) => Math.max(p.max[0] - p.min[0], p.max[1] - p.min[1]))
      .sort((a, b) => a - b);
    return w[w.length >> 1] ?? 8;
  })();
  above.forEach((piece, i) => {
    const { min, max } = bounds(piece);
    const short = max[2] - min[2] < Math.min(30, coreLength * 0.25);
    const wide = Math.max(max[0] - min[0], max[1] - min[1]) >= gripWidth * 1.5;
    if (areas[i] === core) add("head", piece);
    else if (GUARDED.has(type) && short && wide && min[2] < cut + 12) {
      add("guard", piece);
    } else if (areas[i]! >= core * 0.15) add("head", piece);
    else {
      add("extra", piece);
      return;
    }
    headStrips.push(...piece);
  });

  const boneOf = (slot: Slot) =>
    dominantBone(
      parts.filter((p) => p.slot === slot).flatMap((p) => p.chunks.flatMap((c) => c.vertices)),
    );
  return {
    model,
    type,
    parts,
    texture: images[0]!,
    cut,
    handleBone: boneOf("handle"),
    headBone: boneOf("head"),
    gripInHandle: (() => {
      const handle = parts.filter((p) => p.slot === "handle");
      return (
        handle.length > 0 &&
        Math.min(...handle.map((p) => p.min[2])) <= -4 &&
        Math.max(...handle.map((p) => p.max[2])) >= 0
      );
    })(),
    shafted: shafted(
      headStrips,
      cut,
      Math.max(...parts.filter((p) => p.slot === "handle").map((p) => p.max[2])),
    ),
    shape: bones.map((b) => b.parent).join(","),
    rootOf,
  };
}
