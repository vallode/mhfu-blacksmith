import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pmo, PmoPrimitive } from "../src/models/pmo.js";
import { spawnHidden, withoutHidden } from "../src/models/spawn-parts.js";

const primitive = (materialIndex: number): PmoPrimitive => ({
  materialIndex,
  bones: [],
  geometry: { vertices: [], triangles: [] },
});

const pmo: Pmo = {
  radius: 1,
  scale: [1, 1, 1],
  materials: [0, 1, 2].map((textureIndex) => ({ diffuse: 0, ambient: 0, textureIndex })),
  meshes: [
    { uvScale: [1, 1], primitives: [primitive(0), primitive(1), primitive(1)] },
    { uvScale: [1, 1], primitives: [primitive(1), primitive(2)] },
  ],
};

test("withoutHidden drops every primitive of a hidden (mesh, material) pair, in that mesh only", () => {
  const shown = withoutHidden(pmo, [
    [0, 1],
    [1, 2],
  ]);
  assert.deepEqual(
    shown.meshes.map((mesh) => mesh.primitives.map((p) => p.materialIndex)),
    [[0], [1]],
  );
  assert.equal(pmo.meshes[0]!.primitives.length, 3, "the source PMO is left alone");
});

test("withoutHidden refuses pairs the model doesn't have", () => {
  assert.throws(() => withoutHidden(pmo, [[1, 0]]), /1\/0/);
});

test("spawnHidden reads the vendored table by package", () => {
  // Rathian: the stump caps, the broken head and the broken wings.
  assert.deepEqual(spawnHidden("em01"), [
    [0, 19],
    [0, 20],
    [1, 13],
    [2, 10],
    [3, 3],
    [3, 4],
    [3, 5],
    [3, 6],
  ]);
  assert.deepEqual(spawnHidden("em99"), []);
});
