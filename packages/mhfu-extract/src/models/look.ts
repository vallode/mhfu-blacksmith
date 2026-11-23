/**
 * The hunter's own look, picked at character creation, which armor goes on
 * around: face, hairstyle, hair colour and clothing (`UserData` in
 * tclamb/mhp2g-decomp's `game_sys.hpp`: `clothingId`, `faceId`, `hairId`,
 * `hairColor`).
 *
 * - Faces are `player/<m|f>/face/<m|f>_faceNNN.pac`: a two-bone skeleton
 *   (a root, and the head at the origin) and a mesh of two materials,
 *   drawn on the player's head joint. Each face has a skin tone
 *   (`FACE_SKIN_TONES`), which the clothing and armor's bare skin take.
 * - Hairstyles are `player/<m|f>/head/<m|f>_headNNN.pac`, built like a
 *   helmet (`player/<m|f>/hair/`, whose model 0 is hairstyle 0): the game
 *   draws one in the helmet's place when no helmet is worn. Their texture is
 *   grey, which the game tints with the hair colour the player picked
 *   (`dyeHair`).
 * - Clothing is what the hunter wears under armor in the chest, arm and leg
 *   slots: an armor model by clothing and skin tone (`CLOTHING_MODELS`), the
 *   skin baked into its texture. The waist has none (its model 0 is empty).
 * - Some helmets hide all of the face, or its material 0, where the face
 *   would show through the helmet. Which ones is a table in the EBOOT, by
 *   helmet model (`BODY_MODEL_MATERIAL_MASKS`, tclamb/mhp2g-decomp's
 *   `player_manager.material_masks.cpp`), copied here as `FACE_MASKS`.
 *
 * The tables below are copied from the decomp's
 * `player_manager.skin.cpp` and `player_manager.material_masks.cpp`.
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

/**
 * In the site's hairstyle GLBs, the hair's primitives (`HAIR_MATERIAL`) are
 * tagged (`extras.part`) this, for the site to dye them; a hairstyle's other
 * primitives are tagged 0, the helmet slot's.
 */
export const HAIR_PART = 7;

/** The skin tone (`player/<m|f>/skin/<m|f>_skinNNN.tmh`) of each face, per sex (`FACE_SKIN_IDS`). */
export const FACE_SKIN_TONES: Record<Sex, readonly number[]> = {
  m: [
    0, 1, 3, 2, 0, 1, 3, 2, 0, 1, 3, 2, 0, 1, 3, 2, 0, 1, 3, 2, 0, 1, 3, 2, 0, 1, 3, 0, 0, 1, 0, 1,
  ],
  f: [
    0, 1, 3, 2, 0, 1, 2, 2, 0, 1, 3, 2, 0, 1, 3, 2, 0, 1, 3, 2, 0, 1, 3, 2, 0, 1, 3, 0, 0, 1, 1, 0,
  ],
};

/** Slots the clothing has a model in. */
export type ClothingSlot = "plate" | "gauntlets" | "leggings";

/**
 * The armor model (in the slot's `player/<m|f>/` folder) of each clothing
 * (0-7), by skin tone (0-3), per sex and slot (`CHEST_`, `ARM_` and
 * `LEG_CLOTHING_MODEL_IDS`). Clothing 2 in tone 0 is each slot's model 0.
 */
export const CLOTHING_MODELS: Record<Sex, Record<ClothingSlot, readonly (readonly number[])[]>> = {
  m: {
    plate: [
      [189, 190, 191, 192],
      [193, 194, 195, 196],
      [0, 16, 222, 223],
      [220, 221, 17, 18],
      [254, 253, 252, 251],
      [258, 257, 256, 255],
      [262, 261, 260, 259],
      [266, 265, 264, 263],
    ],
    gauntlets: [
      [185, 186, 187, 188],
      [189, 190, 191, 192],
      [0, 16, 217, 218],
      [215, 216, 17, 18],
      [246, 245, 244, 243],
      [250, 249, 248, 247],
      [254, 253, 252, 251],
      [258, 257, 256, 255],
    ],
    leggings: [
      [162, 163, 164, 165],
      [166, 167, 168, 169],
      [0, 13, 195, 196],
      [193, 194, 14, 15],
      [224, 223, 222, 221],
      [228, 227, 226, 225],
      [232, 231, 230, 229],
      [236, 235, 234, 233],
    ],
  },
  f: {
    plate: [
      [188, 189, 190, 191],
      [192, 193, 194, 195],
      [0, 12, 221, 222],
      [219, 220, 13, 14],
      [252, 251, 250, 249],
      [256, 255, 254, 253],
      [260, 259, 258, 257],
      [264, 263, 262, 261],
    ],
    gauntlets: [
      [185, 186, 187, 188],
      [189, 190, 191, 192],
      [0, 12, 217, 218],
      [215, 216, 13, 14],
      [245, 244, 243, 242],
      [249, 248, 247, 246],
      [253, 252, 251, 250],
      [257, 256, 255, 254],
    ],
    leggings: [
      [163, 164, 165, 166],
      [167, 168, 169, 170],
      [0, 11, 196, 197],
      [194, 195, 12, 13],
      [224, 223, 222, 221],
      [228, 227, 226, 225],
      [232, 231, 230, 229],
      [236, 235, 234, 233],
    ],
  },
};

/** The clothing the site's bare hunters wear: the one whose tone-0 models are model 0. */
export const HUNTER_CLOTHING = 2;

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
