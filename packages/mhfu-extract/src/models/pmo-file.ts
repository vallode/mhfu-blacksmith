/**
 * `.pmo` 1.0 files at the byte level: `parsePmoFile` reads one into the
 * records and GE vertices it stores, and `writePmo` writes them back, so a
 * model can be edited (parts swapped between models, positions rescaled,
 * UVs moved) and put back on the disc. `readPmo` (`pmo.ts`) is the reader
 * for rendering; this one keeps every field the file has, as stored.
 *
 * Layout, as every PMO in the EU DATA.BIN has it (`pmo.ts` has the fields):
 * the 0x40-byte header, then the mesh table, vertex groups, material map,
 * bone palette, materials and display lists, each table starting on a
 * 16-byte boundary. A mesh owns a run of material slots (its base and the
 * u16 at 0x10, the slot count) and a run of vertex groups; a vertex group
 * owns a run of bone palette entries. Each vertex group has one display
 * list of fixed shape:
 *
 *   ORIGIN 0, BASE 0, IADDR i, VADDR v, VTYPE t, (FFACE f | PRIM p)..., OFFSETADDR 0, RET
 *
 * followed, from the next 16-byte boundary, by its vertices and then, from
 * the next 16-byte boundary again, its indices (u8 or u16), padded to 16
 * bytes. The draws start with an FFACE; a few lists change it partway. The group record repeats the
 * vertex and index offsets, from the display-list base, at 0x08 and 0x0c.
 */
import { BinaryReader } from "../binary/reader.js";
import { decodeVertexType, type VertexFormat } from "./ge.js";

/** A vertex as the GE stores it: integers for fixed-point formats, floats for float ones. */
export interface GeVertex {
  weights: number[];
  uv: [number, number] | null;
  /** Packed in the list's colour format. */
  color: number | null;
  normal: [number, number, number] | null;
  position: [number, number, number];
}

/** A PRIM (draw `count` indices as GE primitive `type`: 3 triangles, 4 strip, 5 fan) or an FFACE (1: front faces wind clockwise). */
export type GeDraw = { prim: number; count: number } | { frontFace: number };

export interface PmoDisplayList {
  /** VTYPE argument: the vertex layout, which must be indexed. */
  vertexType: number;
  vertices: GeVertex[];
  /** All primitives' indices, in draw order. */
  indices: number[];
  draws: GeDraw[];
}

export interface PmoVertexGroup {
  /** Material slot, relative to the mesh's first. */
  materialSlot: number;
  /** (GE matrix slot, bone) pairs loaded before drawing; slots keep their bone until reloaded. */
  palette: [slot: number, bone: number][];
  list: PmoDisplayList;
}

export interface PmoMeshRecord {
  /** f32 at 0x00: multiplies the vertices' UVs. */
  uvScale: [number, number];
  /** u32 at 0x08, not understood (0x80000003 or 0x80000004 on weapons). */
  flags: number;
  /** u32 at 0x0c: the GE ALPHA command the mesh draws with, or 0 (see `meshBlend`). */
  blend: number;
  /** Material index (into `materials`) of each of the mesh's slots. */
  materialSlots: number[];
  groups: PmoVertexGroup[];
}

export interface PmoMaterialRecord {
  diffuse: number;
  ambient: number;
  textureIndex: number;
  /** u32 at 0x0c, 0 on every weapon. */
  extra: number;
}

export interface PmoFile {
  radius: number;
  /** Per-axis scale of the fixed-point positions. */
  scale: [number, number, number];
  meshes: PmoMeshRecord[];
  materials: PmoMaterialRecord[];
}

const MAGIC = Buffer.from("pmo\x001.0\x00", "latin1");
const HEADER_SIZE = 0x40;
const MESH_STRIDE = 0x18;
const GROUP_STRIDE = 0x10;
const MATERIAL_STRIDE = 0x10;

const OP_VADDR = 0x01;
const OP_IADDR = 0x02;
const OP_PRIM = 0x04;
const OP_RET = 0x0b;
const OP_BASE = 0x10;
const OP_VTYPE = 0x12;
const OP_OFFSETADDR = 0x13;
const OP_ORIGIN = 0x14;
const OP_FFACE = 0x9b;

const align16 = (n: number) => (n + 15) & ~15;
const command = (op: number, arg = 0) => ((op << 24) | (arg & 0xffffff)) >>> 0;

// ---------------------------------------------------------------- vertices

function readComponent(reader: BinaryReader, at: number, size: number, signed: boolean): number {
  if (size === 1) return signed ? reader.s8(at) : reader.u8(at);
  if (size === 2) return signed ? reader.s16(at) : reader.u16(at);
  return reader.f32(at);
}

function writeComponent(
  buf: Buffer,
  at: number,
  size: number,
  signed: boolean,
  value: number,
): void {
  if (size === 1) {
    if (signed) buf.writeInt8(value, at);
    else buf.writeUInt8(value, at);
  } else if (size === 2) {
    if (signed) buf.writeInt16LE(value, at);
    else buf.writeUInt16LE(value, at);
  } else buf.writeFloatLE(value, at);
}

const COLOR_SIZE: Record<number, number> = { 4: 2, 5: 2, 6: 2, 7: 4 };

function readGeVertex(reader: BinaryReader, at: number, fmt: VertexFormat): GeVertex {
  const three = (offset: number, size: number): [number, number, number] => [
    readComponent(reader, at + offset, size, true),
    readComponent(reader, at + offset + size, size, true),
    readComponent(reader, at + offset + 2 * size, size, true),
  ];
  const colorSize = COLOR_SIZE[fmt.colorFormat] ?? 0;
  return {
    weights: Array.from({ length: fmt.weightCount }, (_, i) =>
      readComponent(reader, at + fmt.weightOffset + i * fmt.weightSize, fmt.weightSize, false),
    ),
    uv: fmt.uvSize
      ? [
          readComponent(reader, at + fmt.uvOffset, fmt.uvSize, false),
          readComponent(reader, at + fmt.uvOffset + fmt.uvSize, fmt.uvSize, false),
        ]
      : null,
    color:
      colorSize === 4
        ? reader.u32(at + fmt.colorOffset)
        : colorSize
          ? reader.u16(at + fmt.colorOffset)
          : null,
    normal: fmt.normalSize ? three(fmt.normalOffset, fmt.normalSize) : null,
    position: three(fmt.positionOffset, fmt.positionSize),
  };
}

function writeGeVertex(buf: Buffer, at: number, fmt: VertexFormat, vertex: GeVertex): void {
  const has = (what: string, present: boolean, wanted: boolean) => {
    if (present !== wanted) {
      throw new Error(
        `Vertex ${wanted ? "lacks" : "has"} ${what} the list's VTYPE ${wanted ? "has" : "lacks"}`,
      );
    }
  };
  if (vertex.weights.length !== fmt.weightCount) {
    throw new Error(
      `Vertex has ${vertex.weights.length} weights; the list's VTYPE has ${fmt.weightCount}`,
    );
  }
  has("UVs", vertex.uv !== null, fmt.uvSize > 0);
  has("a colour", vertex.color !== null, fmt.colorFormat > 0);
  has("a normal", vertex.normal !== null, fmt.normalSize > 0);
  vertex.weights.forEach((w, i) =>
    writeComponent(buf, at + fmt.weightOffset + i * fmt.weightSize, fmt.weightSize, false, w),
  );
  vertex.uv?.forEach((v, i) =>
    writeComponent(buf, at + fmt.uvOffset + i * fmt.uvSize, fmt.uvSize, false, v),
  );
  if (vertex.color !== null) {
    if (COLOR_SIZE[fmt.colorFormat] === 4)
      buf.writeUInt32LE(vertex.color >>> 0, at + fmt.colorOffset);
    else buf.writeUInt16LE(vertex.color, at + fmt.colorOffset);
  }
  vertex.normal?.forEach((v, i) =>
    writeComponent(buf, at + fmt.normalOffset + i * fmt.normalSize, fmt.normalSize, true, v),
  );
  vertex.position.forEach((v, i) =>
    writeComponent(buf, at + fmt.positionOffset + i * fmt.positionSize, fmt.positionSize, true, v),
  );
}

// ---------------------------------------------------------------- display lists

function vertexFormat(vertexType: number): VertexFormat {
  const fmt = decodeVertexType(vertexType);
  if (fmt.indexSize !== 1 && fmt.indexSize !== 2) {
    throw new Error(`VTYPE 0x${vertexType.toString(16)} isn't indexed with u8 or u16 indices`);
  }
  if (fmt.positionSize === 0 || fmt.throughMode) {
    throw new Error(`VTYPE 0x${vertexType.toString(16)} has no 3D positions`);
  }
  return fmt;
}

/** Reads the display list at `start`, whose vertices end where `end` (the next list, or the file's end) begins. */
function parseDisplayList(reader: BinaryReader, start: number, end: number): PmoDisplayList {
  const at = (i: number) => reader.u32(start + i * 4);
  const expect = (i: number, op: number, what: string): number => {
    const word = at(i);
    if (word >>> 24 !== op) {
      throw new Error(
        `Display list at 0x${start.toString(16)}: command ${i} is 0x${word.toString(16)}, expected ${what}`,
      );
    }
    return word & 0xffffff;
  };
  if (expect(0, OP_ORIGIN, "ORIGIN") !== 0 || expect(1, OP_BASE, "BASE") !== 0) {
    throw new Error(`Display list at 0x${start.toString(16)}: ORIGIN or BASE isn't 0`);
  }
  const indexOffset = expect(2, OP_IADDR, "IADDR");
  const vertexOffset = expect(3, OP_VADDR, "VADDR");
  const vertexType = expect(4, OP_VTYPE, "VTYPE");
  const draws: GeDraw[] = [];
  let i = 5;
  for (; at(i) >>> 24 === OP_PRIM || at(i) >>> 24 === OP_FFACE; i++) {
    const arg = at(i) & 0xffffff;
    draws.push(
      at(i) >>> 24 === OP_FFACE
        ? { frontFace: arg }
        : { prim: (arg >> 16) & 7, count: arg & 0xffff },
    );
  }
  if (expect(i, OP_OFFSETADDR, "OFFSETADDR") !== 0) {
    throw new Error(`Display list at 0x${start.toString(16)}: OFFSETADDR isn't 0`);
  }
  expect(i + 1, OP_RET, "RET");

  const fmt = vertexFormat(vertexType);
  const vertexCount = Math.floor((indexOffset - vertexOffset) / fmt.stride);
  if (vertexCount < 0 || align16(vertexOffset + vertexCount * fmt.stride) !== indexOffset) {
    throw new Error(`Display list at 0x${start.toString(16)}: indices don't follow its vertices`);
  }
  const indexCount = countIndices(draws);
  if (start + indexOffset + indexCount * fmt.indexSize > end) {
    throw new Error(`Display list at 0x${start.toString(16)}: indices run past its end`);
  }
  const vertices = Array.from({ length: vertexCount }, (_, v) =>
    readGeVertex(reader, start + vertexOffset + v * fmt.stride, fmt),
  );
  const indices = Array.from({ length: indexCount }, (_, k) =>
    fmt.indexSize === 1
      ? reader.u8(start + indexOffset + k)
      : reader.u16(start + indexOffset + k * 2),
  );
  return { vertexType, vertices, indices, draws };
}

interface EncodedList {
  bytes: Buffer;
  vertexOffset: number;
  indexOffset: number;
}

function countIndices(draws: GeDraw[]): number {
  return draws.reduce((sum, d) => sum + ("prim" in d ? d.count : 0), 0);
}

function encodeDisplayList(list: PmoDisplayList): EncodedList {
  const fmt = vertexFormat(list.vertexType);
  const indexCount = countIndices(list.draws);
  if (indexCount !== list.indices.length) {
    throw new Error(`Primitives draw ${indexCount} indices; the list has ${list.indices.length}`);
  }
  const maxIndex = fmt.indexSize === 1 ? 0xff : 0xffff;
  for (const index of list.indices) {
    if (index >= list.vertices.length || index > maxIndex) {
      throw new Error(
        `Index ${index} is out of range (${list.vertices.length} vertices, u${fmt.indexSize * 8} indices)`,
      );
    }
  }
  const commandCount = 5 + list.draws.length + 2;
  const vertexOffset = align16(commandCount * 4);
  const indexOffset = align16(vertexOffset + list.vertices.length * fmt.stride);
  const bytes = Buffer.alloc(align16(indexOffset + indexCount * fmt.indexSize));
  const commands = [
    command(OP_ORIGIN),
    command(OP_BASE),
    command(OP_IADDR, indexOffset),
    command(OP_VADDR, vertexOffset),
    command(OP_VTYPE, list.vertexType),
    ...list.draws.map((d) => {
      if ("frontFace" in d) return command(OP_FFACE, d.frontFace);
      if (d.count > 0xffff)
        throw new Error(`A primitive draws ${d.count} indices; at most 65535 fit`);
      return command(OP_PRIM, ((d.prim & 7) << 16) | d.count);
    }),
    command(OP_OFFSETADDR),
    command(OP_RET),
  ];
  commands.forEach((c, i) => bytes.writeUInt32LE(c, i * 4));
  list.vertices.forEach((v, i) => writeGeVertex(bytes, vertexOffset + i * fmt.stride, fmt, v));
  list.indices.forEach((index, k) => {
    if (fmt.indexSize === 1) bytes.writeUInt8(index, indexOffset + k);
    else bytes.writeUInt16LE(index, indexOffset + k * 2);
  });
  return { bytes, vertexOffset, indexOffset };
}

// ---------------------------------------------------------------- files

export function parsePmoFile(buf: Buffer): PmoFile {
  if (buf.length < HEADER_SIZE || !buf.subarray(0, 8).equals(MAGIC)) {
    throw new Error("Not a PMO 1.0 file");
  }
  const reader = new BinaryReader(buf);
  const meshCount = reader.u16(0x1c);
  const materialCount = reader.u16(0x1e);
  const meshTable = reader.u32(0x20);
  const groupTable = reader.u32(0x24);
  const materialMap = reader.u32(0x28);
  const bonePalette = reader.u32(0x2c);
  const materialTable = reader.u32(0x30);
  const listBase = reader.u32(0x34);
  const size = reader.u32(0x08);
  if (size > buf.length)
    throw new Error(`PMO says it is ${size} bytes; only ${buf.length} are there`);

  const materials = Array.from({ length: materialCount }, (_, i): PmoMaterialRecord => {
    const at = materialTable + i * MATERIAL_STRIDE;
    return {
      diffuse: reader.u32(at),
      ambient: reader.u32(at + 4),
      textureIndex: reader.u32(at + 8),
      extra: reader.u32(at + 12),
    };
  });

  const groupCount = (materialMap - groupTable) / GROUP_STRIDE;
  const listStarts = Array.from(
    { length: groupCount },
    (_, g) => listBase + reader.u32(groupTable + g * GROUP_STRIDE + 4),
  );
  const listEnd = (g: number) => Math.min(...listStarts.filter((s) => s > listStarts[g]!), size);

  const meshes = Array.from({ length: meshCount }, (_, m): PmoMeshRecord => {
    const at = meshTable + m * MESH_STRIDE;
    const slotCount = reader.u16(at + 0x10);
    const slotBase = reader.u16(at + 0x12);
    const groupCountOfMesh = reader.u16(at + 0x14);
    const firstGroup = reader.u16(at + 0x16);
    const groups = Array.from({ length: groupCountOfMesh }, (_, k): PmoVertexGroup => {
      const g = firstGroup + k;
      const groupAt = groupTable + g * GROUP_STRIDE;
      const paletteCount = reader.u8(groupAt + 1);
      const paletteStart = reader.u16(groupAt + 2);
      const list = parseDisplayList(reader, listStarts[g]!, listEnd(g));
      return {
        materialSlot: reader.u8(groupAt),
        palette: Array.from({ length: paletteCount }, (_, p): [number, number] => {
          const entry = bonePalette + (paletteStart + p) * 2;
          return [reader.u8(entry), reader.u8(entry + 1)];
        }),
        list,
      };
    });
    return {
      uvScale: [reader.f32(at), reader.f32(at + 4)],
      flags: reader.u32(at + 8),
      blend: reader.u32(at + 0x0c),
      materialSlots: Array.from({ length: slotCount }, (_, s) =>
        reader.u8(materialMap + slotBase + s),
      ),
      groups,
    };
  });

  return {
    radius: reader.f32(0x0c),
    scale: [reader.f32(0x10), reader.f32(0x14), reader.f32(0x18)],
    meshes,
    materials,
  };
}

export function writePmo(file: PmoFile): Buffer {
  const groups = file.meshes.flatMap((m) => m.groups);
  const slotCount = file.meshes.reduce((sum, m) => sum + m.materialSlots.length, 0);
  const paletteCount = groups.reduce((sum, g) => sum + g.palette.length, 0);
  const lists = groups.map((g) => encodeDisplayList(g.list));

  const meshTable = HEADER_SIZE;
  const groupTable = align16(meshTable + file.meshes.length * MESH_STRIDE);
  const materialMap = align16(groupTable + groups.length * GROUP_STRIDE);
  const bonePalette = align16(materialMap + slotCount);
  const materialTable = align16(bonePalette + paletteCount * 2);
  const listBase = align16(materialTable + file.materials.length * MATERIAL_STRIDE);
  const listOffsets: number[] = [];
  let size = listBase;
  for (const list of lists) {
    listOffsets.push(size - listBase);
    size += list.bytes.length;
  }

  const buf = Buffer.alloc(size);
  MAGIC.copy(buf, 0);
  buf.writeUInt32LE(size, 0x08);
  buf.writeFloatLE(file.radius, 0x0c);
  file.scale.forEach((s, i) => buf.writeFloatLE(s, 0x10 + i * 4));
  buf.writeUInt16LE(file.meshes.length, 0x1c);
  buf.writeUInt16LE(file.materials.length, 0x1e);
  [meshTable, groupTable, materialMap, bonePalette, materialTable, listBase].forEach((offset, i) =>
    buf.writeUInt32LE(offset, 0x20 + i * 4),
  );

  let slotBase = 0;
  let firstGroup = 0;
  let paletteStart = 0;
  file.meshes.forEach((mesh, m) => {
    const at = meshTable + m * MESH_STRIDE;
    buf.writeFloatLE(mesh.uvScale[0], at);
    buf.writeFloatLE(mesh.uvScale[1], at + 4);
    buf.writeUInt32LE(mesh.flags >>> 0, at + 8);
    buf.writeUInt32LE(mesh.blend >>> 0, at + 0x0c);
    buf.writeUInt16LE(mesh.materialSlots.length, at + 0x10);
    buf.writeUInt16LE(slotBase, at + 0x12);
    buf.writeUInt16LE(mesh.groups.length, at + 0x14);
    buf.writeUInt16LE(firstGroup, at + 0x16);
    mesh.materialSlots.forEach((material, s) => {
      if (material >= file.materials.length) {
        throw new Error(
          `Mesh ${m} slot ${s} names material ${material} of ${file.materials.length}`,
        );
      }
      buf.writeUInt8(material, materialMap + slotBase + s);
    });
    mesh.groups.forEach((group, k) => {
      const g = firstGroup + k;
      const groupAt = groupTable + g * GROUP_STRIDE;
      if (group.materialSlot >= mesh.materialSlots.length) {
        throw new Error(
          `Mesh ${m} group ${k} uses slot ${group.materialSlot} of ${mesh.materialSlots.length}`,
        );
      }
      buf.writeUInt8(group.materialSlot, groupAt);
      buf.writeUInt8(group.palette.length, groupAt + 1);
      buf.writeUInt16LE(paletteStart, groupAt + 2);
      buf.writeUInt32LE(listOffsets[g]!, groupAt + 4);
      buf.writeUInt32LE(listOffsets[g]! + lists[g]!.vertexOffset, groupAt + 8);
      buf.writeUInt32LE(listOffsets[g]! + lists[g]!.indexOffset, groupAt + 0x0c);
      group.palette.forEach(([slot, bone], p) => {
        buf.writeUInt8(slot, bonePalette + (paletteStart + p) * 2);
        buf.writeUInt8(bone, bonePalette + (paletteStart + p) * 2 + 1);
      });
      paletteStart += group.palette.length;
      lists[g]!.bytes.copy(buf, listBase + listOffsets[g]!);
    });
    slotBase += mesh.materialSlots.length;
    firstGroup += mesh.groups.length;
  });

  file.materials.forEach((material, i) => {
    const at = materialTable + i * MATERIAL_STRIDE;
    buf.writeUInt32LE(material.diffuse >>> 0, at);
    buf.writeUInt32LE(material.ambient >>> 0, at + 4);
    buf.writeUInt32LE(material.textureIndex >>> 0, at + 8);
    buf.writeUInt32LE(material.extra >>> 0, at + 12);
  });
  return buf;
}
