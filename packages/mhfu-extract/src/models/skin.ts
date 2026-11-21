/**
 * The hunter's skin textures, for armor pieces that show skin.
 *
 * Some armor pieces (thighs, hips, a neck or face under a helmet) have PMO
 * materials whose texture index is past the end of the package's own `.TMH`
 * images. The game draws those parts with the skin tone the player picked,
 * one texture set per tone in `player/<m|f>/skin/<m|f>_skinNNN.tmh` (four a
 * sex, outside every armor package). So a piece's textures are its own, then
 * the skin set's: index `own + k` is the skin set's image `k`. The site uses
 * the first tone.
 *
 * That mapping is inferred from the file layout, not read from game code:
 * `export-site` logs the materials it still can't texture.
 */
import type { Pmo } from "./pmo.js";
import type { TmhImage } from "./tmh.js";

/** Skin tones on the disc, per sex. */
export const SKIN_TONES = 4;

/** DATA.BIN path of one skin tone's textures, e.g. `player/m/skin/m_skin000.tmh`. */
export function skinTexturePath(sex: "m" | "f", tone = 0): string {
  return `player/${sex}/skin/${sex}_skin${String(tone).padStart(3, "0")}.tmh`;
}

/** A piece's textures as its materials index them: its own, then the skin's. */
export function withSkin(own: readonly TmhImage[], skin: readonly TmhImage[]): TmhImage[] {
  return [...own, ...skin];
}

/** The texture indices `pmo`'s materials use that `textures` has no image for. */
export function missingTextures(pmo: Pmo, textures: readonly unknown[]): number[] {
  const missing = new Set<number>();
  for (const mesh of pmo.meshes)
    for (const primitive of mesh.primitives) {
      const index = pmo.materials[primitive.materialIndex]?.textureIndex;
      if (index !== undefined && index >= textures.length) missing.add(index);
    }
  return [...missing].sort((a, b) => a - b);
}
