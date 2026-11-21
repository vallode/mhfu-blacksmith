import assert from "node:assert/strict";
import { test } from "node:test";
import { roundTripPac } from "../src/cli/model-roundtrip.js";
import { readPac, writePac } from "../src/models/pac.js";
import { readPmo } from "../src/models/pmo.js";
import { parsePmoFile, writePmo, type GeVertex, type PmoFile } from "../src/models/pmo-file.js";

/** u16 UVs, s8 normals, s16 positions, u8 weights and indices; `weights` of them. */
const vtype = (weights: number, indexSize: 1 | 2) =>
  2 | (1 << 5) | (2 << 7) | (1 << 9) | ((indexSize === 1 ? 1 : 2) << 11) | ((weights - 1) << 14);

const vertex = (position: [number, number, number], weights: number[]): GeVertex => ({
  weights,
  uv: [position[0] & 0xffff, position[1] & 0xffff],
  color: null,
  normal: [0, 127, 0],
  position,
});

/** Two meshes: the first's groups use slots 0 and 1 (materials 1 and 0), the second's its own slot (material 0). */
function file(): PmoFile {
  return {
    radius: 100,
    scale: [2, 4, 8],
    materials: [
      { diffuse: 0xffffffff, ambient: 0x7f7f7f, textureIndex: 0, extra: 0 },
      { diffuse: 0xff808080, ambient: 0x7f7f7f, textureIndex: 1, extra: 0 },
    ],
    meshes: [
      {
        uvScale: [1, 1],
        flags: 0x80000003,
        blend: 0,
        materialSlots: [1, 0],
        groups: [
          {
            materialSlot: 0,
            palette: [
              [0, 1],
              [1, 2],
            ],
            list: {
              vertexType: vtype(2, 1),
              vertices: [
                vertex([0, 0, 0], [128, 0]),
                vertex([0x7fff, 0, 0], [64, 64]),
                vertex([0, 0x7fff, 0], [0, 128]),
                vertex([0x7fff, 0x7fff, 0], [128, 0]),
              ],
              indices: [0, 1, 2, 3],
              draws: [{ frontFace: 0 }, { prim: 4, count: 4 }],
            },
          },
          {
            // No palette entries: keeps the slots group 0 loaded. Three weights
            // make an 18-byte vertex, so the indices start after padding.
            materialSlot: 1,
            palette: [],
            list: {
              vertexType: vtype(3, 2),
              vertices: [0, 1, 2, 3, 4].map((i) =>
                vertex([i * 100, 500 - i * 100, i], [128, 0, 0]),
              ),
              indices: [0, 1, 2, 2, 3, 4],
              draws: [
                { frontFace: 0 },
                { prim: 3, count: 3 },
                { frontFace: 1 },
                { prim: 3, count: 3 },
              ],
            },
          },
        ],
      },
      {
        uvScale: [2, 1],
        flags: 0x80000004,
        blend: 0xdf000032,
        materialSlots: [0],
        groups: [
          {
            materialSlot: 0,
            palette: [[0, 3]],
            list: {
              vertexType: vtype(1, 1),
              vertices: [
                vertex([1, 2, 3], [128]),
                vertex([4, 5, 6], [128]),
                vertex([7, 8, 9], [128]),
              ],
              indices: [0, 1, 2],
              draws: [{ frontFace: 0 }, { prim: 3, count: 3 }],
            },
          },
        ],
      },
    ],
  };
}

test("writePmo writes what parsePmoFile reads back unchanged", () => {
  const bytes = writePmo(file());
  assert.equal(bytes.readUInt32LE(0x08), bytes.length);
  for (let table = 0x20; table <= 0x34; table += 4) assert.equal(bytes.readUInt32LE(table) % 16, 0);
  assert.deepEqual(parsePmoFile(bytes), file());
  assert.ok(writePmo(parsePmoFile(bytes)).equals(bytes));
});

test("readPmo draws a written PMO with its materials, bones, windings and blend", () => {
  const model = readPmo(writePmo(file()));
  assert.deepEqual(model.scale, [2, 4, 8]);
  const [first, second] = model.meshes;
  assert.deepEqual(
    first!.primitives.map((p) => p.materialIndex),
    [1, 0],
  );
  assert.deepEqual(
    second!.primitives.map((p) => p.materialIndex),
    [0],
  );
  assert.deepEqual(first!.primitives[0]!.bones, [1, 2]);
  assert.deepEqual(first!.primitives[1]!.bones, [1, 2]);
  assert.deepEqual(second!.primitives[0]!.bones, [3, 2]);
  assert.deepEqual(first!.primitives[0]!.geometry.vertices[1]!.position, [1, 0, 0]);
  assert.equal(first!.primitives[0]!.geometry.triangles.length, 2);
  // The FFACE 1 partway through flips the second triangle's winding.
  assert.deepEqual(first!.primitives[1]!.geometry.triangles, [
    [0, 1, 2],
    [2, 4, 3],
  ]);
  assert.equal(second!.blend, "alpha");
  assert.deepEqual(second!.uvScale, [2, 1]);
});

test("writePmo refuses indices past the vertices and vertices that don't fit the VTYPE", () => {
  const badIndex = file();
  badIndex.meshes[1]!.groups[0]!.list.indices = [0, 1, 3];
  assert.throws(() => writePmo(badIndex), /Index 3 is out of range/);
  const badVertex = file();
  badVertex.meshes[1]!.groups[0]!.list.vertices[0]!.weights = [64, 64];
  assert.throws(() => writePmo(badVertex), /2 weights/);
  const badSlot = file();
  badSlot.meshes[1]!.groups[0]!.materialSlot = 1;
  assert.throws(() => writePmo(badSlot), /uses slot 1 of 1/);
});

test("writePac aligns entries to 16 bytes and keeps unused slots at (0, 0)", () => {
  const buf = writePac([Buffer.from("hello"), Buffer.alloc(0), Buffer.from("abc")]);
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((i) => buf.readUInt32LE(4 + i * 4)),
    [0x20, 5, 0, 0, 0x30, 3],
  );
  assert.equal(buf.length, 0x33);
  assert.deepEqual(
    readPac(buf).map((e) => e.data.toString("latin1")),
    ["hello", "", "abc"],
  );
  // A package with no entries is just its header.
  assert.equal(writePac([Buffer.alloc(0), Buffer.alloc(0)]).length, 4 + 2 * 8);
});

test("roundTripPac passes a package the writers reproduce and names the first byte they don't", () => {
  const pmo = writePmo(file());
  const sectorPadded = Buffer.concat([
    writePac([pmo, Buffer.from("skeleton")]),
    Buffer.alloc(64, 0x5d),
  ]);
  assert.equal(roundTripPac(sectorPadded), undefined);
  const unknown = Buffer.from(pmo);
  unknown[0x38] = 1; // header bytes the parser doesn't keep
  assert.equal(roundTripPac(writePac([unknown])), "entry 0: PMO differs from byte 0x38");
});
