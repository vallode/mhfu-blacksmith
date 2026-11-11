/**
 * Puts a weapon's procedural bones where the game has them while the weapon
 * is drawn, and while it's sheathed.
 *
 * No motion file animates a weapon's bones. The player's per-frame code sets
 * some of their bind matrices by weapon class instead, then skins the mesh
 * with them (chain x inverse of the AHI bind, so a bone left alone skins to
 * the identity). The quest copy of that code is in `game_task.ovl` (EU
 * 0x9A932C0, the great sword and long sword case at 0x9A93F0C); the eboot's
 * town copy (EU 0x088D3F68) only has the sheathed pose. For great swords and
 * long swords, read there and checked against a save state's RAM with the
 * Ravager Blade drawn:
 *
 * - drawn: bone 3 = diag(2.6, 1, 2.5) at its own translation, bone 2 at rest;
 * - sheathed: bone 3 at rest, bone 2 = diag(1, 1, 0.73) at its translation.
 *
 * Draw and sheathe motions animate between the two (keyframe tracks in the
 * eboot's data, e.g. 1 -> 3.15 -> 2.6 for bone 3's x while drawing).
 *
 * A model's pieces skinned to bone 3 are modelled folded into the blade, so
 * the drawn scale is what puts the Ravager Blade's claws out of its spine.
 * The export writes the drawn pose as the mesh and the sheathed one as a
 * morph target (`SHEATHED_TARGET`), so a viewer can show either. The other
 * classes' drawn poses leave these bones at rest (lance, hammer when not
 * charging) or turn them (gunlance, bow, bowguns), which isn't applied here.
 */
import type { Bone } from "./ahi.js";
import { isUnrotatedBone } from "./attach.js";
import type { Pmo } from "./pmo.js";
import type { WeaponTypeName } from "../tables/weapons.js";

type Vec3 = [number, number, number];

/** Bind scales by bone index; bones not listed stay at rest. */
export type BoneScales = ReadonlyMap<number, Vec3>;

/** A class's bind scales with the weapon drawn and sheathed. */
export interface WeaponPoses {
  drawn: BoneScales;
  sheathed: BoneScales;
}

/** The morph target that takes a posed weapon from drawn to sheathed. */
export const SHEATHED_TARGET = "sheathed";

const BLADE: WeaponPoses = {
  drawn: new Map([[3, [2.6, 1, 2.5]]]),
  sheathed: new Map([[2, [1, 1, 0.73]]]),
};

/** Each posed class's bind scales. */
export const WEAPON_POSES: Partial<Record<WeaponTypeName, WeaponPoses>> = {
  "great-sword": BLADE,
  "long-sword": BLADE,
};

/**
 * The game's change to each posed bone, as a scale about the bone's world
 * position (model units). The game replaces the bone's bind with the posed
 * scale and keeps its translation, so a bone (or an ancestor) that the AHI
 * turns is left alone: the change wouldn't be a scale about a point.
 */
function boneScales(bones: Bone[], scales: BoneScales) {
  const out = new Map<number, { pivot: Vec3; scale: Vec3 }>();
  for (const [id, posed] of scales) {
    const pivot: Vec3 = [0, 0, 0];
    let ok = bones[id] !== undefined;
    for (let b = bones[id]; b; b = b.parent >= 0 ? bones[b.parent] : undefined) {
      if (!isUnrotatedBone(b) || (b.id !== id && b.scale.some((c) => Math.abs(c - 1) > 1e-3)))
        ok = false;
      b.translation.forEach((c, k) => (pivot[k] = pivot[k]! + c));
    }
    if (!ok) continue;
    const scale = posed.map((c, k) => c / bones[id]!.scale[k]!) as Vec3;
    out.set(id, { pivot, scale });
  }
  return out;
}

interface Posed {
  /** Per mesh, primitive and vertex: position and normal in model units. */
  vertices: { position: Vec3; normal?: Vec3 }[][][];
  /** Whether any vertex moved. */
  moved: boolean;
}

/**
 * Every vertex skinned to the pose of `scales`, as the game blends them: each
 * weight moves its share of the vertex by its bone's change.
 */
function poseVertices(pmo: Pmo, bones: Bone[], scales: BoneScales): Posed {
  const posed = boneScales(bones, scales);
  let moved = false;
  const vertices = pmo.meshes.map((mesh) =>
    mesh.primitives.map((primitive) =>
      primitive.geometry.vertices.map((v) => {
        const p = v.position.map((c, k) => c * pmo.scale[k]!) as Vec3;
        const n = v.normal?.map((c, k) => c * pmo.scale[k]!) as Vec3 | undefined;
        const position = [...p] as Vec3;
        const normal = n && ([...n] as Vec3);
        v.weights?.forEach((weight, slot) => {
          const bone = posed.get(primitive.bones[slot] ?? -1);
          if (!bone || weight === 0) return;
          moved = true;
          for (let k = 0; k < 3; k++) {
            const offset = (p[k]! - bone.pivot[k]!) * (bone.scale[k]! - 1);
            position[k] = position[k]! + weight * offset;
            // Normals take the inverse scale (the inverse-transpose of a diagonal).
            if (normal && n) normal[k] = normal[k]! + weight * n[k]! * (1 / bone.scale[k]! - 1);
          }
        });
        return { position, normal };
      }),
    ),
  );
  return { vertices, moved };
}

/** `pmo` with its vertices replaced by `posed`'s, stored at `scale`. */
function withVertices(pmo: Pmo, posed: Posed, scale: Vec3): Pmo {
  return {
    ...pmo,
    scale,
    meshes: pmo.meshes.map((mesh, m) => ({
      ...mesh,
      primitives: mesh.primitives.map((primitive, i) => ({
        ...primitive,
        geometry: {
          ...primitive.geometry,
          vertices: primitive.geometry.vertices.map((v, j) => {
            const { position, normal } = posed.vertices[m]![i]![j]!;
            return {
              ...v,
              position: position.map((c, k) => c / scale[k]!) as Vec3,
              // Stored in scaled model space, like the source (gltf.ts multiplies by the scale).
              normal: normal?.map((c, k) => c / scale[k]!) as Vec3 | undefined,
            };
          }),
        },
      })),
    })),
  };
}

/**
 * The PMO in the drawn pose of `poses` (WEAPON_POSES), and `sheathed`, the
 * same mesh in the sheathed pose: vertex for vertex and at the same position
 * scale, which grows to fit both. A model with nothing weighted to a posed
 * bone comes back unchanged, without a sheathed copy.
 */
export function poseWeapon(
  pmo: Pmo,
  bones: Bone[],
  poses: WeaponPoses,
): { pmo: Pmo; sheathed?: Pmo } {
  const drawn = poseVertices(pmo, bones, poses.drawn);
  const sheathed = poseVertices(pmo, bones, poses.sheathed);
  if (!drawn.moved && !sheathed.moved) return { pmo };
  const extent = [drawn, sheathed].flatMap((posed) => posed.vertices.flat(2));
  const scale = pmo.scale.map((s, k) =>
    Math.max(s, ...extent.map((v) => Math.abs(v.position[k]!))),
  ) as Vec3;
  return { pmo: withVertices(pmo, drawn, scale), sheathed: withVertices(pmo, sheathed, scale) };
}
