import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dyeHair,
  FACE_MASK,
  FACE_MASKS,
  facePath,
  hairstylePath,
  hidesFaceMaterial,
  maskFace,
  tint,
} from "../src/models/face.js";
import type { Pmo } from "../src/models/pmo.js";

/** A model with one primitive on each material. */
function model(materials: number): Pmo {
  return {
    radius: 1,
    scale: [1, 1, 1],
    materials: Array.from({ length: materials }, () => ({
      diffuse: 0,
      ambient: 0,
      textureIndex: 0,
    })),
    meshes: [
      {
        uvScale: [1, 1],
        primitives: Array.from({ length: materials }, (_, materialIndex) => ({
          materialIndex,
          bones: [1],
          geometry: { vertices: [], triangles: [] } as never,
        })),
      },
    ],
  };
}

test("face and hairstyle paths", () => {
  assert.equal(facePath("m", 0), "player/m/face/m_face000.pac");
  assert.equal(hairstylePath("f", 26), "player/f/head/f_head026.pac");
});

test("face masks are the decomp's, by helmet model", () => {
  // Rathalos Helm S (male) covers the face; Gypceros Helm S hides material 0.
  assert.equal(FACE_MASKS.m[3], FACE_MASK.ALL);
  assert.equal(FACE_MASKS.m[5], FACE_MASK.MATERIAL_0);
  // The Battle Helm hides nothing.
  assert.equal(FACE_MASKS.m[33], undefined);
  assert.equal(Object.keys(FACE_MASKS.m).length, 110);
  assert.equal(Object.keys(FACE_MASKS.f).length, 19);
});

test("tint multiplies colour and keeps alpha", () => {
  const image = { width: 1, height: 1, rgba: Buffer.from([200, 100, 50, 128]), hasAlpha: true };
  const tinted = tint(image, 0x80ff00);
  assert.deepEqual([...tinted.rgba], [100, 100, 0, 128]);
  assert.deepEqual([...image.rgba], [200, 100, 50, 128]);
});

test("a helmet's mask hides the face's materials it names", () => {
  assert.equal(hidesFaceMaterial(FACE_MASK.ALL, 1), true);
  assert.equal(hidesFaceMaterial(FACE_MASK.MATERIAL_0, 0), true);
  assert.equal(hidesFaceMaterial(FACE_MASK.MATERIAL_0, 1), false);
  assert.equal(hidesFaceMaterial(0, 0), false);
  const face = { pmo: model(2) };
  assert.equal(maskFace(face, 0), face);
  assert.equal(maskFace(face, FACE_MASK.ALL), undefined);
  const lower = maskFace(face, FACE_MASK.MATERIAL_0)!;
  assert.deepEqual(
    lower.pmo.meshes[0]!.primitives.map((p) => p.materialIndex),
    [1],
  );
  // Materials keep their indices, which tag the face's parts.
  assert.equal(lower.pmo.materials.length, 2);
});

test("dyeHair tints the hair's material only", () => {
  const grey = { width: 1, height: 1, rgba: Buffer.from([200, 200, 200, 255]), hasAlpha: false };
  const hair = { pmo: model(2), textures: [grey] };
  const dyed = dyeHair(hair, 0xff0000);
  assert.deepEqual(
    dyed.pmo.materials.map((m) => m.textureIndex),
    [1, 0],
  );
  assert.deepEqual([...dyed.textures[1]!.rgba], [200, 0, 0, 255]);
  assert.equal(dyed.textures[0], grey);
  assert.equal(hair.pmo.materials[0]!.textureIndex, 0);
});
