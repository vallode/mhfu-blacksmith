/**
 * The gunner forge: new bow and bowgun models put together from the parts
 * (`gunner-parts.ts`) of the game's own, as the melee forge
 * (`assemble.ts`) does for blades and hammers.
 *
 * - The frame is the model being replaced. It gives the file, skeleton,
 *   fold type (by model ID, so the game's poses are the frame's) and
 *   texture layout. Textures are packed island by island (`gunner-atlas.ts`).
 * - Heavy bowgun: a body (stock and receiver) and a barrel, each from a
 *   model of the class, the barrel one that leaves no gap along the body.
 *   The barrel follows the frame's barrel bone, so it folds away under the
 *   stock when sheathed whatever model it came from.
 * - Light bowgun: a body, a stock, a barrel and maybe crossbow limbs. The
 *   barrel slides along the bore to where the body's own barrel started;
 *   the limbs slide to the frame's limb bone.
 * - Bow: the bow from a model of the class and its quiver from another
 *   with the same skeleton (or the frame's).
 * - A material over everything, or over the barrel and limbs (a bow's
 *   quiver), as the melee forge's.
 *
 * Parts are placed as the drawn weapon shows them (`gunner-parts.ts`) and
 * folded back onto the frame's skeleton: each vertex keeps its bones
 * (mapped onto the frame's) and weights, and is moved by the inverse of
 * its blended drawn skin. So the drawn weapon looks as the parts did on
 * their own models, and sheathing folds it the frame's way.
 */
import {
  invertAffine,
  normalMatrix,
  transform,
  type Mat4,
} from "mhfu-extract/src/models/animation.js";
import { readPac, writePac } from "mhfu-extract/src/models/pac.js";
import {
  parsePmoFile,
  writePmo,
  type GeDraw,
  type GeVertex,
  type PmoMaterialRecord,
  type PmoMeshRecord,
  type PmoVertexGroup,
} from "mhfu-extract/src/models/pmo-file.js";
import type { WeaponTypeName } from "mhfu-extract/src/tables/weapons.js";
import type { Rng } from "../rng.js";
import { MATERIALS, writeAtlas } from "./atlas.js";
import { packIslands } from "./gunner-atlas.js";
import {
  HBG_BARREL,
  LBG_LIMBS,
  strongestBone,
  type GunnerPart,
  type GunnerParts,
  type GunnerSlot,
} from "./gunner-parts.js";
import type { PartVertex, Vec3 } from "./parts.js";

export interface GunnerLibrary {
  byType: Map<WeaponTypeName, GunnerParts[]>;
}

export function buildGunnerLibrary(weapons: GunnerParts[]): GunnerLibrary {
  const byType = new Map<WeaponTypeName, GunnerParts[]>();
  for (const w of weapons) (byType.get(w.type) ?? byType.set(w.type, []).get(w.type)!).push(w);
  return { byType };
}

/** What a forged gunner weapon is made of; null slots are left empty. */
export interface GunnerRecipe {
  frame: GunnerParts;
  body: GunnerParts;
  stock: GunnerParts | null;
  barrel: GunnerParts | null;
  limbs: GunnerParts | null;
  second: GunnerParts | null;
  /** A material over the barrel and limbs, and one over everything. */
  accentMaterial: string | null;
  material: string | null;
}

/** Parts whose UVs stay inside the texture (wrapping ones can't be cropped into the atlas). */
const fitsTexture = (part: GunnerPart) =>
  part.uvMin[0] >= -0.001 &&
  part.uvMin[1] >= -0.001 &&
  part.uvMax[0] <= 1.001 &&
  part.uvMax[1] <= 1.001;

export const gunnerSlot = (weapon: GunnerParts, slot: GunnerSlot) =>
  weapon.parts.filter((p) => p.slot === slot);

/** Whether `weapon` has parts in `slot`, all of them inside its texture. */
export function hasGunnerSlot(weapon: GunnerParts, slot: GunnerSlot): boolean {
  const parts = gunnerSlot(weapon, slot);
  return parts.length > 0 && parts.every(fitsTexture);
}

const MATERIAL_NAMES = Object.keys(MATERIALS);

/** The widest gap along the bore (drawn) a heavy bowgun body and barrel may leave between them. */
const MAX_GAP = 6;
/** How far from the bore (x = 0, y = the hinge's) a triangle may lie and still count. */
const BORE_X = 10;
const BORE_Y = 12;

const spanCache = new WeakMap<GunnerParts, Map<string, [number, number][]>>();

/** The z spans (drawn) of the triangles in `weapon`'s `slot` that cross the bore at height `boreY`. */
function boreSpans(weapon: GunnerParts, slot: GunnerSlot, boreY: number): [number, number][] {
  const cached = spanCache.get(weapon) ?? spanCache.set(weapon, new Map()).get(weapon)!;
  const key = `${slot}/${boreY}`;
  let spans = cached.get(key);
  if (spans) return spans;
  spans = [];
  for (const part of gunnerSlot(weapon, slot)) {
    for (const chunk of part.chunks) {
      for (const strip of chunk.strips) {
        const step = strip.prim === 3 ? 3 : 1;
        for (let i = 0; i + 2 < strip.indices.length; i += step) {
          const corners = strip.indices.slice(i, i + 3).map((k) => chunk.vertices[k]!.position);
          const [x, y, z] = [0, 1, 2].map((c) => corners.map((p) => p[c]!));
          if (Math.max(...x!) < -BORE_X || Math.min(...x!) > BORE_X) continue;
          if (Math.max(...y!) < boreY - BORE_Y || Math.min(...y!) > boreY + BORE_Y) continue;
          spans.push([Math.min(...z!), Math.max(...z!)]);
        }
      }
    }
  }
  cached.set(key, spans);
  return spans;
}

/**
 * The longest stretch of `body`'s bore (drawn) that neither its body nor
 * `barrel`'s barrel covers: where a barrel starts far ahead of a body's
 * end, the drawn weapon would have a hole in it.
 */
export function gapBetween(body: GunnerParts, barrel: GunnerParts): number {
  const boreY = body.bones[HBG_BARREL]?.translation[1] ?? 0;
  const spans = [...boreSpans(body, "body", boreY), ...boreSpans(barrel, "barrel", boreY)].sort(
    (a, b) => a[0] - b[0],
  );
  if (spans.length === 0) return Infinity;
  let end = spans[0]![1];
  let gap = 0;
  for (const [from, to] of spans) {
    gap = Math.max(gap, from - end);
    end = Math.max(end, to);
  }
  return gap;
}

/** Rolls a recipe for `frame` from its class's parts. */
export function rollGunnerRecipe(
  frame: GunnerParts,
  library: GunnerLibrary,
  rng: Rng,
): GunnerRecipe | null {
  const pick = <T>(items: T[]): T | undefined =>
    items.length > 0 ? items[rng.int(items.length)] : undefined;
  const same = library.byType.get(frame.type) ?? [];
  const having = (slot: GunnerSlot) => same.filter((w) => hasGunnerSlot(w, slot));
  const body = pick(having("body"));
  if (!body) return null;

  let stock: GunnerParts | null = null;
  let barrel: GunnerParts | null = null;
  let limbs: GunnerParts | null = null;
  let second: GunnerParts | null = null;
  if (frame.type === "heavy-bowgun") {
    // Another model's barrel that meets the body: some bodies end at the
    // hinge, others carry the receiver far ahead of it, where their own
    // barrel only starts. Unless no barrel meets it.
    const barrels = having("barrel");
    const meeting = barrels.filter((w) => w !== body && gapBetween(body, w) <= MAX_GAP);
    barrel = pick(meeting) ?? pick(barrels.filter((w) => w !== body)) ?? pick(barrels) ?? null;
    if (!barrel) return null;
  } else if (frame.type === "light-bowgun") {
    stock = pick(having("stock")) ?? null;
    barrel = pick(having("barrel").filter((w) => w !== body)) ?? pick(having("barrel")) ?? null;
    if (!barrel) return null;
    // Crossbow limbs half the time: the body's own if it had them, else another's.
    if (rng.float() < 0.5)
      limbs = hasGunnerSlot(body, "limbs") ? body : (pick(having("limbs")) ?? null);
  }
  if (gunnerSlot(frame, "second").length > 0) {
    const donors = having("second").filter((w) => w !== frame && w.shape === frame.shape);
    second = rng.float() < 0.5 ? (pick(donors) ?? frame) : frame;
    if (!hasGunnerSlot(second, "second")) second = pick(donors) ?? null;
  }

  const material = rng.float();
  return {
    frame,
    body,
    stock,
    barrel,
    limbs,
    second,
    accentMaterial: material >= 0.15 && material < 0.45 ? pick(MATERIAL_NAMES)! : null,
    material: material < 0.15 ? pick(MATERIAL_NAMES)! : null,
  };
}

/** A part as the forged weapon has it. */
interface Placement {
  part: GunnerPart;
  source: GunnerParts;
  /** Moved along z (drawn). */
  shift: number;
  material: string | null;
}

function placements(recipe: GunnerRecipe): Placement[] {
  const { frame, body } = recipe;
  const accent = recipe.accentMaterial ?? recipe.material;
  const out: Placement[] = [];
  const place = (
    source: GunnerParts | null,
    slot: GunnerSlot,
    rest: Omit<Placement, "part" | "source">,
  ) => {
    if (source) for (const part of gunnerSlot(source, slot)) out.push({ part, source, ...rest });
  };
  const plain = { shift: 0, material: recipe.material };
  place(body, "body", plain);
  if (frame.type === "light-bowgun") {
    place(recipe.stock, "stock", plain);
    place(recipe.barrel, "barrel", {
      ...plain,
      // Along the bore, onto where the body's own barrel started.
      shift: body.barrelStart - (recipe.barrel?.barrelStart ?? body.barrelStart),
      material: accent,
    });
    const limbZ = (w: GunnerParts) => w.bones[LBG_LIMBS]?.translation[2] ?? 0;
    if (recipe.limbs) {
      place(recipe.limbs, "limbs", {
        ...plain,
        shift: limbZ(frame) - limbZ(recipe.limbs),
        material: accent,
      });
    }
  } else if (frame.type === "heavy-bowgun") {
    // Every heavy bowgun's barrel is on bone 2 (and its children), so it
    // folds as the frame's would: the bone map keeps it there.
    place(recipe.barrel, "barrel", { ...plain, material: accent });
  }
  // A bow's accent is its quiver: it has no barrel or limbs of its own.
  place(recipe.second, "second", {
    ...plain,
    material: frame.type === "bow" ? accent : recipe.material,
  });
  return out;
}

/**
 * The frame bone a source bone maps to: the same bone where the frame has it
 * under the same parent, else (a bone the frame lacks or hangs elsewhere)
 * its parent's.
 */
function boneMap(source: GunnerParts, frame: GunnerParts): (bone: number) => number {
  return (bone) => {
    for (let at = bone; at >= 0; at = source.bones[at]?.parent ?? -1) {
      const mine = source.bones[at];
      const theirs = frame.bones[at];
      if (mine && theirs && mine.parent === theirs.parent) return at;
    }
    return 0;
  };
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const det3 = (m: Mat4) =>
  m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) -
  m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) +
  m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);

/** A forged vertex before quantizing: in the frame's bind pose, on frame bones. */
interface OutVertex {
  position: Vec3;
  normal: Vec3 | null;
  uv: [number, number];
  /** Frame bone -> weight (0x80 = 1). */
  weights: Map<number, number>;
}

/**
 * `v` (drawn, on `p.source`'s bones) as the frame's bind pose has it: the
 * inverse of the frame's drawn skin blended by the vertex's weights, or of
 * its strongest bone's when the blend can't be inverted (half on a bone
 * that turns half a turn).
 */
function unpose(
  p: Placement,
  v: PartVertex,
  frame: GunnerParts,
  map: (b: number) => number,
): OutVertex {
  const weights = new Map<number, number>();
  v.weights.forEach((w, s) => {
    if (w <= 0 || (v.bones[s] ?? -1) < 0) return;
    const b = map(v.bones[s]!);
    weights.set(b, (weights.get(b) ?? 0) + w);
  });
  if (weights.size === 0) weights.set(map(Math.max(0, strongestBone(v))), 0x80);
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  const blended = new Array<number>(16).fill(0);
  for (const [bone, w] of weights) {
    const skin = frame.drawn[bone] ?? IDENTITY;
    for (let k = 0; k < 16; k++) blended[k]! += (skin[k]! * w) / total;
  }
  let skin = blended;
  if (Math.abs(det3(skin)) < 0.05) {
    const strongest = [...weights].sort((a, b) => b[1] - a[1])[0]![0];
    skin = frame.drawn[strongest] ?? IDENTITY;
  }
  const inverse = invertAffine(skin);
  const at: Vec3 = [v.position[0], v.position[1], v.position[2] + p.shift];
  const n = v.normal && transform(normalMatrix(inverse), v.normal, 0);
  const nl = n && Math.hypot(...n);
  return {
    position: transform(inverse, at, 1),
    normal: n && nl ? (n.map((c) => c / nl) as Vec3) : null,
    uv: v.uv,
    weights,
  };
}

interface OutGroup {
  flags: number;
  blend: number;
  material: number;
  vertices: OutVertex[];
  strips: { prim: number; frontFace: number; indices: number[] }[];
}

/** GE vertex type parts: u16 UVs, s8 normals, s16 positions, u8 weights. */
const VT_UV16 = 2;
const VT_NORMAL8 = 1 << 5;
const VT_POSITION16 = 2 << 7;
const VT_WEIGHT8 = 1 << 9;
const MAX_BONES = 8;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** A group's vertices as a GE list, each vertex weighted to every bone it had. */
function quantize(group: OutGroup, scale: Vec3): PmoVertexGroup | string {
  const bones = [...new Set(group.vertices.flatMap((v) => [...v.weights.keys()]))].sort(
    (a, b) => a - b,
  );
  if (bones.length > MAX_BONES) return `a vertex group follows ${bones.length} bones`;
  if (group.vertices.length > 0x10000) return "a vertex group has too many vertices";
  const normals = group.vertices.every((v) => v.normal);
  const indexSize = group.vertices.length <= 0x100 ? 1 : 2;
  const vertexType =
    VT_UV16 |
    (normals ? VT_NORMAL8 : 0) |
    VT_POSITION16 |
    VT_WEIGHT8 |
    ((bones.length - 1) << 14) |
    (indexSize << 11);
  const vertices = group.vertices.map((v): GeVertex => ({
    weights: bones.map((b) => clamp(Math.round(v.weights.get(b) ?? 0), 0, 0xff)),
    uv: v.uv.map((c) => clamp(Math.round(c * 0x8000), 0, 0xffff)) as [number, number],
    color: null,
    normal: normals
      ? (v.normal!.map((c) => clamp(Math.round(c * 0x7f), -0x7f, 0x7f)) as Vec3)
      : null,
    position: v.position.map((c, k) =>
      clamp(Math.round((c / scale[k]!) * 0x7fff), -0x7fff, 0x7fff),
    ) as Vec3,
  }));
  const draws: GeDraw[] = [];
  const indices: number[] = [];
  let frontFace = -1;
  for (const strip of group.strips) {
    if (strip.frontFace !== frontFace) {
      frontFace = strip.frontFace;
      draws.push({ frontFace });
    }
    const last = draws[draws.length - 1]!;
    if ("prim" in last && last.prim === 3 && strip.prim === 3) last.count += strip.indices.length;
    else draws.push({ prim: strip.prim, count: strip.indices.length });
    indices.push(...strip.indices);
  }
  return {
    materialSlot: group.material,
    palette: bones.map((bone, slot): [number, number] => [slot, bone]),
    list: { vertexType, vertices, indices, draws },
  };
}

/** The frame's package with its model and texture replaced by the recipe's, or why it can't be made. */
export function forgeGunner(framePac: Buffer, recipe: GunnerRecipe): Buffer | string {
  const entries: Buffer[] = readPac(framePac).map((e) => Buffer.from(e.data));
  const [pmoBytes, , tmh] = entries;
  if (!pmoBytes || !tmh) return "not a weapon package";
  const framePmo = parsePmoFile(pmoBytes);
  const parts = placements(recipe);
  const { frame } = recipe;

  // Each part's texture islands, packed: parts from one model in one material share texels.
  const keyOf = (p: Placement) => `${p.source.model}/${p.material}`;
  const atlas = packIslands(
    parts.map((p) => ({
      key: keyOf(p),
      image: p.source.texture,
      material: p.material,
      chunks: p.part.chunks,
    })),
  );
  if (!atlas) return "the parts' textures don't fit";
  const texture = writeAtlas(tmh, { rgba: atlas.rgba, size: atlas.size, place: [] });
  if (!texture) return "the frame's texture isn't one 64x64 8-bit image";

  const materials: PmoMaterialRecord[] = [];
  const extra = framePmo.materials[0]?.extra ?? 0;
  const materialOf = (diffuse: number, ambient: number) => {
    let i = materials.findIndex((m) => m.diffuse === diffuse && m.ambient === ambient);
    if (i < 0) i = materials.push({ diffuse, ambient, textureIndex: 0, extra }) - 1;
    return i;
  };
  const maps = new Map<GunnerParts, (b: number) => number>();
  const groups = new Map<string, OutGroup & { index: Map<OutVertex, number> }>();
  parts.forEach((p) => {
    const key = keyOf(p);
    const place = (uv: [number, number]) => atlas.place(key, uv);
    const map = maps.get(p.source) ?? maps.set(p.source, boneMap(p.source, frame)).get(p.source)!;
    const placed = new Map<PartVertex, OutVertex>();
    const out = (v: PartVertex) => {
      let o = placed.get(v);
      if (!o) placed.set(v, (o = { ...unpose(p, v, frame, map), uv: place(v.uv) }));
      return o;
    };
    for (const chunk of p.part.chunks) {
      const material = materialOf(chunk.diffuse, chunk.ambient);
      for (const strip of chunk.strips) {
        const vertices = strip.indices.map((i) => out(chunk.vertices[i]!));
        // Strips on the same bones share a group, so a vertex carries only the weights it needs.
        const bones = [...new Set(vertices.flatMap((v) => [...v.weights.keys()]))].sort(
          (a, b) => a - b,
        );
        const key = `${chunk.blend}/${chunk.flags}/${material}/${bones.join(",")}`;
        let group = groups.get(key);
        if (!group) {
          group = {
            flags: chunk.flags,
            blend: chunk.blend,
            material,
            vertices: [],
            strips: [],
            index: new Map(),
          };
          groups.set(key, group);
        }
        const g = group;
        const indices = vertices.map(
          (v) => g.index.get(v) ?? (g.index.set(v, g.vertices.push(v) - 1), g.vertices.length - 1),
        );
        g.strips.push({ prim: strip.prim, frontFace: strip.frontFace, indices });
      }
    }
  });

  const all = [...groups.values()].flatMap((g) => g.vertices);
  const scale = [0, 1, 2].map((k) =>
    Math.max(1e-3, ...all.map((v) => Math.abs(v.position[k]!))),
  ) as Vec3;
  const radius = Math.max(...all.map((v) => Math.hypot(...v.position)));

  // One mesh per flags and blend, opaque first, as the game's models draw.
  const meshes = new Map<string, PmoMeshRecord>();
  const ordered = [...groups.values()].sort(
    (a, b) => Number(a.blend !== 0) - Number(b.blend !== 0),
  );
  for (const group of ordered) {
    const key = `${group.blend}/${group.flags}`;
    let mesh = meshes.get(key);
    if (!mesh) {
      mesh = {
        uvScale: [1, 1],
        flags: group.flags,
        blend: group.blend,
        materialSlots: [],
        groups: [],
      };
      meshes.set(key, mesh);
    }
    let slot = mesh.materialSlots.indexOf(group.material);
    if (slot < 0) slot = mesh.materialSlots.push(group.material) - 1;
    const out = quantize({ ...group, material: slot }, scale);
    if (typeof out === "string") return out;
    mesh.groups.push(out);
  }

  entries[0] = writePmo({ radius, scale, meshes: [...meshes.values()], materials });
  entries[2] = texture;
  return writePac(entries);
}
