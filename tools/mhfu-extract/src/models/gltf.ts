/**
 * Build a binary glTF 2.0 (`.glb`) from a decoded PMO mesh and its TMH
 * textures, as small as possible:
 *
 * - Exact source integers instead of floats (KHR_mesh_quantization): the PSP
 *   stores positions as s16 x a per-model scale (-> SHORT normalized, scale
 *   on the node) and UVs as u16/0x8000 x a per-mesh scale (-> UNSIGNED_SHORT
 *   with a KHR_texture_transform scale on the material): both lossless.
 *   Normals (s8) are pre-multiplied by the node scale and re-rounded to s8
 *   (BYTE normalized), within a degree of the source.
 * - One interleaved vertex buffer for the whole model (duplicate vertices
 *   merged) and one index buffer; each primitive (vertex groups sharing a
 *   material and UV scale) is just a range of it. Keeps the JSON tiny.
 * - Triangles reordered for the vertex cache, vertices for fetch order, then
 *   EXT_meshopt_compression on both buffers. Lossless.
 * - Textures as lossless WebP or palette PNG, whichever is smaller (texture.ts).
 *
 * Optional lossy steps (`GlbOptions`): fewer bits for positions and UVs,
 * fewer colours per texture.
 *
 * Skinning weights are dropped (static bind pose only); mesh pieces are
 * already in model space, so they assemble without the skeleton.
 */
import { MeshoptEncoder } from "meshoptimizer";
import type { DecodedVertex } from "./ge.js";
import type { Pmo } from "./pmo.js";
import { encodeTexture, type EncodedTexture } from "./texture.js";
import type { TmhImage } from "./tmh.js";

const BYTE = 5120;
const SHORT = 5122;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const FLOAT = 5126;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

/** UV units per texture repeat in the source data (u16 / 0x8000). */
const UV_ONE = 0x8000;

export interface GlbOptions {
  /** EXT_meshopt_compression on vertex and index data (lossless). Default true. */
  compress?: boolean;
  /**
   * Lossy: bits of position precision kept, of the source's 16 (default 16 =
   * exact). 12 bits moves a vertex by at most 1/4096 of the model's extent.
   */
  positionBits?: number;
  /** Lossy: UV precision in bits per texture repeat, of the source's 15 (default 15 = exact). */
  uvBits?: number;
  /** Allow WebP textures (EXT_texture_webp) where smaller than PNG. Default true. */
  webp?: boolean;
  /** Lossy: re-quantize each texture's palette to this libimagequant quality (0-100). */
  textureQuality?: number;
}

export interface GlbStats {
  primitives: number;
  vertices: number;
  triangles: number;
}

/** True when every vertex has the s16 position / s8 normal / u16 UV layout all MHFU models use. */
function isExactVertex(v: DecodedVertex): boolean {
  return v.sizes.position === 2 && !!v.normal && v.sizes.normal === 1 && !!v.uv && v.sizes.uv === 2;
}

/** Shortest decimal that still reads back as the same float32 (JSON numbers are doubles). */
function f32(value: number): number {
  const target = Math.fround(value);
  for (let digits = 1; digits < 17; digits++) {
    const candidate = Number(value.toPrecision(digits));
    if (Math.fround(candidate) === target) return candidate;
  }
  return value;
}

function roundTo(value: number, step: number, min: number, max: number): number {
  return step <= 1 ? value : Math.min(max, Math.max(min, Math.round(value / step) * step));
}

/** Interleaved vertex layouts: exact integers (16 bytes) or the float fallback (32 bytes). */
const EXACT = { stride: 16, position: 0, normal: 8, uv: 12 } as const;
const FLOATS = { stride: 32, position: 0, normal: 12, uv: 24 } as const;

interface Primitive {
  material: number;
  uvScale: [number, number];
  /** Triangle list, as indices into the model's vertex table. */
  indices: number[];
}

export async function buildGlb(pmo: Pmo, textures: TmhImage[], name: string, options: GlbOptions = {}): Promise<{ glb: Buffer; stats: GlbStats }> {
  const compress = options.compress ?? true;
  const positionStep = 2 ** (16 - (options.positionBits ?? 16));
  const uvStep = 2 ** (15 - (options.uvBits ?? 15));
  if (compress) await MeshoptEncoder.ready;

  const exact = pmo.meshes.every((mesh) => mesh.primitives.every((p) => p.geometry.vertices.every(isExactVertex)));
  const layout = exact ? EXACT : FLOATS;

  // ---- vertex table and primitives ------------------------------------------
  // Vertices are stored as their final record bytes; identical records merge.
  const records: Buffer[] = [];
  const recordIndex = new Map<string, number>();
  const primitives = new Map<string, Primitive>();
  for (const mesh of pmo.meshes) {
    for (const source of mesh.primitives) {
      const { vertices, triangles } = source.geometry;
      if (triangles.length === 0) continue;
      // Primitives are keyed by what their glTF material ends up containing
      // (texture, UV scale), not the PMO material index: PMO materials that
      // differ only in their (unused) colours merge, along with their geometry.
      const texture = pmo.materials[source.materialIndex]!.textureIndex;
      const key = `${texture}:${exact ? mesh.uvScale.join(",") : ""}`;
      let primitive = primitives.get(key);
      if (!primitive) {
        primitive = { material: source.materialIndex, uvScale: mesh.uvScale, indices: [] };
        primitives.set(key, primitive);
      }
      const remap = vertices.map((v) => {
        const record = Buffer.alloc(layout.stride);
        if (exact) {
          v.position.forEach((c, k) => record.writeInt16LE(roundTo(Math.round(c * 0x7fff), positionStep, -0x7fff, 0x7fff), EXACT.position + k * 2));
          // The model's scale sits on the node, and renderers transform
          // normals by its inverse-transpose (1/scale per axis). The source
          // normals are in scaled model space, so pre-multiply by the scale
          // to cancel that out. Re-rounding to s8 costs well under a degree.
          const n = v.normal!.map((c, k) => c * pmo.scale[k]!);
          const length = Math.hypot(...n) || 1;
          n.forEach((c, k) => record.writeInt8(Math.round((c / length) * 0x7f), EXACT.normal + k));
          v.uv!.forEach((c, k) => record.writeUInt16LE(roundTo(Math.round(c * UV_ONE), uvStep, 0, 0xffff), EXACT.uv + k * 2));
        } else {
          v.position.forEach((c, k) => record.writeFloatLE(c, FLOATS.position + k * 4));
          const [x, y, z] = v.normal ?? [0, 1, 0];
          const length = Math.hypot(x, y, z) || 1;
          [x, y, z].forEach((c, k) => record.writeFloatLE(c / length, FLOATS.normal + k * 4));
          const [u, w] = v.uv ?? [0, 0];
          record.writeFloatLE(u * mesh.uvScale[0], FLOATS.uv);
          record.writeFloatLE(w * mesh.uvScale[1], FLOATS.uv + 4);
        }
        const id = record.toString("latin1");
        let index = recordIndex.get(id);
        if (index === undefined) {
          index = records.length;
          records.push(record);
          recordIndex.set(id, index);
        }
        return index;
      });
      for (const [a, b, c] of triangles) primitive.indices.push(remap[a]!, remap[b]!, remap[c]!);
    }
  }

  // ---- triangle and vertex order ----------------------------------------------
  // Per primitive, reorder triangles for the vertex cache (meshopt); then lay
  // the vertex table out in first-use order across all primitives, which is
  // what meshopt's vertex codec compresses best.
  const ordered = [...primitives.values()];
  if (compress) {
    for (const primitive of ordered) {
      const local = new Map<number, number>();
      const globals: number[] = [];
      const localIndices = Uint32Array.from(primitive.indices, (g) => {
        let l = local.get(g);
        if (l === undefined) {
          l = globals.length;
          globals.push(g);
          local.set(g, l);
        }
        return l;
      });
      const [remap] = MeshoptEncoder.reorderMesh(localIndices, true, true);
      // localIndices now refers to the reordered local vertices; map back.
      const back = new Array<number>(globals.length);
      remap.forEach((to, from) => {
        if (to !== 0xffffffff) back[to] = globals[from]!;
      });
      primitive.indices = Array.from(localIndices, (l) => back[l]!);
    }
  }
  const newIndex = new Map<number, number>();
  for (const primitive of ordered) {
    for (const g of primitive.indices) if (!newIndex.has(g)) newIndex.set(g, newIndex.size);
  }
  const vertexCount = newIndex.size;
  const vertexData = Buffer.alloc(vertexCount * layout.stride);
  for (const [old, index] of newIndex) records[old]!.copy(vertexData, index * layout.stride);

  // Index buffer: every primitive's triangles back to back.
  const wide = vertexCount > 0xffff;
  const indexSize = wide ? 4 : 2;
  const allIndices = ordered.flatMap((p) => p.indices.map((g) => newIndex.get(g)!));
  const indexData = wide ? new Uint32Array(allIndices) : new Uint16Array(allIndices);

  // ---- binary layout ------------------------------------------------------------
  // Without compression everything lives in buffer 0 (the GLB BIN chunk). With
  // EXT_meshopt_compression, buffer 0 holds the compressed streams and the
  // images, and buffer 1 is the extension's data-less fallback buffer the
  // decoded streams are addressed in.
  const bin: Buffer[] = [];
  let binLength = 0;
  let fallbackLength = 0;
  const bufferViews: object[] = [];
  const pushBin = (data: Uint8Array): number => {
    const offset = binLength;
    const padded = data.length % 4 ? Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))]) : Buffer.from(data);
    bin.push(padded);
    binLength += padded.length;
    return offset;
  };
  const addStream = (data: Uint8Array, count: number, stride: number, target: number): number => {
    const isIndex = target === ELEMENT_ARRAY_BUFFER;
    const strideField = isIndex ? {} : { byteStride: stride };
    if (!compress) {
      bufferViews.push({ buffer: 0, byteOffset: pushBin(data), byteLength: data.length, ...strideField });
    } else {
      const mode = isIndex ? "TRIANGLES" : "ATTRIBUTES";
      const encoded = MeshoptEncoder.encodeGltfBuffer(data, count, stride, mode);
      const meshopt = { buffer: 0, byteOffset: pushBin(encoded), byteLength: encoded.length, byteStride: stride, count, mode };
      bufferViews.push({ buffer: 1, byteOffset: fallbackLength, byteLength: data.length, ...strideField, extensions: { EXT_meshopt_compression: meshopt } });
      fallbackLength += Math.ceil(data.length / 4) * 4;
    }
    return bufferViews.length - 1;
  };

  const vertexView = addStream(new Uint8Array(vertexData.buffer, vertexData.byteOffset, vertexData.byteLength), vertexCount, layout.stride, ARRAY_BUFFER);
  const indexView = addStream(new Uint8Array(indexData.buffer, indexData.byteOffset, indexData.byteLength), indexData.length, indexSize, ELEMENT_ARRAY_BUFFER);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertexCount; i++) {
    for (let k = 0; k < 3; k++) {
      const at = i * layout.stride + layout.position;
      const value = exact ? vertexData.readInt16LE(at + k * 2) : vertexData.readFloatLE(at + k * 4);
      min[k] = Math.min(min[k]!, value);
      max[k] = Math.max(max[k]!, value);
    }
  }
  const accessors: object[] = exact
    ? [
        // Bounds of normalized accessors are in the stored (integer) units.
        { bufferView: vertexView, componentType: SHORT, normalized: true, count: vertexCount, type: "VEC3", min, max },
        { bufferView: vertexView, byteOffset: EXACT.normal, componentType: BYTE, normalized: true, count: vertexCount, type: "VEC3" },
        { bufferView: vertexView, byteOffset: EXACT.uv, componentType: UNSIGNED_SHORT, count: vertexCount, type: "VEC2" },
      ]
    : [
        { bufferView: vertexView, componentType: FLOAT, count: vertexCount, type: "VEC3", min, max },
        { bufferView: vertexView, byteOffset: FLOATS.normal, componentType: FLOAT, count: vertexCount, type: "VEC3" },
        { bufferView: vertexView, byteOffset: FLOATS.uv, componentType: FLOAT, count: vertexCount, type: "VEC2" },
      ];

  // ---- textures and materials -------------------------------------------------
  // Encode every texture the primitives use (async), in first-use order.
  const encoded = new Map<number, EncodedTexture>();
  for (const primitive of ordered) {
    const tmhIndex = pmo.materials[primitive.material]!.textureIndex;
    const image = textures[tmhIndex];
    if (image && !encoded.has(tmhIndex)) encoded.set(tmhIndex, await encodeTexture(image, { webp: options.webp, quality: options.textureQuality }));
  }
  let usesWebp = false;
  const images: object[] = [];
  const gltfTextures: object[] = [];
  const textureByTmh = new Map<number, number>();
  const textureFor = (tmhIndex: number): number | undefined => {
    const texture = encoded.get(tmhIndex);
    if (!texture) return undefined;
    let index = textureByTmh.get(tmhIndex);
    if (index === undefined) {
      bufferViews.push({ buffer: 0, byteOffset: pushBin(texture.data), byteLength: texture.data.length });
      images.push({ bufferView: bufferViews.length - 1, mimeType: texture.mimeType });
      const source = images.length - 1;
      if (texture.mimeType === "image/webp") usesWebp = true;
      gltfTextures.push(texture.mimeType === "image/webp" ? { extensions: { EXT_texture_webp: { source } } } : { source });
      index = gltfTextures.length - 1;
      textureByTmh.set(tmhIndex, index);
    }
    return index;
  };

  let usesTextureTransform = false;
  const materials: object[] = [];
  const materialIndex = new Map<string, number>();
  const materialFor = (primitive: Primitive): number => {
    const source = pmo.materials[primitive.material]!;
    const key = `${source.textureIndex}:${exact ? primitive.uvScale.join(",") : ""}`;
    let index = materialIndex.get(key);
    if (index !== undefined) return index;
    const texture = textureFor(source.textureIndex);
    const textureInfo: Record<string, unknown> | undefined = texture === undefined ? undefined : { index: texture };
    if (textureInfo && exact) {
      usesTextureTransform = true;
      textureInfo.extensions = { KHR_texture_transform: { scale: [f32(primitive.uvScale[0] / UV_ONE), f32(primitive.uvScale[1] / UV_ONE)] } };
    }
    const alpha = texture !== undefined && textures[source.textureIndex]!.hasAlpha;
    materials.push({
      pbrMetallicRoughness: { ...(textureInfo ? { baseColorTexture: textureInfo } : {}), metallicFactor: 0, roughnessFactor: 1 },
      ...(alpha ? { alphaMode: "MASK", alphaCutoff: 0.5 } : {}),
      doubleSided: true,
    });
    index = materials.length - 1;
    materialIndex.set(key, index);
    return index;
  };

  let firstIndex = 0;
  const gltfPrimitives = ordered.map((primitive) => {
    accessors.push({ bufferView: indexView, ...(firstIndex ? { byteOffset: firstIndex * indexSize } : {}), componentType: wide ? UNSIGNED_INT : UNSIGNED_SHORT, count: primitive.indices.length, type: "SCALAR" });
    firstIndex += primitive.indices.length;
    return { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: accessors.length - 1, material: materialFor(primitive) };
  });

  const extensions = [
    ...(exact ? ["KHR_mesh_quantization"] : []),
    ...(usesTextureTransform ? ["KHR_texture_transform"] : []),
    ...(compress ? ["EXT_meshopt_compression"] : []),
    ...(usesWebp ? ["EXT_texture_webp"] : []),
  ];
  const json = {
    asset: { version: "2.0" },
    ...(extensions.length ? { extensionsUsed: extensions, extensionsRequired: extensions } : {}),
    scene: 0,
    scenes: [{ nodes: [0] }],
    // Positions are in source units (normalized s16); the model's scale goes on the node.
    nodes: [{ mesh: 0, scale: pmo.scale.map(f32) }],
    meshes: [{ primitives: gltfPrimitives }],
    materials,
    ...(images.length ? { images, textures: gltfTextures } : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }, ...(compress ? [{ byteLength: fallbackLength, extensions: { EXT_meshopt_compression: { fallback: true } } }] : [])],
  };

  const stats: GlbStats = { primitives: gltfPrimitives.length, vertices: vertexCount, triangles: allIndices.length / 3 };
  let jsonChunk = Buffer.from(JSON.stringify(json), "utf-8");
  if (jsonChunk.length % 4) jsonChunk = Buffer.concat([jsonChunk, Buffer.alloc(4 - (jsonChunk.length % 4), 0x20)]);
  const binChunk = Buffer.concat(bin);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "latin1");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHeader = (length: number, type: number) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(length, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  return { glb: Buffer.concat([header, chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk, chunkHeader(binChunk.length, 0x004e4942), binChunk]), stats };
}
