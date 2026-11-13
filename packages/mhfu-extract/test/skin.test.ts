import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pmo } from "../src/models/pmo.js";
import { missingTextures, skinTexturePath, withSkin } from "../src/models/skin.js";
import type { TmhImage } from "../src/models/tmh.js";

const image = (width: number): TmhImage => ({
  width,
  height: 1,
  rgba: Buffer.alloc(width * 4),
  hasAlpha: false,
});

/** A model with one primitive per material index in `used`. */
function model(textureIndices: number[], used: number[]): Pmo {
  return {
    radius: 1,
    scale: [1, 1, 1],
    materials: textureIndices.map((textureIndex) => ({ diffuse: 0, ambient: 0, textureIndex })),
    meshes: [
      {
        uvScale: [1, 1],
        primitives: used.map((materialIndex) => ({
          materialIndex,
          bones: [],
          geometry: { vertices: [], triangles: [] } as never,
        })),
      },
    ],
  };
}

test("skin textures are each sex's tone files", () => {
  assert.equal(skinTexturePath("m"), "player/m/skin/m_skin000.tmh");
  assert.equal(skinTexturePath("f", 3), "player/f/skin/f_skin003.tmh");
});

test("a piece's skin comes after its own textures", () => {
  const own = image(1);
  const skin = image(2);
  assert.deepEqual(withSkin([own], [skin]), [own, skin]);
});

test("missingTextures lists the indices past the textures that primitives use", () => {
  // Material 2 indexes past both images but no primitive uses it.
  const pmo = model([0, 2, 5], [0, 1, 1]);
  assert.deepEqual(missingTextures(pmo, [image(1), image(1)]), [2]);
  assert.deepEqual(missingTextures(pmo, [image(1), image(1), image(1)]), []);
});
