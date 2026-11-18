import assert from "node:assert/strict";
import { test } from "node:test";
import { readAhi, type Bone } from "../src/models/ahi.js";
import {
  attachDetachedParts,
  detachedBoneCounterparts,
  detachedBoneOffsets,
  skeletonFor,
  skinDetachedParts,
} from "../src/models/attach.js";
import type { DecodedVertex } from "../src/models/ge.js";
import { readPac } from "../src/models/pac.js";
import { readPmo, type Pmo } from "../src/models/pmo.js";

type Vec3 = [number, number, number];

/** A .ahi file as monster packages store it: 0x20-byte header, then 0x10c-byte bones. */
function ahi(
  bones: { parent: number; translation: Vec3; part?: number; rotation?: Vec3; scale?: Vec3 }[],
): Buffer {
  const buf = Buffer.alloc(0x20 + bones.length * 0x10c);
  buf.writeUInt32LE(0xc0000000, 0);
  buf.writeUInt32LE(buf.length, 8);
  buf.writeUInt32LE(2, 0x10);
  buf.writeUInt32LE(0x14, 0x14); // bones start at 0x0c + 0x14
  bones.forEach((bone, id) => {
    const at = 0x20 + id * 0x10c;
    buf.writeUInt32LE(0x40000001, at);
    buf.writeUInt32LE(1, at + 4);
    buf.writeUInt32LE(0x10c, at + 8);
    buf.writeInt32LE(id, at + 0x0c);
    buf.writeInt32LE(bone.parent, at + 0x10);
    buf.writeInt32LE(-1, at + 0x14);
    buf.writeInt32LE(-1, at + 0x18);
    [...(bone.scale ?? [1, 1, 1]), 1].forEach((v, k) => buf.writeFloatLE(v, at + 0x1c + k * 4));
    [...(bone.rotation ?? [0, 0, 0]), 1].forEach((v, k) => buf.writeFloatLE(v, at + 0x2c + k * 4));
    [...bone.translation, 1].forEach((v, k) => buf.writeFloatLE(v, at + 0x3c + k * 4));
    buf.writeInt32LE(-1, at + 0x4c);
    buf.writeUInt8(bone.part ?? 0, at + 0x50);
  });
  return buf;
}

/**
 * A tail like the game's: root 0 -> tail 1 -> leaf 2 (+50 back towards the
 * body), and a parentless copy 3 -> 4 -> 5 of the tail's end around the origin.
 */
const TAIL = [
  { parent: -1, translation: [0, 0, 0] as Vec3 },
  { parent: 0, translation: [0, 10, -100] as Vec3, part: 2 },
  { parent: 1, translation: [0, 0, 50] as Vec3, part: 2 },
  { parent: -1, translation: [0, 0, 0] as Vec3, part: 3 },
  { parent: 3, translation: [0, 0, 0] as Vec3, part: 3 },
  { parent: 4, translation: [0, 0, 50] as Vec3, part: 3 },
];

test("readAhi reads the hierarchy, offsets and part of each bone", () => {
  const bones = readAhi(ahi(TAIL));
  assert.equal(bones.length, 6);
  assert.deepEqual(
    bones.map((b) => b.parent),
    [-1, 0, 1, -1, 3, 4],
  );
  assert.deepEqual(bones[1]!.translation, [0, 10, -100]);
  assert.deepEqual(
    bones.map((b) => b.part),
    [0, 2, 2, 3, 3, 3],
  );
});

test("detachedBoneOffsets moves the parentless copy onto the tail it copies", () => {
  const offsets = detachedBoneOffsets(readAhi(ahi(TAIL)));
  assert.deepEqual([...offsets.keys()], [3, 4, 5]);
  assert.deepEqual(offsets.get(4), [0, 10, -100]);
});

test("detachedBoneOffsets leaves a chain alone when it is already in place or ambiguous", () => {
  // Already on the tail (as Lavasioth's is): nothing to move.
  const placed = TAIL.map((b, i) => (i === 4 ? { ...b, translation: [0, 10, -100] as Vec3 } : b));
  assert.equal(detachedBoneOffsets(readAhi(ahi(placed))).size, 0);
  // Two main-hierarchy leaves the copy could match: don't guess.
  const ambiguous = [...TAIL, { parent: 0, translation: [0, 0, 50] as Vec3 }];
  assert.equal(detachedBoneOffsets(readAhi(ahi(ambiguous))).size, 0);
  // No detached chain at all (small monsters).
  assert.equal(detachedBoneOffsets(readAhi(ahi(TAIL.slice(0, 3)))).size, 0);
});

test("detachedBoneOffsets only needs the bones it sums to be unrotated and unscaled", () => {
  // A turned or scaled bone elsewhere (Yian Garuga's crest, Basarios's neck)
  // and authoring noise on the path (Gravios, ~0.001 rad) don't matter.
  const crest = { parent: 0, translation: [0, 50, 100] as Vec3, rotation: [0, 0, 1.309] as Vec3 };
  const neck = { parent: 0, translation: [0, 20, 80] as Vec3, scale: [1, 1, 0.767] as Vec3 };
  const noisy = TAIL.map((b, i) => (i === 1 ? { ...b, rotation: [0.001, 0, 0] as Vec3 } : b));
  for (const bones of [[...TAIL, crest], [...TAIL, neck], noisy]) {
    assert.deepEqual(detachedBoneOffsets(readAhi(ahi(bones))).get(4), [0, 10, -100]);
  }
  // A real turn on the path would move the attach point: leave it alone.
  const turned = TAIL.map((b, i) => (i === 1 ? { ...b, rotation: [0, 0.5, 0] as Vec3 } : b));
  assert.equal(detachedBoneOffsets(readAhi(ahi(turned))).size, 0);
});

function vertex(position: Vec3, weights: number[]): DecodedVertex {
  return { position, normal: [0, 0, 1], weights, sizes: { position: 2, normal: 1, uv: 2 } };
}

test("attachDetachedParts moves vertices skinned to the copy and grows the scale to fit", () => {
  const scale: Vec3 = [100, 100, 100];
  const model: Pmo = {
    radius: 100,
    scale,
    materials: [{ diffuse: 0, ambient: 0, textureIndex: 0 }],
    meshes: [
      {
        uvScale: [1, 1],
        primitives: [
          // Body: skinned to the tail bone, stays put.
          {
            materialIndex: 0,
            bones: [1],
            geometry: { vertices: [vertex([0, 0, -0.5], [1])], triangles: [] },
          },
          // Tail tip: half on each bone of the copy, z = 0.2 * 100 = 20 around the origin.
          {
            materialIndex: 0,
            bones: [4, 5],
            geometry: { vertices: [vertex([0, 0, 0.2], [0.5, 0.5])], triangles: [] },
          },
        ],
      },
    ],
  };
  const bones: Bone[] = readAhi(ahi(TAIL));
  const attached = attachDetachedParts(model, bones);

  // The tip moved to z = 20 - 100 = -80 and y = 10, beyond the old z scale.
  assert.deepEqual(attached.scale, [100, 100, 100]);
  const world = (pmo: Pmo, p: number, v: number) =>
    pmo.meshes[0]!.primitives[p]!.geometry.vertices[v]!.position.map(
      (c, k) => Math.round(c * pmo.scale[k]! * 1000) / 1000,
    );
  assert.deepEqual(world(attached, 0, 0), [0, 0, -50]);
  assert.deepEqual(world(attached, 1, 0), [0, 10, -80]);
  // The input is left untouched.
  assert.deepEqual(world(model, 1, 0), [0, 0, 20]);

  // Push the tip past the extent: the scale grows on that axis only, and
  // normals are rescaled so normal * scale keeps its direction.
  const far = structuredClone(model);
  far.meshes[0]!.primitives[1]!.geometry.vertices[0]!.position = [0, 0, -0.5];
  const grown = attachDetachedParts(far, bones);
  assert.deepEqual(grown.scale, [100, 100, 150]);
  assert.deepEqual(world(grown, 1, 0), [0, 10, -150]);
  assert.deepEqual(world(grown, 0, 0), [0, 0, -50]);
  const n = grown.meshes[0]!.primitives[1]!.geometry.vertices[0]!.normal!;
  assert.deepEqual(
    n.map((c, k) => c * grown.scale[k]!),
    [0, 0, 100],
  );
});

test("attachDetachedParts returns models without a detached chain unchanged", () => {
  const model: Pmo = { radius: 1, scale: [1, 1, 1], materials: [], meshes: [] };
  assert.equal(attachDetachedParts(model, readAhi(ahi(TAIL.slice(0, 3)))), model);
  assert.equal(attachDetachedParts(model, []), model);
});

test("skeletonFor takes the .ahi before the PMO and tolerates packages without one", () => {
  const skeleton = ahi(TAIL);
  const mesh = Buffer.from("pmo\x001.0\x00", "latin1");
  const header = Buffer.alloc(4 + 2 * 8);
  header.writeUInt32LE(2, 0);
  header.writeUInt32LE(header.length, 4);
  header.writeUInt32LE(skeleton.length, 8);
  header.writeUInt32LE(header.length + skeleton.length, 12);
  header.writeUInt32LE(mesh.length, 16);
  const entries = readPac(Buffer.concat([header, skeleton, mesh]));
  assert.equal(skeletonFor(entries, 1).length, 6);
  assert.deepEqual(skeletonFor(entries, 0), []);
});

test("readPmo maps each vertex group's weights to bones through the bone palette", () => {
  // One mesh, two groups: the first loads slots 0 and 1, the second reloads slot 1.
  const list = Buffer.alloc(8);
  list.writeUInt32LE(0x0b000000, 0); // RET: an empty display list
  const buf = Buffer.alloc(0x100 + list.length);
  buf.write("pmo\x001.0\x00", 0, "latin1");
  [1, 1, 1].forEach((s, i) => buf.writeFloatLE(s, 0x10 + i * 4));
  buf.writeUInt16LE(1, 0x1c); // meshes
  buf.writeUInt16LE(1, 0x1e); // materials
  buf.writeUInt32LE(0x40, 0x20); // mesh table
  buf.writeUInt32LE(0x60, 0x24); // vertex groups
  buf.writeUInt32LE(0x80, 0x28); // material map
  buf.writeUInt32LE(0x88, 0x2c); // bone palette
  buf.writeUInt32LE(0x90, 0x30); // materials
  buf.writeUInt32LE(0x100, 0x34); // display lists
  buf.writeUInt16LE(2, 0x54); // group count
  buf.set([0, 2], 0x60); // group 0: material slot 0, two palette entries...
  buf.writeUInt16LE(0, 0x62); // ...from entry 0
  buf.set([0, 1], 0x70); // group 1: one entry...
  buf.writeUInt16LE(2, 0x72); // ...from entry 2
  buf.set([0, 7, 1, 9, 1, 12], 0x88); // (slot, bone) pairs
  list.copy(buf, 0x100);
  const model = readPmo(buf);
  assert.deepEqual(
    model.meshes[0]!.primitives.map((p) => p.bones),
    [
      [7, 9],
      [7, 12],
    ],
  );
});

test("detachedBoneCounterparts maps the copy onto the tail bones it lands on", () => {
  // 5 lands on the tail's leaf 2; 4 and its parent 3 both on tail bone 1.
  const expected = [
    [3, 1],
    [4, 1],
    [5, 2],
  ];
  assert.deepEqual([...detachedBoneCounterparts(readAhi(ahi(TAIL)))], expected);
  // A copy already in place (Lavasioth's) still follows the tail once animated.
  const placed = TAIL.map((b, i) => (i === 4 ? { ...b, translation: [0, 10, -100] as Vec3 } : b));
  // Its root stays at the origin, on the skeleton's root.
  assert.deepEqual(
    [...detachedBoneCounterparts(readAhi(ahi(placed)))],
    [
      [3, 0],
      [4, 1],
      [5, 2],
    ],
  );
  assert.equal(detachedBoneCounterparts(readAhi(ahi(TAIL.slice(0, 3)))).size, 0);
});

test("skinDetachedParts swaps the copy's bones for their counterparts in each palette", () => {
  const model: Pmo = {
    radius: 1,
    scale: [1, 1, 1],
    materials: [{ diffuse: 0, ambient: 0, textureIndex: 0 }],
    meshes: [
      {
        uvScale: [1, 1],
        primitives: [
          { materialIndex: 0, bones: [0, 4, 5, -1], geometry: { vertices: [], triangles: [] } },
        ],
      },
    ],
  };
  const skinned = skinDetachedParts(model, readAhi(ahi(TAIL)));
  assert.deepEqual(skinned.meshes[0]!.primitives[0]!.bones, [0, 1, 2, -1]);
  assert.deepEqual(model.meshes[0]!.primitives[0]!.bones, [0, 4, 5, -1]);
});
