/**
 * The hunter's own head: the face and hairstyle picked at character
 * creation, which armor goes on around.
 *
 * - Faces are `player/<m|f>/face/<m|f>_faceNNN.pac`: a two-bone skeleton
 *   (a root, and the head at the origin) and a mesh of two materials,
 *   drawn on the player's head joint.
 * - Hairstyles are `player/<m|f>/head/<m|f>_headNNN.pac`, built like a
 *   helmet (`player/<m|f>/hair/`, whose model 0 is hairstyle 0): the game
 *   draws one in the helmet's place when no helmet is worn. Their texture is
 *   grey, which the game tints with the hair colour the player picked
 *   (`dyeHair`).
 * - Some helmets hide all of the face, or its material 0, where the face
 *   would show through the helmet. Which ones is a table in the EBOOT, by
 *   helmet model (`BODY_MODEL_MATERIAL_MASKS`, tclamb/mhp2g-decomp's
 *   `player_manager.material_masks.cpp`), copied here as `FACE_MASKS`.
 */
import type { Pmo } from "./pmo.js";
import type { TmhImage } from "./tmh.js";

type Sex = "m" | "f";

/** `MaterialMask` bits (the decomp's `game_sys.hpp`): which of a face's materials a helmet hides. */
export const FACE_MASK = {
  MATERIAL_0: 1 << 1,
  MATERIAL_1: 1 << 2,
  ALL: 1 << 3,
} as const;

const masks = (all: number[], material0: number[]): Record<number, number> =>
  Object.fromEntries([
    ...all.map((id) => [id, FACE_MASK.ALL]),
    ...material0.map((id) => [id, FACE_MASK.MATERIAL_0]),
  ]);

/** Face mask bits by helmet model ID (`player/<sex>/hair/`), per sex; absent for none. */
export const FACE_MASKS: Record<Sex, Record<number, number>> = {
  m: masks(
    [
      3, 6, 9, 21, 29, 32, 40, 41, 43, 47, 50, 67, 80, 87, 89, 95, 96, 101, 104, 105, 106, 122, 125,
      126, 127, 140, 141, 144, 145, 149, 150, 160, 161, 162, 178, 179, 180, 181, 183, 187, 188, 189,
      193, 194, 195, 225, 228, 229, 230, 233, 234, 247, 248, 253, 256, 261, 263, 264, 269, 271, 276,
      279, 280, 282, 285, 290, 291, 293, 294, 295, 296, 301, 306, 307, 308, 309, 310, 311,
    ],
    [
      5, 7, 11, 20, 23, 25, 28, 31, 42, 44, 45, 46, 48, 66, 78, 79, 82, 94, 114, 116, 118, 120, 121,
      138, 152, 154, 171, 217, 249, 250, 302, 303,
    ],
  ),
  f: masks(
    [9, 122, 144, 145, 252, 284, 292, 293, 294, 295, 305, 306],
    [41, 95, 104, 216, 217, 275, 302],
  ),
};

/**
 * In the site's hunter GLBs, the face's primitives are tagged (`extras.part`)
 * this plus their material in the face (0 or 1), after the armor slots'.
 */
export const FACE_PART = 5;

/** The face and hairstyle the site's hunters have: each sex's first. */
export const HUNTER_FACE = 0;
export const HUNTER_HAIRSTYLE = 0;

/**
 * The hair colour the site's hunters have, as 0xRRGGBB. The player picks
 * their own; this is a dark brown.
 */
export const HUNTER_HAIR_COLOR = 0x4a3020;

const pad = (id: number) => String(id).padStart(3, "0");

/** DATA.BIN path of a face, e.g. `player/m/face/m_face000.pac`. */
export function facePath(sex: Sex, id: number): string {
  return `player/${sex}/face/${sex}_face${pad(id)}.pac`;
}

/** DATA.BIN path of a hairstyle, e.g. `player/f/head/f_head000.pac`. */
export function hairstylePath(sex: Sex, id: number): string {
  return `player/${sex}/head/${sex}_head${pad(id)}.pac`;
}

/**
 * Whether a helmet's face `mask` (`FACE_MASK` bits) hides the face's
 * `material`.
 */
export function hidesFaceMaterial(mask: number, material: number): boolean {
  if (mask & FACE_MASK.ALL) return true;
  if (material === 0) return (mask & FACE_MASK.MATERIAL_0) !== 0;
  if (material === 1) return (mask & FACE_MASK.MATERIAL_1) !== 0;
  return false;
}

/**
 * A face piece less the materials a helmet's `mask` hides; undefined when
 * it hides all of it.
 */
export function maskFace<T extends { pmo: Pmo }>(face: T, mask: number): T | undefined {
  if (!mask) return face;
  const meshes = face.pmo.meshes
    .map((mesh) => ({
      ...mesh,
      primitives: mesh.primitives.filter((p) => !hidesFaceMaterial(mask, p.materialIndex)),
    }))
    .filter((mesh) => mesh.primitives.length > 0);
  return meshes.length ? { ...face, pmo: { ...face.pmo, meshes } } : undefined;
}

/**
 * The material of a hairstyle that is hair, which the hair colour tints.
 * Which materials the game tints isn't decoded (`Player::applyHairColor` in
 * the decomp has no source yet), but every hairstyle on the disc, of both
 * sexes, has its hair on material 0 (the most vertices by far) and at most a
 * small material 1 for a tie or ornament with its colour in the texture.
 */
export const HAIR_MATERIAL = 0;

/**
 * A hairstyle with its hair (`HAIR_MATERIAL`) tinted `color` (0xRRGGBB): the
 * material gets a tinted copy of its texture, added after the piece's
 * textures, so other materials on the same texture keep its colours.
 */
export function dyeHair<T extends { pmo: Pmo; textures: TmhImage[] }>(hair: T, color: number): T {
  const material = hair.pmo.materials[HAIR_MATERIAL];
  const image = material && hair.textures[material.textureIndex];
  if (!material || !image) return hair;
  const textures = [...hair.textures, tint(image, color)];
  const materials = hair.pmo.materials.map((m, i) =>
    i === HAIR_MATERIAL ? { ...m, textureIndex: textures.length - 1 } : m,
  );
  return { ...hair, textures, pmo: { ...hair.pmo, materials } };
}

/** `image` multiplied by `color` (0xRRGGBB), as the game tints hair. */
export function tint(image: TmhImage, color: number): TmhImage {
  const factor = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map((c) => c / 255);
  const rgba = Buffer.from(image.rgba);
  for (let i = 0; i < rgba.length; i += 4)
    for (let k = 0; k < 3; k++) rgba[i + k] = Math.round(rgba[i + k]! * factor[k]!);
  return { ...image, rgba };
}
