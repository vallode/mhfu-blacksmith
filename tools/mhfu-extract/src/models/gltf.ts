/**
 * Build a binary glTF 2.0 (`.glb`) from a decoded PMO mesh and its TMH
 * textures. One glTF primitive per PMO vertex group; textures embedded as PNG.
 * Skinning weights are dropped for now (static bind pose only); mesh pieces
 * are already in model space, so they assemble without the skeleton.
 */
import type { Pmo } from "./pmo.js";
import { encodePng } from "./png.js";
import type { TmhImage } from "./tmh.js";

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

interface Accessor {
  bufferView: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

export interface GlbStats {
  primitives: number;
  vertices: number;
  triangles: number;
}

export function buildGlb(pmo: Pmo, textures: TmhImage[], name: string): { glb: Buffer; stats: GlbStats } {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  const bufferViews: { buffer: 0; byteOffset: number; byteLength: number; target?: number }[] = [];
  const accessors: Accessor[] = [];

  const addView = (data: Buffer, target?: number): number => {
    const padded = data.length % 4 ? Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))]) : data;
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length, ...(target ? { target } : {}) });
    chunks.push(padded);
    byteLength += padded.length;
    return bufferViews.length - 1;
  };
  const addAccessor = (data: Float32Array | Uint16Array | Uint32Array, type: string, componentType: number, target: number, withBounds = false): number => {
    const width = type === "VEC3" ? 3 : type === "VEC2" ? 2 : type === "VEC4" ? 4 : 1;
    const accessor: Accessor = {
      bufferView: addView(Buffer.from(data.buffer, data.byteOffset, data.byteLength), target),
      componentType,
      count: data.length / width,
      type,
    };
    if (withBounds) {
      const min = Array<number>(width).fill(Infinity);
      const max = Array<number>(width).fill(-Infinity);
      for (let i = 0; i < data.length; i++) {
        const k = i % width;
        min[k] = Math.min(min[k]!, data[i]!);
        max[k] = Math.max(max[k]!, data[i]!);
      }
      accessor.min = min;
      accessor.max = max;
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };

  // Textures: one image + texture per TMH entry that a material uses.
  const images: { bufferView: number; mimeType: string }[] = [];
  const gltfTextures: { source: number; sampler: number }[] = [];
  const textureIndexByTmh = new Map<number, number>();
  const textureFor = (tmhIndex: number): number | undefined => {
    const image = textures[tmhIndex];
    if (!image) return undefined;
    let index = textureIndexByTmh.get(tmhIndex);
    if (index === undefined) {
      images.push({ bufferView: addView(encodePng(image.width, image.height, image.rgba)), mimeType: "image/png" });
      gltfTextures.push({ source: images.length - 1, sampler: 0 });
      index = gltfTextures.length - 1;
      textureIndexByTmh.set(tmhIndex, index);
    }
    return index;
  };

  const materials = pmo.materials.map((material, i) => {
    const texture = textureFor(material.textureIndex);
    const alpha = texture !== undefined && textures[material.textureIndex]!.hasAlpha;
    return {
      name: `material${i}`,
      pbrMetallicRoughness: {
        ...(texture !== undefined ? { baseColorTexture: { index: texture } } : {}),
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      ...(alpha ? { alphaMode: "MASK", alphaCutoff: 0.5 } : {}),
      doubleSided: true,
    };
  });

  // PMO meshes are already in model space, so every vertex group sharing a
  // material (and attribute layout) can be merged into one glTF primitive.
  // Large monsters have 100+ groups; merging keeps the JSON and draw calls small.
  interface Group {
    material: number;
    hasNormals: boolean;
    hasUvs: boolean;
    positions: number[];
    normals: number[];
    uvs: number[];
    indices: number[];
  }
  const groups = new Map<string, Group>();
  for (const mesh of pmo.meshes) {
    for (const primitive of mesh.primitives) {
      const { vertices, triangles } = primitive.geometry;
      if (triangles.length === 0) continue;
      const hasNormals = vertices.every((v) => v.normal);
      const hasUvs = vertices.every((v) => v.uv);
      const key = `${primitive.materialIndex}:${hasNormals}:${hasUvs}`;
      let group = groups.get(key);
      if (!group) {
        group = { material: primitive.materialIndex, hasNormals, hasUvs, positions: [], normals: [], uvs: [], indices: [] };
        groups.set(key, group);
      }
      const base = group.positions.length / 3;
      for (const v of vertices) {
        for (let k = 0; k < 3; k++) group.positions.push(v.position[k]! * pmo.scale[k]!);
        if (hasNormals) {
          const [x, y, z] = v.normal!;
          const length = Math.hypot(x, y, z) || 1;
          group.normals.push(x / length, y / length, z / length);
        }
        if (hasUvs) group.uvs.push(v.uv![0] * mesh.uvScale[0], v.uv![1] * mesh.uvScale[1]);
      }
      for (const triangle of triangles) group.indices.push(triangle[0] + base, triangle[1] + base, triangle[2] + base);
    }
  }

  const stats: GlbStats = { primitives: 0, vertices: 0, triangles: 0 };
  const primitives = [...groups.values()].map((group) => {
    const vertexCount = group.positions.length / 3;
    const indices = vertexCount > 0xffff ? new Uint32Array(group.indices) : new Uint16Array(group.indices);
    stats.primitives++;
    stats.vertices += vertexCount;
    stats.triangles += group.indices.length / 3;
    return {
      attributes: {
        POSITION: addAccessor(new Float32Array(group.positions), "VEC3", FLOAT, ARRAY_BUFFER, true),
        ...(group.hasNormals ? { NORMAL: addAccessor(new Float32Array(group.normals), "VEC3", FLOAT, ARRAY_BUFFER) } : {}),
        ...(group.hasUvs ? { TEXCOORD_0: addAccessor(new Float32Array(group.uvs), "VEC2", FLOAT, ARRAY_BUFFER) } : {}),
      },
      indices: addAccessor(indices, "SCALAR", indices instanceof Uint32Array ? UNSIGNED_INT : UNSIGNED_SHORT, ELEMENT_ARRAY_BUFFER),
      material: group.material,
    };
  });

  const json = {
    asset: { version: "2.0", generator: "mhfu-extract" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives }],
    materials,
    ...(images.length ? { images, textures: gltfTextures, samplers: [{ magFilter: 9729, minFilter: 9729, wrapS: 10497, wrapT: 10497 }] } : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
    extras: { source: name },
  };

  let jsonChunk = Buffer.from(JSON.stringify(json), "utf-8");
  if (jsonChunk.length % 4) jsonChunk = Buffer.concat([jsonChunk, Buffer.alloc(4 - (jsonChunk.length % 4), 0x20)]);
  const binChunk = Buffer.concat(chunks);
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
  const glb = Buffer.concat([header, chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk, chunkHeader(binChunk.length, 0x004e4942), binChunk]);
  return { glb, stats };
}
