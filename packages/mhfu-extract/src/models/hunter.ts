/**
 * The player's skeleton and an armor set put together as one skinned model.
 *
 * The player has one 21-bone skeleton (the `.ahi` in `player/<m|f>/reg/`
 * packages and `edit/editpl_*.pac`), in a T-pose with the origin at the hips:
 *   0 root, 1 base, 2 hips, 3-5 left leg, 6-8 right leg, 9 waist, 10 chest,
 *   11-14 left shoulder to hand, 15-18 right shoulder to hand, 19 neck, 20 head.
 * Left is +X, facing +Z. Bones 0-8 are part 0 and 9-20 part 1 (ahi.ts), which
 * is how the player's motions split them (animation.ts, `buildPlayerClips`).
 *
 * Armor pieces are separate packages, each with a partial skeleton of its
 * own, and their meshes sit in that skeleton's bind pose: a gauntlet's
 * shoulder is at the chest-relative (4, 19.6, -2), not the player's
 * (4, 34, -2). The game runs each piece's bones from the player's joints
 * through `MODEL_JOINT_MAP` (tclamb/mhp2g-decomp,
 * `player_manager.joint_map.cpp`), copied here. To make one model of them,
 * each vertex moves by the difference between its bones' place in the player
 * skeleton and in the piece's, and the mesh is skinned to the player's joints.
 */
import type { Bone } from "./ahi.js";
import { isAhi, readAhi } from "./ahi.js";
import { bindMatrices } from "./animation.js";
import type { PacEntry } from "./pac.js";
import { isPmo, readPmo, type Pmo } from "./pmo.js";
import { withSkin } from "./skin.js";
import { isTmh, readTmh, type TmhImage } from "./tmh.js";

type Vec3 = [number, number, number];

/** Player joints (PlJointId in the decomp). */
export const JOINT = {
  ROOT: 0,
  BASE: 1,
  HIPS: 2,
  LEFT_THIGH: 3,
  LEFT_LEG: 4,
  LEFT_FOOT: 5,
  RIGHT_THIGH: 6,
  RIGHT_LEG: 7,
  RIGHT_FOOT: 8,
  WAIST: 9,
  CHEST: 10,
  LEFT_SHOULDER: 11,
  LEFT_ARM: 12,
  LEFT_FOREARM: 13,
  LEFT_HAND: 14,
  RIGHT_SHOULDER: 15,
  RIGHT_ARM: 16,
  RIGHT_FOREARM: 17,
  RIGHT_HAND: 18,
  NECK: 19,
  HEAD: 20,
} as const;

/** Bones the player skeleton has. */
export const PLAYER_BONE_COUNT = 21;

const { HIPS, WAIST, CHEST, NECK, HEAD } = JOINT;

/**
 * A piece's bones (by index) to player joints, -1 for none, per armor slot.
 * The decomp's entries can also carry a 0x40 flag on bones past the ones
 * here (rigid attachments some pieces add); the default set doesn't use them,
 * and `composeHunter` rejects a bone that has no entry.
 */
export const ARMOR_JOINT_MAPS = {
  helmet: [-1, CHEST, NECK, HEAD],
  plate: [
    -1,
    HIPS,
    WAIST,
    CHEST,
    JOINT.LEFT_SHOULDER,
    JOINT.LEFT_ARM,
    JOINT.RIGHT_SHOULDER,
    JOINT.RIGHT_ARM,
    NECK,
    HEAD,
  ],
  gauntlets: [
    -1,
    CHEST,
    JOINT.LEFT_SHOULDER,
    JOINT.LEFT_ARM,
    JOINT.LEFT_FOREARM,
    JOINT.LEFT_HAND,
    JOINT.RIGHT_SHOULDER,
    JOINT.RIGHT_ARM,
    JOINT.RIGHT_FOREARM,
    JOINT.RIGHT_HAND,
  ],
  waist: [-1, HIPS, WAIST, JOINT.LEFT_THIGH, JOINT.LEFT_LEG, JOINT.RIGHT_THIGH, JOINT.RIGHT_LEG],
  // Leggings use the player's whole skeleton.
  leggings: Array.from({ length: PLAYER_BONE_COUNT }, (_, bone) => bone),
} as const satisfies Record<string, readonly number[]>;

export type HunterSlot = keyof typeof ARMOR_JOINT_MAPS;

/**
 * The armor the site's hunters wear (`export-site`): each sex's model of
 * each slot's piece of this name, by data name. `composeHunter` puts the
 * pieces together in this order. In `hunter.glb` and `hunter-female.glb`
 * each primitive names its slot by index in this order (`extras.part`): the
 * site swaps a slot's piece for another by it (blacksmith's
 * `src/lib/hunter-armor.ts`). A piece with several textures has a primitive
 * for each.
 */
export const HUNTER_ARMOR: Record<HunterSlot, string> = {
  helmet: "Battle Helm",
  plate: "Battle Mail",
  gauntlets: "Battle Vambraces",
  waist: "Battle Tasset",
  leggings: "Battle Greaves",
};

/** One armor piece's mesh, skeleton and textures. */
export interface HunterPiece {
  slot: HunterSlot;
  pmo: Pmo;
  bones: Bone[];
  textures: TmhImage[];
}

export interface HunterModel {
  pmo: Pmo;
  /** The slot of each of `pmo`'s meshes. */
  meshSlots: HunterSlot[];
  textures: TmhImage[];
  /** The player's skeleton (the leggings'). */
  bones: Bone[];
}

/**
 * Texture indices from here on have no image: a piece's material that
 * indexes past its own textures (and the skin's) keeps its index above this.
 */
const MISSING_TEXTURE = 0x10000;

/** The world position of each bone in the bind pose. */
function bindPositions(bones: readonly Bone[]): Vec3[] {
  return bindMatrices(bones).map((m) => [m[12]!, m[13]!, m[14]!]);
}

/**
 * The armor piece of `slot` in a package's entries. `skin` is the skin
 * tone's textures, which the piece's materials index after its own
 * (skin.ts).
 */
export function readHunterPiece(
  slot: HunterSlot,
  entries: PacEntry[],
  skin: readonly TmhImage[] = [],
): HunterPiece {
  const pmoEntry = entries.find((entry) => isPmo(entry.data));
  const ahi = entries.find((entry) => isAhi(entry.data));
  const tmh = entries.find((entry) => isTmh(entry.data));
  if (!pmoEntry || !ahi) throw new Error("Armor piece without a mesh or skeleton");
  return {
    slot,
    pmo: readPmo(pmoEntry.data),
    bones: readAhi(ahi.data),
    textures: withSkin(tmh ? readTmh(tmh.data) : [], skin),
  };
}

/**
 * The pieces as one model on the player's skeleton (see the module comment).
 * Needs leggings, whose skeleton is the whole player's.
 */
export function composeHunter(pieces: readonly HunterPiece[]): HunterModel {
  const leggings = pieces.find((piece) => piece.slot === "leggings");
  if (!leggings) throw new Error("A hunter needs leggings for the player skeleton");
  const skeleton = leggings.bones;
  if (skeleton.length !== PLAYER_BONE_COUNT)
    throw new Error(`Player skeleton has ${skeleton.length} bones`);
  const playerPositions = bindPositions(skeleton);

  const textures: TmhImage[] = [];
  const materials: Pmo["materials"] = [];
  const meshes: Pmo["meshes"] = [];
  const meshSlots: HunterSlot[] = [];
  // Positions in model units, gathered first: the shared scale needs them all.
  type Placed = { position: Vec3; normal?: Vec3; scale: Vec3 };
  const placed: Placed[][][] = [];

  for (const { slot, pmo, bones, textures: images } of pieces) {
    const map: readonly number[] = ARMOR_JOINT_MAPS[slot];
    const positions = bindPositions(bones);
    const jointOf = (bone: number): number => {
      const joint = map[bone];
      if (joint === undefined || bones[bone] === undefined)
        throw new Error(`${slot}: bone ${bone} has no player joint`);
      return joint;
    };
    // How far each of the piece's bones is from its joint in the player's bind pose.
    const offsets = bones.map((_, bone): Vec3 => {
      const joint = jointOf(bone);
      if (joint < 0) return [0, 0, 0];
      return playerPositions[joint]!.map((c, k) => c - positions[bone]![k]!) as Vec3;
    });

    // Each of the piece's images, by index, at its place in the model's
    // list. An image the pieces share (the skin) goes in once. An index past
    // the piece's images gets one of its own past the model's, so it can't
    // land on another piece's texture.
    const textureOf = images.map((image) => {
      let index = textures.indexOf(image);
      if (index < 0) index = textures.push(image) - 1;
      return index;
    });
    const materialBase = materials.length;
    materials.push(
      ...pmo.materials.map((m) => ({
        ...m,
        textureIndex: textureOf[m.textureIndex] ?? MISSING_TEXTURE + m.textureIndex,
      })),
    );

    const meshBase = meshes.length;
    pmo.meshes.forEach((mesh, m) => {
      placed[meshBase + m] = mesh.primitives.map((primitive) =>
        primitive.geometry.vertices.map((v) => {
          const position = v.position.map((c, k) => c * pmo.scale[k]!) as Vec3;
          let total = 0;
          v.weights?.forEach((weight, s) => {
            const bone = primitive.bones[s];
            if (bone === undefined || bone < 0 || weight === 0) return;
            total += weight;
          });
          if (total > 0)
            v.weights?.forEach((weight, s) => {
              const bone = primitive.bones[s];
              if (bone === undefined || bone < 0 || weight === 0) return;
              offsets[bone]!.forEach((c, k) => (position[k] = position[k]! + (weight / total) * c));
            });
          return { position, normal: v.normal as Vec3 | undefined, scale: pmo.scale };
        }),
      );
      meshSlots.push(slot);
      meshes.push({
        uvScale: mesh.uvScale,
        primitives: mesh.primitives.map((primitive) => ({
          ...primitive,
          materialIndex: primitive.materialIndex + materialBase,
          bones: primitive.bones.map((bone) => {
            if (bone < 0) return bone;
            const joint = jointOf(bone);
            // A vertex on an unmapped bone stays put with the root.
            return joint < 0 ? JOINT.ROOT : joint;
          }),
        })),
      });
    });
  }

  const scale = [0, 1, 2].map((k) =>
    Math.max(1, ...placed.flat(2).map((p) => Math.abs(p.position[k]!))),
  ) as Vec3;
  return {
    bones: skeleton,
    meshSlots,
    textures,
    pmo: {
      radius: Math.hypot(...scale),
      scale,
      materials,
      meshes: meshes.map((mesh, m) => ({
        ...mesh,
        primitives: mesh.primitives.map((primitive, i) => ({
          ...primitive,
          geometry: {
            ...primitive.geometry,
            vertices: primitive.geometry.vertices.map((v, j) => {
              const place = placed[m]![i]![j]!;
              return {
                ...v,
                position: place.position.map((c, k) => c / scale[k]!) as Vec3,
                // Normals are stored in scaled model space (gltf.ts multiplies
                // them by the scale): rescale so n * scale keeps its direction.
                normal: place.normal?.map((c, k) => (c * place.scale[k]!) / scale[k]!) as
                  Vec3 | undefined,
              };
            }),
          },
        })),
      })),
    },
  };
}

/**
 * Index of the root each of a weapon's bones hangs from, in skeleton order:
 * a weapon's skeleton has one root per piece the game moves apart (the main
 * weapon; a shield, the second blade, a bow's quiver).
 */
export function boneRoots(bones: readonly Bone[]): number[] {
  const roots = bones.filter((bone) => bone.parent < 0).map((bone) => bone.id);
  return bones.map((bone) => {
    let root = bone;
    while (root.parent >= 0) root = bones[root.parent]!;
    return roots.indexOf(root.id);
  });
}
