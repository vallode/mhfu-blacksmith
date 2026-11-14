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
 * Without a rig the model is the static bind pose: mesh pieces are already in
 * model space, so they assemble without the skeleton, apart from severable
 * tail tips, which attach.ts puts in place before this runs. With one
 * (`Rig`), the mesh is skinned to the skeleton (four weights a vertex, the
 * model's scale moved into the inverse bind matrices) and can carry
 * animation clips (animation.ts). Bones are nodes named `bone_<id>`, so a
 * viewer can bind clips from elsewhere to them (the site's motion files,
 * motion-pack.ts, named by `Rig.motionsFile`).
 */
import { MeshoptEncoder } from "meshoptimizer";
import type { Bone } from "./ahi.js";
import {
  bindMatrices,
  eulerToQuat,
  invertAffine,
  multiplyMatrices,
  type Clip,
} from "./animation.js";
import type { DecodedVertex } from "./ge.js";
import type { Pmo } from "./pmo.js";
import { encodeTexture, type EncodedTexture } from "./texture.js";
import type { TmhImage } from "./tmh.js";

const BYTE = 5120;
const UNSIGNED_BYTE = 5121;
const SHORT = 5122;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const FLOAT = 5126;

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
  /**
   * Which piece of a model a primitive belongs to (see `GlbPartOf`). More than
   * one piece, unskinned: each gets its own mesh and node, `part_0`, `part_1`,
   * ..., in the model's space, so a viewer can move them apart. Skinned, the
   * model stays one mesh on its skin and each primitive names its piece in
   * `extras.part` (three.js: the geometry's `userData.part`).
   */
  partOf?: GlbPartOf;
  /**
   * Morph targets: the same model in other shapes, vertex for vertex and at
   * the same `scale` (weapon-pose.ts's sheathed pose). Each is written as
   * float position and normal offsets and named in every mesh's
   * `extras.targetNames`, at weight 0. Unskinned models only.
   */
  targets?: GlbTarget[];
}

/** A morph target: the model's `pmo` in another shape. */
export interface GlbTarget {
  name: string;
  pmo: Pmo;
}

/** The piece (0, 1, ...) a primitive of the model belongs to, by mesh and primitive index. */
export type GlbPartOf = (mesh: number, primitive: number) => number;

/** A skeleton to skin the mesh to, and optionally its animation clips. */
export interface Rig {
  bones: Bone[];
  clips?: Clip[];
  /** Where the model's motions are kept apart, relative to it: `asset.extras.motions`. */
  motionsFile?: string;
}

export interface GlbStats {
  primitives: number;
  vertices: number;
  triangles: number;
  /** Animation clips written. */
  clips: number;
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

interface Layout {
  stride: number;
  position: number;
  normal: number;
  uv: number;
  /** u8 x4 bone indices and u8 x4 normalized weights, when skinned. */
  joints?: number;
  weights?: number;
}

/** Interleaved vertex layouts: exact integers (16 bytes) or the float fallback (32 bytes), plus 8 when skinned. */
const EXACT: Layout = { stride: 16, position: 0, normal: 8, uv: 12 };
const FLOATS: Layout = { stride: 32, position: 0, normal: 12, uv: 24 };
const skinnedLayout = (base: Layout): Layout => ({
  ...base,
  stride: base.stride + 8,
  joints: base.stride,
  weights: base.stride + 4,
});

/**
 * A vertex's four strongest bones (by skeleton index) and their weights as
 * bytes summing to 255. A vertex without weights follows bone 0, the root.
 */
function skinWeights(v: DecodedVertex, palette: number[]): { joints: number[]; weights: number[] } {
  const byBone = new Map<number, number>();
  v.weights?.forEach((weight, slot) => {
    const bone = palette[slot] ?? -1;
    if (bone >= 0 && weight > 0) byBone.set(bone, (byBone.get(bone) ?? 0) + weight);
  });
  const top = [...byBone].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (top.length === 0) top.push([0, 1]);
  const total = top.reduce((sum, [, w]) => sum + w, 0);
  // Largest remainder, so the bytes sum to exactly 255.
  const exact = top.map(([, w]) => (w / total) * 255);
  const bytes = exact.map(Math.floor);
  let left = 255 - bytes.reduce((a, b) => a + b, 0);
  for (const i of exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]))
    if (left-- > 0) bytes[i[1]]!++;
  const joints = top.map(([bone]) => bone);
  while (joints.length < 4) {
    joints.push(0);
    bytes.push(0);
  }
  return { joints, weights: bytes };
}

/**
 * The GLB's binary chunk and buffer views. Without compression everything
 * lives in buffer 0 (the GLB BIN chunk). With EXT_meshopt_compression,
 * buffer 0 holds the compressed streams and the raw data (images, inverse
 * bind matrices), and buffer 1 is the extension's data-less fallback buffer
 * the decoded streams are addressed in.
 */
class GlbWriter {
  readonly bufferViews: object[] = [];
  private readonly bin: Buffer[] = [];
  private binLength = 0;
  private fallbackLength = 0;

  constructor(readonly compress: boolean) {}

  private pushBin(data: Uint8Array): number {
    const offset = this.binLength;
    const padded =
      data.length % 4
        ? Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))])
        : Buffer.from(data);
    this.bin.push(padded);
    this.binLength += padded.length;
    return offset;
  }

  /** Uncompressed data in buffer 0 (images, matrices); returns its buffer view. */
  addRaw(data: Uint8Array): number {
    this.bufferViews.push({ buffer: 0, byteOffset: this.pushBin(data), byteLength: data.length });
    return this.bufferViews.length - 1;
  }

  /**
   * `count` elements of `stride` bytes: vertex attributes (with a byteStride),
   * triangle indices, or animation data (neither); returns its buffer view.
   */
  addStream(
    data: Uint8Array,
    count: number,
    stride: number,
    kind: "vertex" | "index" | "animation",
  ): number {
    const strideField = kind === "vertex" ? { byteStride: stride } : {};
    if (!this.compress) {
      this.bufferViews.push({
        buffer: 0,
        byteOffset: this.pushBin(data),
        byteLength: data.length,
        ...strideField,
      });
    } else {
      const mode = kind === "index" ? "TRIANGLES" : "ATTRIBUTES";
      const encoded = MeshoptEncoder.encodeGltfBuffer(data, count, stride, mode);
      const meshopt = {
        buffer: 0,
        byteOffset: this.pushBin(encoded),
        byteLength: encoded.length,
        byteStride: stride,
        count,
        mode,
      };
      this.bufferViews.push({
        buffer: 1,
        byteOffset: this.fallbackLength,
        byteLength: data.length,
        ...strideField,
        extensions: { EXT_meshopt_compression: meshopt },
      });
      this.fallbackLength += Math.ceil(data.length / 4) * 4;
    }
    return this.bufferViews.length - 1;
  }

  buffers(): object[] {
    return [
      { byteLength: this.binLength },
      ...(this.compress
        ? [
            {
              byteLength: this.fallbackLength,
              extensions: { EXT_meshopt_compression: { fallback: true } },
            },
          ]
        : []),
    ];
  }

  toGlb(json: object): Buffer {
    let jsonChunk = Buffer.from(JSON.stringify(json), "utf-8");
    if (jsonChunk.length % 4)
      jsonChunk = Buffer.concat([jsonChunk, Buffer.alloc(4 - (jsonChunk.length % 4), 0x20)]);
    const binChunk = Buffer.concat(this.bin);
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
    return Buffer.concat([
      header,
      chunkHeader(jsonChunk.length, 0x4e4f534a),
      jsonChunk,
      chunkHeader(binChunk.length, 0x004e4942),
      binChunk,
    ]);
  }
}

const near = (a: readonly number[], b: readonly number[]) =>
  a.every((c, k) => Math.abs(c - b[k]!) < 1e-6);

/** A node per bone, named `bone_<id>`, from `first` on; plus the roots, in bone order. */
function skeletonNodes(
  bones: readonly Bone[],
  first: number,
): { nodes: object[]; roots: number[] } {
  const children = bones.map(() => [] as number[]);
  for (const bone of bones) if (bone.parent >= 0) children[bone.parent]!.push(first + bone.id);
  const nodes = bones.map((bone) => {
    const rotation = eulerToQuat(bone.rotation);
    return {
      name: `bone_${bone.id}`,
      ...(children[bone.id]!.length ? { children: children[bone.id] } : {}),
      ...(near(bone.translation, [0, 0, 0]) ? {} : { translation: bone.translation.map(f32) }),
      ...(near(rotation, [0, 0, 0, 1]) ? {} : { rotation: rotation.map(f32) }),
      ...(near(bone.scale, [1, 1, 1]) ? {} : { scale: bone.scale.map(f32) }),
    };
  });
  const roots = bones.filter((b) => b.parent < 0).map((b) => first + b.id);
  return { nodes, roots };
}

/**
 * The clips as glTF animations on the bone nodes (`first` + bone id), their
 * data in three streams: key times (shared between tracks with the same
 * times), rotations as normalized s16 quaternions, and float vectors.
 */
function writeAnimations(
  writer: GlbWriter,
  accessors: object[],
  clips: readonly Clip[],
  first: number,
): object[] {
  const times: number[] = [];
  const timeAccessor = new Map<string, number>();
  const rotations: number[] = [];
  const vectors: number[] = [];
  // Accessors are filled in once the streams' buffer views exist.
  const pending: { accessor: object; stream: "times" | "rotations" | "vectors" }[] = [];
  const add = (stream: "times" | "rotations" | "vectors", accessor: object) => {
    accessors.push(accessor);
    pending.push({ accessor, stream });
    return accessors.length - 1;
  };

  const animations = clips.map((clip) => {
    const samplers: object[] = [];
    const channels: object[] = [];
    for (const track of clip.tracks) {
      const key = track.times.join(",");
      let input = timeAccessor.get(key);
      if (input === undefined) {
        input = add("times", {
          byteOffset: times.length * 4,
          componentType: FLOAT,
          count: track.times.length,
          type: "SCALAR",
          min: [f32(track.times[0]!)],
          max: [f32(track.times.at(-1)!)],
        });
        times.push(...track.times);
        timeAccessor.set(key, input);
      }
      const output =
        track.path === "rotation"
          ? add("rotations", {
              byteOffset: rotations.length * 2,
              componentType: SHORT,
              normalized: true,
              count: track.times.length,
              type: "VEC4",
            })
          : add("vectors", {
              byteOffset: vectors.length * 4,
              componentType: FLOAT,
              count: track.times.length,
              type: "VEC3",
            });
      if (track.path === "rotation")
        rotations.push(
          ...track.values.map((c) => Math.round(Math.max(-1, Math.min(1, c)) * 0x7fff)),
        );
      else vectors.push(...track.values);
      samplers.push({ input, output });
      channels.push({
        sampler: samplers.length - 1,
        target: { node: first + track.bone, path: track.path },
      });
    }
    return {
      name: `motion ${clip.slot}`,
      samplers,
      channels,
      extras: { slot: clip.slot, loop: clip.loop, loopStart: f32(clip.loopStart) },
    };
  });

  const views = {
    times: times.length
      ? writer.addStream(
          new Uint8Array(Float32Array.from(times).buffer),
          times.length,
          4,
          "animation",
        )
      : -1,
    rotations: rotations.length
      ? writer.addStream(
          new Uint8Array(Int16Array.from(rotations).buffer),
          rotations.length / 4,
          8,
          "animation",
        )
      : -1,
    vectors: vectors.length
      ? writer.addStream(
          new Uint8Array(Float32Array.from(vectors).buffer),
          vectors.length / 3,
          12,
          "animation",
        )
      : -1,
  };
  for (const { accessor, stream } of pending)
    Object.assign(accessor, { bufferView: views[stream] });
  return animations;
}

interface Primitive {
  part: number;
  material: number;
  uvScale: [number, number];
  /** Triangle list, as indices into the model's vertex table. */
  indices: number[];
}

export async function buildGlb(
  pmo: Pmo,
  textures: TmhImage[],
  name: string,
  options: GlbOptions = {},
  rig?: Rig,
): Promise<{ glb: Buffer; stats: GlbStats }> {
  const compress = options.compress ?? true;
  const positionStep = 2 ** (16 - (options.positionBits ?? 16));
  const uvStep = 2 ** (15 - (options.uvBits ?? 15));
  if (compress) await MeshoptEncoder.ready;

  const exact = pmo.meshes.every((mesh) =>
    mesh.primitives.every((p) => p.geometry.vertices.every(isExactVertex)),
  );
  const skinned = !!rig?.bones.length;
  const layout = skinned ? skinnedLayout(exact ? EXACT : FLOATS) : exact ? EXACT : FLOATS;
  const targets = options.targets ?? [];
  if (targets.length && skinned) throw new Error("morph targets on a skinned model");
  for (const target of targets)
    if (target.pmo.scale.some((s, k) => s !== pmo.scale[k]))
      throw new Error(`morph target ${target.name} has another scale`);

  /** A vertex's position as the GLB stores it, in node units. */
  const storedPosition = (v: DecodedVertex): number[] =>
    exact
      ? v.position.map(
          (c) => roundTo(Math.round(c * 0x7fff), positionStep, -0x7fff, 0x7fff) / 0x7fff,
        )
      : v.position;
  /**
   * A vertex's normal as the GLB stores it, unit length. Unskinned, the
   * model's scale sits on the node, and renderers transform normals by its
   * inverse-transpose (1/scale per axis). The source normals are in scaled
   * model space, so pre-multiply by the scale to cancel that out. Skinned,
   * the scale is in the inverse bind matrices, and three.js transforms
   * normals by the skinning matrix itself (scale per axis): divide instead.
   * Either layout, since positions are in the same scaled space in both.
   * Exact, it's re-rounded to s8, which costs well under a degree.
   */
  const storedNormal = (v: DecodedVertex): number[] => {
    const source = exact ? v.normal! : (v.normal ?? [0, 1, 0]);
    const n = source.map((c, k) => (skinned ? c / pmo.scale[k]! : c * pmo.scale[k]!));
    const length = Math.hypot(...n) || 1;
    return n.map((c) => (exact ? Math.round((c / length) * 0x7f) / 0x7f : c / length));
  };

  // ---- vertex table and primitives ------------------------------------------
  // Vertices are stored as their final record bytes; identical records merge.
  // A morph target's offsets go in a record of their own (floats: position
  // then normal, per target), part of what makes two vertices the same.
  const records: Buffer[] = [];
  const targetStride = targets.length * 24;
  const targetRecords: Buffer[] = [];
  const recordIndex = new Map<string, number>();
  const primitives = new Map<string, Primitive>();
  for (const [meshIndex, mesh] of pmo.meshes.entries()) {
    for (const [primitiveIndex, source] of mesh.primitives.entries()) {
      const { vertices, triangles } = source.geometry;
      if (triangles.length === 0) continue;
      const part = options.partOf?.(meshIndex, primitiveIndex) ?? 0;
      // Primitives are keyed by what their glTF material ends up containing
      // (texture, UV scale), not the PMO material index: PMO materials that
      // differ only in their (unused) colours merge, along with their geometry.
      const texture = pmo.materials[source.materialIndex]!.textureIndex;
      const key = `${part}:${texture}:${exact ? mesh.uvScale.join(",") : ""}`;
      let primitive = primitives.get(key);
      if (!primitive) {
        primitive = { part, material: source.materialIndex, uvScale: mesh.uvScale, indices: [] };
        primitives.set(key, primitive);
      }
      const remap = vertices.map((v, j) => {
        const record = Buffer.alloc(layout.stride);
        const position = storedPosition(v);
        const normal = storedNormal(v);
        if (exact) {
          position.forEach((c, k) =>
            record.writeInt16LE(Math.round(c * 0x7fff), EXACT.position + k * 2),
          );
          normal.forEach((c, k) => record.writeInt8(Math.round(c * 0x7f), EXACT.normal + k));
          v.uv!.forEach((c, k) =>
            record.writeUInt16LE(
              roundTo(Math.round(c * UV_ONE), uvStep, 0, 0xffff),
              EXACT.uv + k * 2,
            ),
          );
        } else {
          position.forEach((c, k) => record.writeFloatLE(c, FLOATS.position + k * 4));
          normal.forEach((c, k) => record.writeFloatLE(c, FLOATS.normal + k * 4));
          const [u, w] = v.uv ?? [0, 0];
          record.writeFloatLE(u * mesh.uvScale[0], FLOATS.uv);
          record.writeFloatLE(w * mesh.uvScale[1], FLOATS.uv + 4);
        }
        if (layout.joints !== undefined && layout.weights !== undefined) {
          const { joints, weights } = skinWeights(v, source.bones);
          joints.forEach((j, k) => record.writeUInt8(j, layout.joints! + k));
          weights.forEach((w, k) => record.writeUInt8(w, layout.weights! + k));
        }
        const offsets = Buffer.alloc(targetStride);
        targets.forEach((target, t) => {
          const shape =
            target.pmo.meshes[meshIndex]!.primitives[primitiveIndex]!.geometry.vertices[j]!;
          const moved = [...storedPosition(shape), ...storedNormal(shape)];
          [...position, ...normal].forEach((c, k) =>
            offsets.writeFloatLE(moved[k]! - c, t * 24 + k * 4),
          );
        });
        const id = record.toString("latin1") + offsets.toString("latin1");
        let index = recordIndex.get(id);
        if (index === undefined) {
          index = records.length;
          records.push(record);
          targetRecords.push(offsets);
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
  const targetData = Buffer.alloc(vertexCount * targetStride);
  if (targetStride)
    for (const [old, index] of newIndex) targetRecords[old]!.copy(targetData, index * targetStride);

  // Index buffer: every primitive's triangles back to back.
  const wide = vertexCount > 0xffff;
  const indexSize = wide ? 4 : 2;
  const allIndices = ordered.flatMap((p) => p.indices.map((g) => newIndex.get(g)!));
  const indexData = wide ? new Uint32Array(allIndices) : new Uint16Array(allIndices);

  // ---- binary layout ------------------------------------------------------------
  const writer = new GlbWriter(compress);
  const { bufferViews } = writer;

  const vertexView = writer.addStream(
    new Uint8Array(vertexData.buffer, vertexData.byteOffset, vertexData.byteLength),
    vertexCount,
    layout.stride,
    "vertex",
  );
  const indexView = writer.addStream(
    new Uint8Array(indexData.buffer, indexData.byteOffset, indexData.byteLength),
    indexData.length,
    indexSize,
    "index",
  );

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
        {
          bufferView: vertexView,
          componentType: SHORT,
          normalized: true,
          count: vertexCount,
          type: "VEC3",
          min,
          max,
        },
        {
          bufferView: vertexView,
          byteOffset: EXACT.normal,
          componentType: BYTE,
          normalized: true,
          count: vertexCount,
          type: "VEC3",
        },
        {
          bufferView: vertexView,
          byteOffset: EXACT.uv,
          componentType: UNSIGNED_SHORT,
          count: vertexCount,
          type: "VEC2",
        },
      ]
    : [
        {
          bufferView: vertexView,
          componentType: FLOAT,
          count: vertexCount,
          type: "VEC3",
          min,
          max,
        },
        {
          bufferView: vertexView,
          byteOffset: FLOATS.normal,
          componentType: FLOAT,
          count: vertexCount,
          type: "VEC3",
        },
        {
          bufferView: vertexView,
          byteOffset: FLOATS.uv,
          componentType: FLOAT,
          count: vertexCount,
          type: "VEC2",
        },
      ];
  if (skinned)
    accessors.push(
      {
        bufferView: vertexView,
        byteOffset: layout.joints,
        componentType: UNSIGNED_BYTE,
        count: vertexCount,
        type: "VEC4",
      },
      {
        bufferView: vertexView,
        byteOffset: layout.weights,
        componentType: UNSIGNED_BYTE,
        normalized: true,
        count: vertexCount,
        type: "VEC4",
      },
    );

  // Morph targets: float offsets in their own stream, POSITION then NORMAL.
  const targetAccessors: { POSITION: number; NORMAL: number }[] = [];
  if (targetStride) {
    const targetView = writer.addStream(
      new Uint8Array(targetData.buffer, targetData.byteOffset, targetData.byteLength),
      vertexCount,
      targetStride,
      "vertex",
    );
    targets.forEach((_, t) => {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < vertexCount; i++)
        for (let k = 0; k < 3; k++) {
          const value = targetData.readFloatLE(i * targetStride + t * 24 + k * 4);
          min[k] = Math.min(min[k]!, value);
          max[k] = Math.max(max[k]!, value);
        }
      const offset = (bytes: number) => (bytes ? { byteOffset: bytes } : {});
      accessors.push(
        {
          bufferView: targetView,
          ...offset(t * 24),
          componentType: FLOAT,
          count: vertexCount,
          type: "VEC3",
          min,
          max,
        },
        {
          bufferView: targetView,
          byteOffset: t * 24 + 12,
          componentType: FLOAT,
          count: vertexCount,
          type: "VEC3",
        },
      );
      targetAccessors.push({ POSITION: accessors.length - 2, NORMAL: accessors.length - 1 });
    });
  }

  // ---- textures and materials -------------------------------------------------
  // Encode every texture the primitives use (async), in first-use order.
  const encoded = new Map<number, EncodedTexture>();
  for (const primitive of ordered) {
    const tmhIndex = pmo.materials[primitive.material]!.textureIndex;
    const image = textures[tmhIndex];
    if (image && !encoded.has(tmhIndex))
      encoded.set(
        tmhIndex,
        await encodeTexture(image, { webp: options.webp, quality: options.textureQuality }),
      );
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
      images.push({ bufferView: writer.addRaw(texture.data), mimeType: texture.mimeType });
      const source = images.length - 1;
      if (texture.mimeType === "image/webp") usesWebp = true;
      gltfTextures.push(
        texture.mimeType === "image/webp"
          ? { extensions: { EXT_texture_webp: { source } } }
          : { source },
      );
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
    const textureInfo: Record<string, unknown> | undefined =
      texture === undefined ? undefined : { index: texture };
    if (textureInfo && exact) {
      usesTextureTransform = true;
      textureInfo.extensions = {
        KHR_texture_transform: {
          scale: [f32(primitive.uvScale[0] / UV_ONE), f32(primitive.uvScale[1] / UV_ONE)],
        },
      };
    }
    const alpha = texture !== undefined && textures[source.textureIndex]!.hasAlpha;
    materials.push({
      pbrMetallicRoughness: {
        ...(textureInfo ? { baseColorTexture: textureInfo } : {}),
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      ...(alpha ? { alphaMode: "MASK", alphaCutoff: 0.5 } : {}),
      doubleSided: true,
    });
    index = materials.length - 1;
    materialIndex.set(key, index);
    return index;
  };

  let firstIndex = 0;
  const gltfPrimitives = ordered.map((primitive) => {
    accessors.push({
      bufferView: indexView,
      ...(firstIndex ? { byteOffset: firstIndex * indexSize } : {}),
      componentType: wide ? UNSIGNED_INT : UNSIGNED_SHORT,
      count: primitive.indices.length,
      type: "SCALAR",
    });
    firstIndex += primitive.indices.length;
    return {
      part: primitive.part,
      attributes: {
        POSITION: 0,
        NORMAL: 1,
        TEXCOORD_0: 2,
        ...(skinned ? { JOINTS_0: 3, WEIGHTS_0: 4 } : {}),
      },
      ...(targetAccessors.length ? { targets: targetAccessors } : {}),
      indices: accessors.length - 1,
      material: materialFor(primitive),
    };
  });

  // ---- skeleton and animations -------------------------------------------------
  // Skinned, the mesh node has no transform (glTF ignores it); the model's
  // scale goes into each joint's inverse bind matrix instead.
  let skeleton: { nodes: object[]; roots: number[] } = { nodes: [], roots: [] };
  let skins: object[] = [];
  let animations: object[] = [];
  if (skinned) {
    const bones = rig!.bones;
    skeleton = skeletonNodes(bones, 1);
    const scale = [pmo.scale[0], 0, 0, 0, 0, pmo.scale[1], 0, 0, 0, 0, pmo.scale[2], 0, 0, 0, 0, 1];
    const matrices = bindMatrices(bones).map((m) => multiplyMatrices(invertAffine(m), scale));
    const data = Float32Array.from(matrices.flat());
    accessors.push({
      bufferView: writer.addRaw(new Uint8Array(data.buffer)),
      componentType: FLOAT,
      count: bones.length,
      type: "MAT4",
    });
    skins = [{ joints: bones.map((b) => 1 + b.id), inverseBindMatrices: accessors.length - 1 }];
    animations = writeAnimations(writer, accessors, rig!.clips ?? [], 1);
  }

  const extensions = [
    ...(exact ? ["KHR_mesh_quantization"] : []),
    ...(usesTextureTransform ? ["KHR_texture_transform"] : []),
    ...(compress ? ["EXT_meshopt_compression"] : []),
    ...(usesWebp ? ["EXT_texture_webp"] : []),
  ];
  // One mesh per piece, unless the model is whole (the usual case). A
  // skinned model's pieces share its skin, so they stay one mesh, each
  // primitive naming its piece.
  const parts = [...new Set(gltfPrimitives.map((primitive) => primitive.part))].sort(
    (a, b) => a - b,
  );
  const meshPrimitives = (part: number) =>
    gltfPrimitives.filter((p) => p.part === part).map(({ part: _, ...primitive }) => primitive);
  const whole = parts.length <= 1 || skinned;
  const tagged = parts.length > 1 && skinned;
  // A mesh's morph targets, named (three.js reads `extras.targetNames`) and off.
  const morph = targets.length
    ? { weights: targets.map(() => 0), extras: { targetNames: targets.map((t) => t.name) } }
    : {};
  const meshes = whole
    ? [
        {
          primitives: gltfPrimitives.map(({ part, ...primitive }) =>
            tagged ? { ...primitive, extras: { part } } : primitive,
          ),
          ...morph,
        },
      ]
    : parts.map((part) => ({ primitives: meshPrimitives(part), ...morph }));
  // Positions are in source units (normalized s16); unskinned, the model's
  // scale goes on the node.
  const meshNodes: object[] = whole
    ? [skinned ? { mesh: 0, skin: 0 } : { mesh: 0, scale: pmo.scale.map(f32) }]
    : parts.map((part, mesh) => ({ name: `part_${part}`, mesh, scale: pmo.scale.map(f32) }));

  const json = {
    asset: {
      version: "2.0",
      ...(rig?.motionsFile ? { extras: { motions: rig.motionsFile } } : {}),
    },
    ...(extensions.length ? { extensionsUsed: extensions, extensionsRequired: extensions } : {}),
    scene: 0,
    scenes: [{ nodes: [...meshNodes.keys(), ...skeleton.roots] }],
    nodes: [...meshNodes, ...skeleton.nodes],
    meshes,
    ...(skins.length ? { skins } : {}),
    ...(animations.length ? { animations } : {}),
    materials,
    ...(images.length ? { images, textures: gltfTextures } : {}),
    accessors,
    bufferViews,
    buffers: writer.buffers(),
  };

  const stats: GlbStats = {
    primitives: gltfPrimitives.length,
    vertices: vertexCount,
    triangles: allIndices.length / 3,
    clips: animations.length,
  };
  return { glb: writer.toGlb(json), stats };
}
