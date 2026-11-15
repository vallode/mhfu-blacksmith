/**
 * Puts a weapon's procedural bones where the game has them while the weapon
 * is drawn, and while it's sheathed.
 *
 * No motion file animates a weapon's bones. The player's per-frame code sets
 * some of their bind matrices by weapon class instead, then skins the mesh
 * with them (chain x inverse of the AHI bind, so a bone left alone skins to
 * the identity). Each set bind keeps the bone's translation and replaces its
 * rotation and scale. The quest copy of that code is in `game_task.ovl` (EU
 * 0x9A932C0, a jump table by weapon class at 0x9A93DD4); the eboot's town
 * copy (EU 0x088D3F68, table at 0x088D4534) only has the sheathed pose.
 * Draw, sheathe and reload motions animate between the two poses (keyframe
 * tables in the eboot, e.g. 1 -> 3.15 -> 2.6 for a great sword's bone 3 x
 * while drawing), which isn't applied here.
 *
 * - Great sword and long sword (checked against a save state's RAM with the
 *   Ravager Blade drawn): drawn, bone 3 = diag(2.6, 1, 2.5); sheathed,
 *   bone 2 = diag(1, 1, 0.73). Pieces skinned to bone 3 are modelled folded
 *   into the blade, so the drawn scale is what puts the Ravager Blade's
 *   claws out of its spine.
 * - Heavy bowgun: drawn, bone 2 turned half a turn about x (and -40 degrees
 *   about z for fold type 1), which swings the barrel out in front of the
 *   stock; sheathed, bones 1 and 2 unturned, bone 3 = diag(-0.5, 1, 3). Most
 *   models are modelled folded (bone 2 unturned in the skeleton); a few are
 *   modelled drawn (bone 2 half a turn in the skeleton), and fold when
 *   sheathed.
 * - Light bowgun: drawn, bone 3 unscaled; sheathed, bone 1 unturned, bone 3
 *   = diag(1, 0.4, 2.2).
 * - Bow: drawn, bone 2 turned about x by its fold type's angle (155, 145,
 *   80, 0 or 155 degrees; table at EU 0x089AFC50), which opens the folded
 *   limbs; sheathed, bones 2 and 3 at identity. Bows are modelled folded.
 *
 * A model's fold type is byte 5 of its row in a table keyed by model ID (EU
 * 0x089B07B4, 0x14 bytes a row; models without a row are type 0).
 *
 * The export writes the drawn pose as the mesh and the sheathed one as a
 * morph target (`SHEATHED_TARGET`), so a viewer can show either. The other
 * classes' poses leave these bones at rest (lance, hammer when not charging)
 * or aren't read yet (gunlance, hunting horn).
 */
import type { Bone } from "./ahi.js";
import {
  composeMatrix,
  eulerToQuat,
  invertAffine,
  multiplyMatrices,
  type Mat4,
} from "./animation.js";
import type { Pmo } from "./pmo.js";
import type { WeaponTypeName } from "../tables/weapons.js";

type Vec3 = [number, number, number];

/**
 * A posed bone's bind: this rotation (Euler angles applied x, then y, then
 * z, like the skeleton's) and scale in place of the skeleton's, at the
 * bone's own translation. Either left out is the identity.
 */
export interface BonePose {
  rotation?: Vec3;
  scale?: Vec3;
}

/** Posed binds by bone index; bones not listed stay as the skeleton has them. */
export type BonePoses = ReadonlyMap<number, BonePose>;

/** A model's bone poses with the weapon drawn and sheathed. */
export interface WeaponPoses {
  drawn: BonePoses;
  sheathed: BonePoses;
}

/** The morph target that takes a posed weapon from drawn to sheathed. */
export const SHEATHED_TARGET = "sheathed";

const BLADE: WeaponPoses = {
  drawn: new Map([[3, { scale: [2.6, 1, 2.5] }]]),
  sheathed: new Map([[2, { scale: [1, 1, 0.73] }]]),
};

const LIGHT_BOWGUN: WeaponPoses = {
  drawn: new Map([[3, {}]]),
  sheathed: new Map([
    [1, {}],
    [3, { scale: [1, 0.4, 2.2] }],
  ]),
};

/** Heavy bowguns' drawn bone 2 rotation by fold type (EU 0x089AF9E0, 0x20 bytes a type). */
const HEAVY_BOWGUN_TURNS: Vec3[] = [
  [Math.PI, 0, 0],
  [Math.PI, 0, (-40 * Math.PI) / 180],
];

/** Bows' drawn bone 2 angle about x, in degrees, by fold type. */
const BOW_ANGLES = [155, 145, 80, 0, 155];

/** Fold types other than 0, by model ID (byte 5 of the EU 0x089B07B4 table's rows). */
const FOLD_TYPES: ReadonlyMap<number, number> = new Map([
  [442, 1],
  [443, 4],
  [457, 3],
  [464, 1],
  [465, 2],
  [533, 1],
]);

/** The bone poses for a model of `type`, or undefined for a class whose bones stay at rest. */
export function weaponPoses(type: WeaponTypeName, modelId: number): WeaponPoses | undefined {
  const fold = FOLD_TYPES.get(modelId) ?? 0;
  switch (type) {
    case "great-sword":
    case "long-sword":
      return BLADE;
    case "light-bowgun":
      return LIGHT_BOWGUN;
    case "heavy-bowgun":
      return {
        drawn: new Map([
          [2, { rotation: HEAVY_BOWGUN_TURNS[fold] ?? HEAVY_BOWGUN_TURNS[0] }],
          [3, {}],
        ]),
        sheathed: new Map([
          [1, {}],
          [2, {}],
          [3, { scale: [-0.5, 1, 3] }],
        ]),
      };
    case "bow":
      return {
        drawn: new Map([
          [2, { rotation: [((BOW_ANGLES[fold] ?? 0) * Math.PI) / 180, 0, 0] }],
          [3, {}],
        ]),
        sheathed: new Map([
          [2, {}],
          [3, {}],
        ]),
      };
    default:
      return undefined;
  }
}

/**
 * Each bone's change from the skeleton's bind to `poses`, in model space
 * (posed chain x inverse of the bind chain). A bone under a posed one moves
 * with it. Undefined for a bone that doesn't move.
 */
function skinMatrices(bones: readonly Bone[], poses: BonePoses): (Mat4 | undefined)[] {
  const bind: Mat4[] = [];
  const posed: Mat4[] = [];
  const moved: boolean[] = [];
  const resolve = (id: number): void => {
    if (bind[id]) return;
    const bone = bones[id]!;
    const pose = poses.get(id);
    const local = composeMatrix(bone.translation, eulerToQuat(bone.rotation), bone.scale);
    const own = pose
      ? composeMatrix(
          bone.translation,
          eulerToQuat(pose.rotation ?? [0, 0, 0]),
          pose.scale ?? [1, 1, 1],
        )
      : local;
    if (bone.parent >= 0 && bones[bone.parent]) {
      resolve(bone.parent);
      bind[id] = multiplyMatrices(bind[bone.parent]!, local);
      posed[id] = multiplyMatrices(posed[bone.parent]!, own);
      moved[id] = moved[bone.parent]! || pose !== undefined;
    } else {
      bind[id] = local;
      posed[id] = own;
      moved[id] = pose !== undefined;
    }
  };
  return bones.map((bone) => {
    resolve(bone.id);
    // A bind flattened by a zero scale (we423's bone 2 has y 0) has no inverse: leave it.
    if (!moved[bone.id] || Math.abs(determinant(bind[bone.id]!)) < 1e-6) return undefined;
    const skin = multiplyMatrices(posed[bone.id]!, invertAffine(bind[bone.id]!));
    const identity = skin.every((c, k) => Math.abs(c - (k % 5 === 0 ? 1 : 0)) < 1e-6);
    return identity ? undefined : skin;
  });
}

const determinant = (m: Mat4): number =>
  m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) -
  m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) +
  m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);

const transform = (m: Mat4, [x, y, z]: Vec3, w: number): Vec3 => [
  m[0]! * x + m[4]! * y + m[8]! * z + m[12]! * w,
  m[1]! * x + m[5]! * y + m[9]! * z + m[13]! * w,
  m[2]! * x + m[6]! * y + m[10]! * z + m[14]! * w,
];

/** The matrix normals take: the inverse transpose of `m`'s linear part. */
function normalMatrix(m: Mat4): Mat4 {
  const inverse = invertAffine(m);
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 3; col++)
    for (let row = 0; row < 3; row++) out[col * 4 + row] = inverse[row * 4 + col]!;
  return out;
}

interface Posed {
  /** Per mesh, primitive and vertex: position and normal in model units. */
  vertices: { position: Vec3; normal?: Vec3 }[][][];
  /** Whether any vertex moved. */
  moved: boolean;
}

/**
 * Every vertex skinned to `poses`, as the game blends them: each weight
 * moves its share of the vertex by its bone's change.
 */
function poseVertices(pmo: Pmo, bones: readonly Bone[], poses: BonePoses): Posed {
  const skins = skinMatrices(bones, poses);
  const normals = skins.map((skin) => skin && normalMatrix(skin));
  let moved = false;
  const vertices = pmo.meshes.map((mesh) =>
    mesh.primitives.map((primitive) =>
      primitive.geometry.vertices.map((v) => {
        const p = v.position.map((c, k) => c * pmo.scale[k]!) as Vec3;
        const n = v.normal?.map((c, k) => c * pmo.scale[k]!) as Vec3 | undefined;
        const position = [...p] as Vec3;
        const normal = n && ([...n] as Vec3);
        v.weights?.forEach((weight, slot) => {
          const bone = primitive.bones[slot] ?? -1;
          const skin = skins[bone];
          if (!skin || weight === 0) return;
          moved = true;
          const to = transform(skin, p, 1);
          for (let k = 0; k < 3; k++) position[k] = position[k]! + weight * (to[k]! - p[k]!);
          if (normal && n) {
            const turned = transform(normals[bone]!, n, 0);
            for (let k = 0; k < 3; k++) normal[k] = normal[k]! + weight * (turned[k]! - n[k]!);
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
 * The PMO in the drawn pose of `poses` (`weaponPoses`), and `sheathed`, the
 * same mesh in the sheathed pose: vertex for vertex and at the same position
 * scale, which grows to fit both. A model with nothing weighted to a moved
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
