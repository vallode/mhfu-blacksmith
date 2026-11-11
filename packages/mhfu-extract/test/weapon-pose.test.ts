import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bone } from "../src/models/ahi.js";
import type { DecodedVertex } from "../src/models/ge.js";
import type { Pmo } from "../src/models/pmo.js";
import { DRAWN_BONE_SCALES, poseWeapon } from "../src/models/weapon-pose.js";

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
  const posed = poseWeapon(
    model(scale, [1, 3], [claw]),
    GREAT_SWORD,
    DRAWN_BONE_SCALES["great-sword"]!,
  );
  const v = posed.meshes[0]!.primitives[0]!.geometry.vertices[0]!;
  // x: 130.5 + 0.125 * (-10) * (2.6 - 1) = 128.5
  assert.ok(near(world(posed, v), [128.5, 0, 19.3]), String(world(posed, v)));
  // The scale grew to fit: x went past the old 50.
  assert.ok(posed.scale[0] >= 128.5);
});

test("vertices on unposed bones stay put, and so does a model with none on a posed bone", () => {
  const blade = model([100, 10, 300], [1, 2], [vertex([0.5, 0, 0.9], [0.5, 0.5])]);
  assert.equal(poseWeapon(blade, GREAT_SWORD, DRAWN_BONE_SCALES["great-sword"]!), blade);
});

test("normals take the inverse scale", () => {
  const scale: Vec3 = [100, 100, 100];
  const tip = vertex([1.405, 0, 0.193], [0, 1], [1, 0, 1]);
  const posed = poseWeapon(
    model(scale, [1, 3], [tip]),
    GREAT_SWORD,
    DRAWN_BONE_SCALES["great-sword"]!,
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
  assert.equal(poseWeapon(claw, turned, DRAWN_BONE_SCALES["great-sword"]!), claw);
});
