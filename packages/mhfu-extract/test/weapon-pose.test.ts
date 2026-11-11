import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bone } from "../src/models/ahi.js";
import type { DecodedVertex } from "../src/models/ge.js";
import type { Pmo } from "../src/models/pmo.js";
import { poseWeapon, WEAPON_POSES } from "../src/models/weapon-pose.js";

type Vec3 = [number, number, number];

const bone = (id: number, parent: number, translation: Vec3, extra: Partial<Bone> = {}): Bone => ({
  id,
  parent,
  translation,
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  part: 0,
  ...extra,
});

/** A great sword's rig, like the Ravager Blade's (`we012`): grip 1, end 2, claw bone 3. */
const GREAT_SWORD = [
  bone(0, -1, [0, 0, 0]),
  bone(1, 0, [0, 0, 0]),
  bone(2, 1, [0, 0, 224.6]),
  bone(3, 1, [140.5, 0, 19.3]),
];

function vertex(position: Vec3, weights: number[], normal: Vec3 = [0, 0, 1]): DecodedVertex {
  return { position, normal, weights, sizes: { position: 2, normal: 1, uv: 2 } };
}

function model(scale: Vec3, palette: number[], vertices: DecodedVertex[]): Pmo {
  return {
    radius: 1,
    scale,
    materials: [{ diffuse: 0, ambient: 0, textureIndex: 0 }],
    meshes: [
      {
        uvScale: [1, 1],
        primitives: [{ materialIndex: 0, bones: palette, geometry: { vertices, triangles: [] } }],
      },
    ],
  };
}

const world = (pmo: Pmo, v: DecodedVertex): number[] => v.position.map((c, k) => c * pmo.scale[k]!);
const near = (a: number[], b: number[]) => a.every((c, k) => Math.abs(c - b[k]!) < 1e-3);

test("a great sword's claw bone is scaled about its pivot, by each vertex's weight", () => {
  const scale: Vec3 = [50, 10, 200];
  // A claw tip 10 units in from bone 3 along x, 0.87 / 0.13 on bones 1 and 3.
  const claw = vertex([130.5 / 50, 0, 19.3 / 200], [0.875, 0.125]);
  const { pmo: posed } = poseWeapon(
    model(scale, [1, 3], [claw]),
    GREAT_SWORD,
    WEAPON_POSES["great-sword"]!,
  );
  const v = posed.meshes[0]!.primitives[0]!.geometry.vertices[0]!;
  // x: 130.5 + 0.125 * (-10) * (2.6 - 1) = 128.5
  assert.ok(near(world(posed, v), [128.5, 0, 19.3]), String(world(posed, v)));
  // The scale grew to fit: x went past the old 50.
  assert.ok(posed.scale[0] >= 128.5);
});

test("a model with nothing on a posed bone comes back as it was, without a sheathed copy", () => {
  const blade = model([100, 10, 300], [0, 1], [vertex([0.5, 0, 0.9], [0.5, 0.5])]);
  const posed = poseWeapon(blade, GREAT_SWORD, WEAPON_POSES["great-sword"]!);
  assert.equal(posed.pmo, blade);
  assert.equal(posed.sheathed, undefined);
});

test("the sheathed copy has the claw at rest and the end bone's z scaled, at the drawn copy's scale", () => {
  const scale: Vec3 = [50, 10, 300];
  // A claw tip 10 units in from bone 3, and a blade tip 40 past bone 2 (z 224.6).
  const claw = vertex([130.5 / 50, 0, 19.3 / 300], [0.875, 0.125]);
  const end = vertex([0, 0, 264.6 / 300], [0, 1]);
  const { pmo, sheathed } = poseWeapon(
    model(scale, [1, 3, 2], [claw, { ...end, weights: [0, 0, 1] }]),
    GREAT_SWORD,
    WEAPON_POSES["great-sword"]!,
  );
  assert.ok(sheathed);
  assert.deepEqual(sheathed.scale, pmo.scale);
  const [drawnClaw, drawnEnd] = pmo.meshes[0]!.primitives[0]!.geometry.vertices;
  const [restClaw, shrunkEnd] = sheathed.meshes[0]!.primitives[0]!.geometry.vertices;
  assert.ok(near(world(pmo, drawnClaw!), [128.5, 0, 19.3]));
  assert.ok(near(world(pmo, drawnEnd!), [0, 0, 264.6]));
  assert.ok(near(world(sheathed, restClaw!), [130.5, 0, 19.3]));
  // z: 224.6 + 40 * 0.73
  assert.ok(near(world(sheathed, shrunkEnd!), [0, 0, 253.8]), String(world(sheathed, shrunkEnd!)));
});

test("normals take the inverse scale", () => {
  const scale: Vec3 = [100, 100, 100];
  const tip = vertex([1.405, 0, 0.193], [0, 1], [1, 0, 1]);
  const { pmo: posed } = poseWeapon(
    model(scale, [1, 3], [tip]),
    GREAT_SWORD,
    WEAPON_POSES["great-sword"]!,
  );
  const n = posed.meshes[0]!.primitives[0]!.geometry.vertices[0]!.normal!;
  const direction = n.map((c, k) => c * posed.scale[k]!);
  // (1, 0, 1) through diag(1/2.6, 1, 1/2.5), up to length.
  const ratio = direction[0]! / direction[2]!;
  assert.ok(Math.abs(ratio - 2.5 / 2.6) < 1e-6, String(ratio));
});

test("a bone the skeleton turns is left alone", () => {
  const turned = GREAT_SWORD.map((b) => (b.id === 3 ? { ...b, rotation: [0, 1, 0] as Vec3 } : b));
  const claw = model([200, 10, 200], [3], [vertex([0.5, 0, 0.1], [1])]);
  assert.equal(poseWeapon(claw, turned, WEAPON_POSES["great-sword"]!).pmo, claw);
});
