import assert from "node:assert/strict";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import { decodeVertexType, runDisplayList } from "../src/models/ge.js";
import type { Bone } from "../src/models/ahi.js";
import type { Clip } from "../src/models/animation.js";
import { buildGlb } from "../src/models/gltf.js";
import { isPac, readPac } from "../src/models/pac.js";
import { encodePng } from "../src/models/png.js";
import { readPmo } from "../src/models/pmo.js";
import { encodeTexture } from "../src/models/texture.js";
import { readTmh, unswizzle } from "../src/models/tmh.js";
import { MeshoptDecoder } from "meshoptimizer";
import { pac, pmo, stripDisplayList } from "./model-fixtures.js";
import sharp from "sharp";

test("readPac splits entries and identifies magics", () => {
  const buf = pac([
    Buffer.from("pmo\x001.0\x00", "latin1"),
    Buffer.from(".TMH0.14", "latin1"),
    Buffer.from([0, 0, 0, 0xc0]),
  ]);
  assert.ok(isPac(buf));
  const entries = readPac(buf);
  assert.deepEqual(
    entries.map((e) => e.magic),
    ["pmo", ".TMH", null],
  );
  assert.equal(entries[1]!.data.toString("latin1"), ".TMH0.14");
});

test("readPac accepts unused (0, 0) slots, as in small monsters' packages", () => {
  const mesh = Buffer.from("pmo\x001.0\x00", "latin1");
  const buf = Buffer.alloc(4 + 2 * 8 + mesh.length);
  buf.writeUInt32LE(2, 0);
  buf.writeUInt32LE(20, 4); // entry 0 right after the header
  buf.writeUInt32LE(mesh.length, 8);
  // entry 1 left as (0, 0)
  mesh.copy(buf, 20);
  assert.ok(isPac(buf));
  const entries = readPac(buf);
  assert.equal(entries[0]!.magic, "pmo");
  assert.equal(entries[1]!.data.length, 0);
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
  assert.deepEqual(
    [fmt.weightOffset, fmt.uvOffset, fmt.normalOffset, fmt.positionOffset, fmt.stride],
    [0, 2, 6, 10, 16],
  );
});

/** Build a display list drawing one indexed 4-vertex strip with VTYPE 0x000900 (s16 positions, u8 indices). */

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

test("readPmo resolves materials through the material map and keeps per-axis scale", () => {
  const model = readPmo(pmo());
  assert.deepEqual(model.scale, [2, 4, 8]);
  assert.equal(model.meshes.length, 1);
  assert.deepEqual(
    model.meshes[0]!.primitives.map((p) => p.materialIndex),
    [1, 0],
  );
  assert.deepEqual(
    model.materials.map((m) => m.textureIndex),
    [3, 5],
  );
});

/** Read a glTF bufferView, decoding EXT_meshopt_compression when present. */
function readView(
  glb: Buffer,
  json: { bufferViews: Record<string, any>[] },
  index: number,
): Uint8Array {
  const bin = glb.subarray(20 + glb.readUInt32LE(12) + 8);
  const view = json.bufferViews[index]!;
  const meshopt = view.extensions?.EXT_meshopt_compression;
  if (!meshopt) return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const out = new Uint8Array(meshopt.count * meshopt.byteStride);
  MeshoptDecoder.decodeGltfBuffer(
    out,
    meshopt.count,
    meshopt.byteStride,
    bin.subarray(meshopt.byteOffset, meshopt.byteOffset + meshopt.byteLength),
    meshopt.mode,
  );
  return out;
}

function glbJson(glb: Buffer) {
  return JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf-8"));
}

/** Every triangle as sorted "x,y,z|u,v" vertex strings, from the exact (16-byte) vertex layout. */
function exactTriangles(glb: Buffer): string[] {
  const json = glbJson(glb);
  const vertices = Buffer.from(readView(glb, json, 0));
  const indexView = Buffer.from(readView(glb, json, 1));
  const out: string[] = [];
  for (const primitive of json.meshes[0].primitives) {
    const accessor = json.accessors[primitive.indices];
    const first = (accessor.byteOffset ?? 0) / 2;
    for (let t = 0; t < accessor.count; t += 3) {
      const tri = [0, 1, 2].map((k) => {
        const v = indexView.readUInt16LE((first + t + k) * 2) * 16;
        return `${vertices.readInt16LE(v)},${vertices.readInt16LE(v + 2)},${vertices.readInt16LE(v + 4)}|${vertices.readUInt16LE(v + 12)},${vertices.readUInt16LE(v + 14)}`;
      });
      out.push(tri.sort().join(" "));
    }
  }
  return out.sort();
}

/** PMO 1.0 with one indexed strip in the exact MHFU vertex layout: u16 UV, s8 normal, s16 position. */
function exactPmo(): Buffer {
  const vtype = 2 | (1 << 5) | (2 << 7) | (1 << 11); // stride: uv 4 + normal 3 (+1 pad) + position 6 = 14
  const commands = [
    0x12000000 | vtype,
    0x01000000 | 0x20,
    0x02000000 | 0x60,
    0x9b000000,
    0x04040004,
    0x0b000000,
  ];
  const list = Buffer.alloc(0x70);
  commands.forEach((c, i) => list.writeUInt32LE(c >>> 0, i * 4));
  const verts = [
    { uv: [0, 0], p: [-32767, -32767, 0] },
    { uv: [32768, 0], p: [32767, -32767, 0] },
    { uv: [0, 32768], p: [-32767, 32767, 0] },
    { uv: [32768, 32768], p: [32767, 32767, 0] },
  ];
  verts.forEach((v, i) => {
    const at = 0x20 + i * 14;
    list.writeUInt16LE(v.uv[0]!, at);
    list.writeUInt16LE(v.uv[1]!, at + 2);
    list.writeInt8(0, at + 4);
    list.writeInt8(127, at + 5);
    list.writeInt8(0, at + 6);
    v.p.forEach((c, k) => list.writeInt16LE(c, at + 8 + k * 2));
  });
  list.set([0, 1, 2, 3], 0x60);
  return pmo(list);
}

test("buildGlb stores the source integers exactly (KHR_mesh_quantization) with the scale on the node", async () => {
  const { glb, stats } = await buildGlb(readPmo(exactPmo()), [], "test", { compress: false });
  assert.equal(glb.subarray(0, 4).toString("latin1"), "glTF");
  assert.equal(glb.readUInt32LE(8), glb.length);
  // Both vertex groups draw the same strip; identical vertices are shared.
  assert.deepEqual(stats, { primitives: 2, vertices: 4, triangles: 4, clips: 0 });
  const json = glbJson(glb);
  assert.ok(json.extensionsRequired.includes("KHR_mesh_quantization"));
  assert.deepEqual(json.nodes[0].scale, [2, 4, 8]);
  const position = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  assert.equal(position.componentType, 5122);
  assert.equal(position.normalized, true);
  assert.deepEqual(position.max, [32767, 32767, 0]);
  assert.ok(
    exactTriangles(glb).includes(
      "-32767,-32767,0|0,0 -32767,32767,0|0,32768 32767,-32767,0|32768,0",
    ),
  );
});

test("buildGlb meshopt compression is lossless", async () => {
  const plain = await buildGlb(readPmo(exactPmo()), [], "test", { compress: false });
  const packed = await buildGlb(readPmo(exactPmo()), [], "test");
  assert.ok(glbJson(packed.glb).extensionsRequired.includes("EXT_meshopt_compression"));
  await MeshoptDecoder.ready;
  assert.deepEqual(exactTriangles(packed.glb), exactTriangles(plain.glb));
});

test("buildGlb lossy positionBits rounds positions to the requested precision", async () => {
  const { glb } = await buildGlb(readPmo(exactPmo()), [], "test", {
    compress: false,
    positionBits: 4,
  });
  // 4 bits keep multiples of 2^12; +-32767 rounds to +-32768 and clamps to +-32767.
  for (const triangle of exactTriangles(glb)) {
    for (const vertex of triangle.split(" ")) {
      for (const c of vertex.split("|")[0]!.split(",").map(Number))
        assert.ok(c === 0 || Math.abs(c) === 32767 || c % 4096 === 0, String(c));
    }
  }
});

test("buildGlb writes morph targets as named float offsets from the stored vertices", async () => {
  const model = readPmo(exactPmo());
  // The target pushes every vertex half the scale along z, the normal unchanged.
  const raised = {
    ...model,
    meshes: model.meshes.map((mesh) => ({
      ...mesh,
      primitives: mesh.primitives.map((primitive) => ({
        ...primitive,
        geometry: {
          ...primitive.geometry,
          vertices: primitive.geometry.vertices.map((v) => ({
            ...v,
            position: [v.position[0], v.position[1], v.position[2] + 0.5] as [
              number,
              number,
              number,
            ],
          })),
        },
      })),
    })),
  };
  for (const compress of [false, true]) {
    const { glb, stats } = await buildGlb(model, [], "test", {
      compress,
      targets: [{ name: "raised", pmo: raised }],
    });
    assert.equal(stats.vertices, 4);
    const json = glbJson(glb);
    assert.deepEqual(json.meshes[0].extras.targetNames, ["raised"]);
    assert.deepEqual(json.meshes[0].weights, [0]);
    const [target] = json.meshes[0].primitives[0].targets;
    const position = json.accessors[target.POSITION];
    assert.equal(position.componentType, 5126);
    await MeshoptDecoder.ready;
    const offsets = Buffer.from(readView(glb, json, position.bufferView));
    for (let i = 0; i < 4; i++) {
      const at = i * 24;
      const read = [0, 1, 2, 3, 4, 5].map((k) => offsets.readFloatLE(at + k * 4));
      assert.deepEqual(
        read.map((c) => Math.round(c * 1e4) / 1e4),
        [0, 0, 0.5, 0, 0, 0],
      );
    }
  }
});

test("buildGlb falls back to float attributes for other vertex layouts", async () => {
  const { glb, stats } = await buildGlb(readPmo(pmo()), [], "test", { compress: false });
  assert.deepEqual(stats, { primitives: 2, vertices: 4, triangles: 4, clips: 0 });
  const json = glbJson(glb);
  const position = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  assert.equal(position.componentType, 5126);
  assert.deepEqual(position.max, [1, 1, 0]);
  assert.deepEqual(json.nodes[0].scale, [2, 4, 8]);
});

test("buildGlb with a rig skins the mesh to the skeleton and writes its clips", async () => {
  const source = readPmo(exactPmo());
  // Every vertex a quarter on bone 0 and three quarters on bone 1.
  const pmo = {
    ...source,
    meshes: source.meshes.map((mesh) => ({
      ...mesh,
      primitives: mesh.primitives.map((primitive) => ({
        ...primitive,
        bones: [0, 1],
        geometry: {
          ...primitive.geometry,
          vertices: primitive.geometry.vertices.map((v) => ({ ...v, weights: [0.25, 0.75] })),
        },
      })),
    })),
  };
  const bones: Bone[] = [
    { id: 0, parent: -1, scale: [1, 1, 1], rotation: [0, 0, 0], translation: [0, 0, 0], part: 0 },
    { id: 1, parent: 0, scale: [1, 1, 1], rotation: [0, 0, 0], translation: [0, 5, 0], part: 0 },
  ];
  const clip: Clip = {
    slot: 7,
    duration: 1,
    loop: true,
    loopStart: 0.5,
    tracks: [{ bone: 1, path: "rotation", times: [0, 1], values: [0, 0, 0, 1, 0, 1, 0, 0] }],
  };
  const { glb, stats } = await buildGlb(
    pmo,
    [],
    "test",
    { compress: false },
    {
      bones,
      clips: [clip],
      motionsFile: "em99.motions.bin",
    },
  );
  assert.equal(stats.clips, 1);
  const json = glbJson(glb);
  assert.equal(json.asset.extras.motions, "em99.motions.bin");
  // The mesh node carries no transform; the scale moves into the inverse binds.
  assert.deepEqual(json.nodes[0], { mesh: 0, skin: 0 });
  assert.deepEqual(
    json.nodes.slice(1).map((n: { name: string }) => n.name),
    ["bone_0", "bone_1"],
  );
  assert.deepEqual(json.nodes[1].children, [2]);
  assert.deepEqual(json.skins[0].joints, [1, 2]);
  const ibm = json.accessors[json.skins[0].inverseBindMatrices];
  assert.equal(ibm.count, 2);
  const matrices = new Float32Array(Uint8Array.from(readView(glb, json, ibm.bufferView)).buffer);
  // Bone 1's: scale (2, 4, 8), then back down by its bind position (y 5).
  assert.deepEqual([...matrices.slice(16)], [2, 0, 0, 0, 0, 4, 0, 0, 0, 0, 8, 0, 0, -5, 0, 1]);

  const attributes = json.meshes[0].primitives[0].attributes;
  const joints = json.accessors[attributes.JOINTS_0];
  const weights = json.accessors[attributes.WEIGHTS_0];
  assert.equal(json.bufferViews[joints.bufferView].byteStride, 24);
  const vertices = Buffer.from(readView(glb, json, joints.bufferView));
  for (let v = 0; v < vertices.length; v += 24) {
    assert.deepEqual(
      [...vertices.subarray(v + joints.byteOffset, v + joints.byteOffset + 4)],
      [1, 0, 0, 0],
    );
    assert.deepEqual(
      [...vertices.subarray(v + weights.byteOffset, v + weights.byteOffset + 4)],
      [191, 64, 0, 0],
    );
  }

  const [animation] = json.animations;
  assert.equal(animation.name, "motion 7");
  assert.deepEqual(animation.extras, { slot: 7, loop: true, loopStart: 0.5 });
  assert.deepEqual(animation.channels[0].target, { node: 2, path: "rotation" });
  const output = json.accessors[animation.samplers[0].output];
  assert.equal(output.componentType, 5122);
  assert.equal(output.normalized, true);
});

test("unswizzle reorders 16-byte x 8-row blocks into rows", () => {
  const rowBytes = 32;
  const swizzled = Buffer.alloc(rowBytes * 8);
  // Block 0 holds the left 16 bytes of rows 0-7, block 1 the right 16 bytes.
  for (let i = 0; i < swizzled.length; i++)
    swizzled[i] = i < 128 ? Math.floor(i / 16) : 100 + Math.floor((i - 128) / 16);
  const out = unswizzle(swizzled, rowBytes, 8);
  assert.equal(out[0], 0);
  assert.equal(out[16], 100);
  assert.equal(out[rowBytes * 7 + 31], 107);
});

test("readTmh decodes a 4-bit paletted image", () => {
  const pixels = Buffer.alloc((16 * 8) / 2, 0x10); // every byte: pixel0 = index 0, pixel1 = index 1
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
  const [image] = readTmh(
    Buffer.concat([header, imageHeader, pixelHeader, pixels, paletteHeader, palette]),
  );
  assert.equal(image!.width, 16);
  assert.deepEqual([...image!.rgba.subarray(0, 8)], [255, 0, 0, 255, 0, 0, 255, 128]);
  assert.equal(image!.hasAlpha, true);
});

test("encodePng writes a palette PNG for <= 256 colours that decodes to the same pixels", async () => {
  const width = 8;
  const height = 4;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++)
    rgba.set(
      i % 3 === 0 ? [0, 0, 0, 0] : i % 3 === 1 ? [200, 10, 10, 255] : [10, 200, 10, 128],
      i * 4,
    );
  const png = encodePng(width, height, rgba);
  assert.equal(png.subarray(1, 4).toString("latin1"), "PNG");
  assert.equal(png[25], 3); // IHDR colour type: palette
  const decoded = await sharp(png).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...decoded], [...rgba]);
});

test("encodeTexture is lossless for every visible pixel", async () => {
  const width = 16;
  const height = 16;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++)
    rgba.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256, i % 5 === 0 ? 0 : 255], i * 4);
  const texture = await encodeTexture({ width, height, rgba, hasAlpha: true });
  const decoded = await sharp(texture.data).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] === 0) assert.equal(decoded[i * 4 + 3], 0);
    else
      assert.deepEqual(
        [...decoded.subarray(i * 4, i * 4 + 4)],
        [...rgba.subarray(i * 4, i * 4 + 4)],
      );
  }
});
