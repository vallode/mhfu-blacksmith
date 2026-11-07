import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import { decodeVertexType, runDisplayList } from "../src/models/ge.js";
import { buildGlb } from "../src/models/gltf.js";
import { isPac, readPac } from "../src/models/pac.js";
import { encodePng } from "../src/models/png.js";
import { readPmo } from "../src/models/pmo.js";
import { readTmh, unswizzle } from "../src/models/tmh.js";

function pac(entries: Buffer[]): Buffer {
  const header = Buffer.alloc(4 + entries.length * 8);
  header.writeUInt32LE(entries.length, 0);
  let offset = header.length;
  entries.forEach((entry, i) => {
    header.writeUInt32LE(offset, 4 + i * 8);
    header.writeUInt32LE(entry.length, 8 + i * 8);
    offset += entry.length;
  });
  return Buffer.concat([header, ...entries]);
}

test("readPac splits entries and identifies magics", () => {
  const buf = pac([Buffer.from("pmo\x001.0\x00", "latin1"), Buffer.from(".TMH0.14", "latin1"), Buffer.from([0, 0, 0, 0xc0])]);
  assert.ok(isPac(buf));
  const entries = readPac(buf);
  assert.deepEqual(
    entries.map((e) => e.magic),
    ["pmo", ".TMH", null]
  );
  assert.equal(entries[1]!.data.toString("latin1"), ".TMH0.14");
});

test("isPac rejects non-package data such as motion tables", () => {
  // First bytes of a real EU motion table (misnamed weapon/we009.pac): count 100 at offset 0x38 overruns.
  const buf = Buffer.alloc(64);
  buf.writeUInt32LE(0x64, 0);
  buf.writeUInt32LE(0x38, 4);
  assert.equal(isPac(buf), false);
});

test("decodeVertexType matches the layout real weapon/armor meshes use (VTYPE 0x005322)", () => {
  const fmt = decodeVertexType(0x005322);
  // 2 x u8 weights, 2 x u16 UV, 3 x s8 normal, 3 x s16 position, u16 indices.
  assert.equal(fmt.weightCount, 2);
  assert.equal(fmt.weightSize, 1);
  assert.equal(fmt.uvSize, 2);
  assert.equal(fmt.normalSize, 1);
  assert.equal(fmt.positionSize, 2);
  assert.equal(fmt.indexSize, 2);
  assert.deepEqual([fmt.weightOffset, fmt.uvOffset, fmt.normalOffset, fmt.positionOffset, fmt.stride], [0, 2, 6, 10, 16]);
});

/** Build a display list drawing one indexed 4-vertex strip with VTYPE 0x000900 (s16 positions, u8 indices). */
function stripDisplayList(clockwise: boolean): Buffer {
  const commands = [0x12000000 | (2 << 7) | (1 << 11), 0x01000000 | 0x20, 0x02000000 | 0x38, 0x9b000000 | (clockwise ? 1 : 0), 0x04040004, 0x0b000000];
  const list = Buffer.alloc(0x40);
  commands.forEach((c, i) => list.writeUInt32LE(c >>> 0, i * 4));
  const positions = [
    [0, 0, 0],
    [0x7fff, 0, 0],
    [0, 0x7fff, 0],
    [0x7fff, 0x7fff, 0],
  ];
  positions.forEach((p, i) => p.forEach((v, k) => list.writeInt16LE(v, 0x20 + i * 6 + k * 2)));
  list.set([0, 1, 2, 3], 0x38);
  return list;
}

test("runDisplayList decodes an indexed triangle strip with alternating winding", () => {
  const { vertices, triangles } = runDisplayList(new BinaryReader(stripDisplayList(false)), 0);
  assert.equal(vertices.length, 4);
  assert.deepEqual(vertices[3]!.position, [1, 1, 0]);
  assert.deepEqual(triangles, [
    [0, 1, 2],
    [2, 1, 3],
  ]);
  const flipped = runDisplayList(new BinaryReader(stripDisplayList(true)), 0);
  assert.deepEqual(flipped.triangles, [
    [0, 2, 1],
    [2, 3, 1],
  ]);
});

test("runDisplayList rejects unknown GE commands instead of guessing", () => {
  const list = Buffer.alloc(8);
  list.writeUInt32LE(0xc6000000, 0); // texture scale, not used by PMO files
  assert.throws(() => runDisplayList(new BinaryReader(list), 0), /Unsupported GE command 0xc6/);
});

/** Minimal PMO 1.0: one mesh, two vertex groups, material map sending slot 1 to material 0. */
function pmo(): Buffer {
  const list = stripDisplayList(false);
  const buf = Buffer.alloc(0x100 + list.length);
  buf.write("pmo\x001.0\x00", 0, "latin1");
  buf.writeUInt32LE(buf.length, 0x08);
  buf.writeFloatLE(2, 0x0c);
  [2, 4, 8].forEach((s, i) => buf.writeFloatLE(s, 0x10 + i * 4));
  buf.writeUInt16LE(1, 0x1c); // meshes
  buf.writeUInt16LE(2, 0x1e); // materials
  buf.writeUInt32LE(0x40, 0x20); // mesh table
  buf.writeUInt32LE(0x60, 0x24); // vertex groups
  buf.writeUInt32LE(0x80, 0x28); // material map
  buf.writeUInt32LE(0x90, 0x2c);
  buf.writeUInt32LE(0x90, 0x30); // materials
  buf.writeUInt32LE(0x100, 0x34); // display lists
  buf.writeFloatLE(1, 0x40);
  buf.writeFloatLE(1, 0x44);
  buf.writeUInt16LE(0, 0x52); // material slot base
  buf.writeUInt16LE(2, 0x54); // group count
  buf.writeUInt16LE(0, 0x56); // first group
  buf.writeUInt8(0, 0x60); // group 0 -> slot 0
  buf.writeUInt8(1, 0x70); // group 1 -> slot 1
  buf.set([1, 0], 0x80); // slot 0 -> material 1, slot 1 -> material 0
  buf.writeUInt32LE(0xffffffff, 0x90);
  buf.writeUInt32LE(3, 0x98); // material 0 texture 3
  buf.writeUInt32LE(5, 0xa8); // material 1 texture 5
  list.copy(buf, 0x100);
  return buf;
}

test("readPmo resolves materials through the material map and keeps per-axis scale", () => {
  const model = readPmo(pmo());
  assert.deepEqual(model.scale, [2, 4, 8]);
  assert.equal(model.meshes.length, 1);
  assert.deepEqual(
    model.meshes[0]!.primitives.map((p) => p.materialIndex),
    [1, 0]
  );
  assert.deepEqual(
    model.materials.map((m) => m.textureIndex),
    [3, 5]
  );
});

test("buildGlb writes a valid GLB header with scaled positions", () => {
  const { glb, stats } = buildGlb(readPmo(pmo()), [], "test");
  assert.equal(glb.subarray(0, 4).toString("latin1"), "glTF");
  assert.equal(glb.readUInt32LE(8), glb.length);
  assert.deepEqual(stats, { primitives: 2, vertices: 8, triangles: 4 });
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf-8"));
  const position = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  assert.deepEqual(position.max, [2, 4, 0]);
});

test("unswizzle reorders 16-byte x 8-row blocks into rows", () => {
  const rowBytes = 32;
  const swizzled = Buffer.alloc(rowBytes * 8);
  // Block 0 holds the left 16 bytes of rows 0-7, block 1 the right 16 bytes.
  for (let i = 0; i < swizzled.length; i++) swizzled[i] = i < 128 ? Math.floor(i / 16) : 100 + Math.floor((i - 128) / 16);
  const out = unswizzle(swizzled, rowBytes, 8);
  assert.equal(out[0], 0);
  assert.equal(out[16], 100);
  assert.equal(out[rowBytes * 7 + 31], 107);
});

test("readTmh decodes a 4-bit paletted image", () => {
  const pixels = Buffer.alloc(16 * 8 / 2, 0x10); // every byte: pixel0 = index 0, pixel1 = index 1
  const palette = Buffer.alloc(16 * 4);
  palette.set([255, 0, 0, 255], 0);
  palette.set([0, 0, 255, 128], 4);
  const pixelHeader = Buffer.alloc(16);
  pixelHeader.writeUInt32LE(16 + pixels.length, 0);
  pixelHeader.writeUInt32LE(0, 4); // not swizzled
  pixelHeader.writeUInt32LE(4, 8);
  pixelHeader.writeUInt16LE(16, 12);
  pixelHeader.writeUInt16LE(8, 14);
  const paletteHeader = Buffer.alloc(16);
  paletteHeader.writeUInt32LE(16 + palette.length, 0);
  paletteHeader.writeUInt32LE(3, 8);
  paletteHeader.writeUInt32LE(16, 12);
  const imageHeader = Buffer.alloc(16);
  imageHeader.writeUInt32LE(16 + 16 + pixels.length + 16 + palette.length, 0);
  imageHeader.writeUInt32LE(1, 12);
  const header = Buffer.alloc(16);
  header.write(".TMH0.14", 0, "latin1");
  header.writeUInt32LE(1, 8);
  const [image] = readTmh(Buffer.concat([header, imageHeader, pixelHeader, pixels, paletteHeader, palette]));
  assert.equal(image!.width, 16);
  assert.deepEqual([...image!.rgba.subarray(0, 8)], [255, 0, 0, 255, 0, 0, 255, 128]);
  assert.equal(image!.hasAlpha, true);
});

test("encodePng round-trips pixel rows through zlib", () => {
  const rgba = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const png = encodePng(2, 1, rgba);
  assert.equal(png.subarray(1, 4).toString("latin1"), "PNG");
  const idatLength = png.readUInt32BE(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLength));
  assert.deepEqual([...raw], [0, ...rgba]);
});
