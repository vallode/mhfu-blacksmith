/**
 * Gunner parts: a bow or bowgun model cut into the slots the gunner forge
 * (`gunner-assemble.ts`) builds new ones from. The melee cut (`parts.ts`)
 * doesn't fit them: a gunner model is folded on its bones, and its pieces
 * are told apart by bone and by place along the gun, not by a grip.
 *
 * Every gunner model lies along +z with the fist at the origin, the muzzle
 * (or a bow's upper tip) toward +z, and the hunter's poses (`mhfu-extract`
 * `weapon-pose.ts`) unfold it when drawn. Parts are kept as the drawn
 * weapon has them, so a part of one model sits where the drawn weapon shows
 * it whatever its skeleton or fold type, and the forge folds it back onto
 * the frame's skeleton.
 *
 * - Heavy bowgun: bone 1 holds the stock and receiver, bone 2 the barrel
 *   (folded back under the stock in most models, swung half a turn about x
 *   at (0, -31, 11) to fire; a few are modelled unfolded). So the barrel
 *   slot is bone 2 and its children, and the body the rest.
 * - Light bowgun: one bone holds nearly everything, along a bore at
 *   x = -4, y = -27 (bone 2's place). Bone 3, at z 57-65 on the bore,
 *   carries the crossbow limbs and string of the models that have them
 *   (squashed in y when sheathed). The barrel is what lies ahead of z 48,
 *   the stock what lies behind z -20, the limbs the pieces weighted to bone
 *   3, and the body the rest (receiver, grip, sights).
 * - Bow: bone 1 is the riser and upper limb, bone 2 the lower limb (folded
 *   up along the riser, opened by its fold type's angle when drawn), bone 3
 *   the upper tip the string hangs from; the quiver is the second root
 *   (bones 4 and 5). Riser and limbs are often one piece, so the bow itself
 *   is one part (body), and the quiver the second.
 *
 * Every texture is one 64x64 8-bit image, with a 16-bit (5551) or 32-bit
 * palette, as the melee models'.
 */
import { readAhi, isAhi, type Bone } from "mhfu-extract/src/models/ahi.js";
import { normalMatrix, transform, type Mat4 } from "mhfu-extract/src/models/animation.js";
import { readPac } from "mhfu-extract/src/models/pac.js";
import { isPmo } from "mhfu-extract/src/models/pmo.js";
import { isTmh, readTmh, type TmhImage } from "mhfu-extract/src/models/tmh.js";
import { skinMatrices, weaponPoses } from "mhfu-extract/src/models/weapon-pose.js";
import type { WeaponTypeName } from "mhfu-extract/src/tables/weapons.js";
import { readStrips, stripTriangles, type PartChunk, type PartVertex, type Vec3 } from "./parts.js";

export const GUNNER_TYPES: readonly WeaponTypeName[] = ["light-bowgun", "heavy-bowgun", "bow"];

export type GunnerSlot = "body" | "stock" | "barrel" | "limbs" | "second";

export interface GunnerPart {
  slot: GunnerSlot;
  model: number;
  type: WeaponTypeName;
  /** In the drawn pose, model units; vertices keep their bones and weights. */
  chunks: PartChunk[];
  min: Vec3;
  max: Vec3;
  uvMin: [number, number];
  uvMax: [number, number];
  triangles: number;
}

export interface GunnerParts {
  model: number;
  type: WeaponTypeName;
  parts: GunnerPart[];
  texture: TmhImage;
  bones: Bone[];
  /** Each bone's change from bind to drawn, or undefined where it doesn't move. */
  drawn: (Mat4 | undefined)[];
  /** The skeleton's parents, joined: models with the same shape share bones. */
  shape: string;
  /** Light bowguns: where the barrel starts along z (the barrel's socket). */
  barrelStart: number;
}

/** Light bowguns: the barrel lies ahead of this (drawn), the stock behind `LBG_STOCK`. */
export const LBG_BARREL = 48;
export const LBG_STOCK = -20;
/** The light bowgun's limb bone and the heavy bowgun's barrel bone. */
export const LBG_LIMBS = 3;
export const HBG_BARREL = 2;
/** A heavy bowgun barrel reaches at least this far ahead of the hinge. */
const HBG_MIN_BARREL = 40;

interface Strip {
  flags: number;
  blend: number;
  diffuse: number;
  ambient: number;
  prim: number;
  frontFace: number;
  vertices: PartVertex[];
  root: number;
}

/** `vertex` moved by its bones' skins, blended by weight as the game skins it. */
export function poseVertex(vertex: PartVertex, skins: (Mat4 | undefined)[]): PartVertex {
  const p = vertex.position;
  const position = [...p] as Vec3;
  const normal = vertex.normal && ([...vertex.normal] as Vec3);
  vertex.weights.forEach((w, s) => {
    const skin = skins[vertex.bones[s]!];
    if (!skin || w === 0) return;
    const share = w / 0x80;
    const to = transform(skin, p, 1);
    for (let k = 0; k < 3; k++) position[k] = position[k]! + share * (to[k]! - p[k]!);
    if (normal && vertex.normal) {
      const turned = transform(normalMatrix(skin), vertex.normal, 0);
      for (let k = 0; k < 3; k++) normal[k] = normal[k]! + share * (turned[k]! - vertex.normal[k]!);
    }
  });
  const nl = normal && Math.hypot(...normal);
  return {
    ...vertex,
    position,
    normal: normal && nl ? (normal.map((c) => c / nl) as Vec3) : vertex.normal,
  };
}

/** The bone a vertex follows most. */
export const strongestBone = (v: PartVertex): number => {
  let best = 0;
  v.weights.forEach((w, s) => {
    if (w > (v.weights[best] ?? 0)) best = s;
  });
  return v.bones[best] ?? -1;
};

/** Strips joined into pieces wherever they share a vertex position. */
function pieces(strips: Strip[]): Strip[][] {
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
  const groups = new Map<number, Strip[]>();
  strips.forEach((strip, i) => {
    const root = find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(strip);
  });
  return [...groups.values()];
}

const centroidZ = (strips: readonly Strip[]) => {
  const vs = strips.flatMap((s) => s.vertices);
  return vs.reduce((sum, v) => sum + v.position[2], 0) / vs.length;
};

function makePart(slot: GunnerSlot, model: number, type: WeaponTypeName, strips: Strip[]) {
  const chunks = new Map<string, PartChunk & { index: Map<PartVertex, number> }>();
  let triangles = 0;
  for (const strip of strips) {
    const key = `${strip.flags}/${strip.blend}/${strip.diffuse}/${strip.ambient}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = { ...strip, vertices: [], strips: [], index: new Map() };
      chunks.set(key, chunk);
    }
    const indices = strip.vertices.map((v) => {
      let i = chunk!.index.get(v);
      if (i === undefined) {
        i = chunk!.vertices.push(v) - 1;
        chunk!.index.set(v, i);
      }
      return i;
    });
    chunk.strips.push({ prim: strip.prim, frontFace: strip.frontFace, indices });
    triangles += stripTriangles(strip.prim, strip.vertices).length;
  }
  const vs = strips.flatMap((s) => s.vertices);
  const axis = (k: number, f: (...xs: number[]) => number) => f(...vs.map((v) => v.position[k]!));
  const uv = (k: number, f: (...xs: number[]) => number) => f(...vs.map((v) => v.uv[k]!));
  return {
    slot,
    model,
    type,
    chunks: [...chunks.values()].map(
      ({ flags, blend, diffuse, ambient, vertices, strips: s }): PartChunk => ({
        flags,
        blend,
        diffuse,
        ambient,
        vertices,
        strips: s,
      }),
    ),
    min: [0, 1, 2].map((k) => axis(k, Math.min)) as Vec3,
    max: [0, 1, 2].map((k) => axis(k, Math.max)) as Vec3,
    uvMin: [uv(0, Math.min), uv(1, Math.min)] as [number, number],
    uvMax: [uv(0, Math.max), uv(1, Math.max)] as [number, number],
    triangles,
  } satisfies GunnerPart;
}

/** Whether `bone` is `ancestor` or under it. */
export function under(bones: readonly Bone[], bone: number, ancestor: number): boolean {
  for (let at = bone; at >= 0; at = bones[at]?.parent ?? -1) if (at === ancestor) return true;
  return false;
}

/** A gunner model's parts, or why it has none. */
export function cutGunner(model: number, type: WeaponTypeName, pac: Buffer): GunnerParts | string {
  const [pmo, skeleton, texture] = readPac(pac).map((e) => e.data);
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
  const poses = weaponPoses(type, model);
  if (!poses) return "no poses for its class";
  const drawn = skinMatrices(bones, poses.drawn);
  // Posed once per source vertex, so strips that shared a vertex still do.
  const posed = new Map<PartVertex, PartVertex>();
  const pose = (v: PartVertex) => posed.get(v) ?? posed.set(v, poseVertex(v, drawn)).get(v)!;
  const strips: Strip[] = readStrips(pmo, rootOf).map((s) => ({
    ...s,
    vertices: s.vertices.map(pose),
  }));
  const main = strips.filter((s) => s.root === 0);
  if (main.length === 0) return "no main piece";

  const parts: GunnerPart[] = [];
  const add = (slot: GunnerSlot, group: Strip[]) => {
    if (group.length > 0) parts.push(makePart(slot, model, type, group));
  };
  add(
    "second",
    strips.filter((s) => s.root !== 0),
  );
  let barrelStart = LBG_BARREL;
  if (type === "heavy-bowgun") {
    const onBarrel = (s: Strip) =>
      s.vertices.some((v) => under(bones, strongestBone(v), HBG_BARREL));
    // Many models hang part of the receiver on the folding bone too: only
    // the pieces lying ahead of the hinge are barrel. The rest stays on its
    // bones, so it still folds when sheathed. Pieces aren't split: a cannon's
    // tube runs through the hinge, and half a carriage wheel looked broken.
    const hinge = bones[HBG_BARREL]?.translation[2] ?? 0;
    const zones = { body: [] as Strip[], barrel: [] as Strip[] };
    for (const piece of pieces(main)) {
      zones[piece.some(onBarrel) && centroidZ(piece) > hinge ? "barrel" : "body"].push(...piece);
    }
    add("body", zones.body);
    add("barrel", zones.barrel);
    const barrel = parts.find((p) => p.slot === "barrel");
    if (!barrel || barrel.max[2] - hinge < HBG_MIN_BARREL) return "no barrel";
  } else if (type === "light-bowgun") {
    // Limbs and string carry a good share of bone 3's weight (their tips);
    // some models give whole welded guns a speck of it.
    const limbs = (piece: Strip[]) => {
      let on = 0;
      let all = 0;
      for (const v of piece.flatMap((s) => s.vertices)) {
        v.weights.forEach((w, i) => {
          all += w;
          if (v.bones[i] === LBG_LIMBS) on += w;
        });
      }
      return on >= all * 0.1;
    };
    const zone = (strips: readonly Strip[]) => {
      const z = centroidZ(strips);
      return z >= LBG_BARREL ? "barrel" : z < LBG_STOCK ? "stock" : "body";
    };
    const zones = { stock: [] as Strip[], body: [] as Strip[], barrel: [] as Strip[] };
    for (const piece of pieces(main)) {
      if (limbs(piece)) {
        add("limbs", piece);
        continue;
      }
      const zs = piece.flatMap((s) => s.vertices.map((v) => v.position[2]));
      const [lo, hi] = [Math.min(...zs), Math.max(...zs)];
      const crosses = [LBG_STOCK, LBG_BARREL].some((cut) => lo < cut - 8 && hi > cut + 8);
      // A piece running across a cut (the stock and receiver are often one) splits there by strip.
      if (crosses) for (const s of piece) zones[zone([s])].push(s);
      else zones[zone(piece)].push(...piece);
    }
    for (const slot of ["stock", "body", "barrel"] as const) add(slot, zones[slot]);
    const barrel = parts.filter((p) => p.slot === "barrel");
    if (barrel.length === 0) return "no barrel";
    barrelStart = Math.min(...barrel.map((p) => p.min[2]));
  } else add("body", main);
  if (!parts.some((p) => p.slot === "body")) return "no body";

  return {
    model,
    type,
    parts,
    texture: images[0]!,
    bones,
    drawn,
    shape: bones.map((b) => b.parent).join(","),
    barrelStart,
  };
}
