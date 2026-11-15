import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bone } from "../src/models/ahi.js";
import { readPac } from "../src/models/pac.js";
import type { Pmo } from "../src/models/pmo.js";
import type { TmhImage } from "../src/models/tmh.js";
import { WORN, wearProps } from "../src/models/worn-props.js";
import { pac, pmo } from "./model-fixtures.js";

const bone = (id: number, parent: number, translation: Bone["translation"]): Bone => ({
  id,
  parent,
  scale: [1, 1, 1],
  rotation: [0, 0, 0],
  translation,
  part: 0,
});
const bones = [bone(0, -1, [0, 0, 0]), bone(1, 0, [10, 0, 0])];

const body: Pmo = {
  radius: 1,
  scale: [4, 4, 4],
  materials: [{ diffuse: 0, ambient: 0, textureIndex: 0 }],
  meshes: [
    {
      uvScale: [1, 1],
      primitives: [
        {
          materialIndex: 0,
          bones: [0],
          geometry: {
            vertices: [
              {
                position: [0.5, 0.5, 0.5],
                normal: [1, 0, 0],
                weights: [1],
                sizes: { position: 2, normal: 1, uv: 2 },
              },
            ],
            triangles: [],
          },
        },
      ],
    },
  ],
};
const texture: TmhImage = { width: 1, height: 1, rgba: Buffer.alloc(4), hasAlpha: false };
const emptyTmh = Buffer.alloc(16);
emptyTmh.write(".TMH0.14", 0, "latin1");

// Entry 0 stands in for the body; the props PMO (scale 2, 4, 8, a quad from
// the origin to (1, 1, 0)) and its textures come after it.
const entries = readPac(pac([Buffer.from("body"), pmo(), emptyTmh]));

test("wearProps leaves a package that wears nothing alone", () => {
  const worn = wearProps("em57", entries, 0, body, bones, [texture]);
  assert.equal(worn.pmo, body);
  assert.deepEqual(worn.textures, [texture]);
});

test("wearProps puts a prop on its bone, rigidly skinned, and grows the scale to fit", () => {
  const { pmo: worn, textures } = wearProps("test", entries, 0, body, bones, [texture], {
    test: [{ mesh: 0, bone: 1, offset: [1, 1, 1] }],
  });
  // The quad, in model units, sits at bone 1 (10, 0, 0) plus the offset.
  assert.deepEqual(worn.scale, [13, 5, 4]);
  const prop = worn.meshes[1]!.primitives[0]!;
  assert.deepEqual(
    prop.geometry.vertices.map((v) => v.position.map((c, k) => c * worn.scale[k]!)),
    [
      [11, 1, 1],
      [13, 1, 1],
      [11, 5, 1],
      [13, 5, 1],
    ],
  );
  assert.deepEqual(prop.bones, [1]);
  assert.ok(prop.geometry.vertices.every((v) => v.weights?.join() === "1"));
  // Its materials follow the body's, their textures the body's textures.
  assert.equal(prop.materialIndex, 1 + 1);
  assert.deepEqual(
    worn.materials.map((m) => m.textureIndex),
    [0, 3 + 1, 5 + 1],
  );
  assert.deepEqual(textures, [texture]);
  // The body keeps its place in model units.
  const [v] = worn.meshes[0]!.primitives[0]!.geometry.vertices;
  assert.deepEqual(
    v!.position.map((c, k) => c * worn.scale[k]!),
    [2, 2, 2],
  );
});

test("King Shakalaka wears the meat grill on its head", () => {
  assert.deepEqual(
    WORN.em79?.map(({ mesh, bone }) => [mesh, bone]),
    [[4, 11]],
  );
});

test("wearProps refuses a body whose textures are missing", () => {
  assert.throws(
    () =>
      wearProps("em79", entries, 0, body, bones, [], {
        em79: [{ mesh: 0, bone: 1, offset: [0, 0, 0] }],
      }),
    /body textures missing/,
  );
});
