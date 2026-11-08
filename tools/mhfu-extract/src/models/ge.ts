/**
 * Minimal decoder for the PSP GE (graphics engine) display lists embedded in
 * `.pmo` meshes. Only the commands those lists use are handled; anything else
 * throws so an unsupported model fails loudly instead of rendering garbage.
 *
 * Command set and vertex layout follow the PSP GE as documented by PPSSPP
 * and used by svanheulen/mhff `psp/pmo.py` (GPL-3.0).
 */
import { BinaryReader } from "../binary/reader.js";

export interface VertexFormat {
  /** Bytes per component, 0 when absent. */
  weightSize: number;
  weightCount: number;
  uvSize: number;
  /** GE color format id (4 = 565, 5 = 5551, 6 = 4444, 7 = 8888), 0 when absent. */
  colorFormat: number;
  normalSize: number;
  positionSize: number;
  /** Bytes per index, 0 for non-indexed draws. */
  indexSize: number;
  throughMode: boolean;
  /** Byte offsets of each attribute within one vertex. */
  weightOffset: number;
  uvOffset: number;
  colorOffset: number;
  normalOffset: number;
  positionOffset: number;
  stride: number;
}

const COMPONENT_SIZE = [0, 1, 2, 4] as const;
const COLOR_SIZE: Record<number, number> = { 4: 2, 5: 2, 6: 2, 7: 4 };

function align(value: number, to: number): number {
  return to > 1 ? Math.ceil(value / to) * to : value;
}

/** Decode a VTYPE (0x12) command's 24-bit argument into a vertex layout. */
export function decodeVertexType(arg: number): VertexFormat {
  const uvSize = COMPONENT_SIZE[arg & 3]!;
  const colorFormat = (arg >> 2) & 7;
  const normalSize = COMPONENT_SIZE[(arg >> 5) & 3]!;
  const positionSize = COMPONENT_SIZE[(arg >> 7) & 3]!;
  const weightSize = COMPONENT_SIZE[(arg >> 9) & 3]!;
  const indexSize = COMPONENT_SIZE[(arg >> 11) & 3]!;
  const weightCount = weightSize ? ((arg >> 14) & 7) + 1 : 0;
  const morphCount = ((arg >> 18) & 7) + 1;
  const throughMode = ((arg >> 23) & 1) === 1;
  if (morphCount > 1) throw new Error(`Morph targets are not supported (VTYPE 0x${arg.toString(16)})`);
  if (colorFormat !== 0 && !(colorFormat in COLOR_SIZE)) {
    throw new Error(`Unsupported vertex color format ${colorFormat} (VTYPE 0x${arg.toString(16)})`);
  }
  const colorSize = colorFormat ? COLOR_SIZE[colorFormat]! : 0;

  // Attributes are laid out in this fixed order, each aligned to its own
  // component size; the vertex as a whole is padded to the largest one.
  let offset = 0;
  const weightOffset = offset;
  offset += weightSize * weightCount;
  const uvOffset = (offset = align(offset, uvSize));
  offset += uvSize * 2;
  const colorOffset = (offset = align(offset, colorSize));
  offset += colorSize;
  const normalOffset = (offset = align(offset, normalSize));
  offset += normalSize * 3;
  const positionOffset = (offset = align(offset, positionSize));
  offset += positionSize * 3;
  const stride = align(offset, Math.max(weightSize, uvSize, colorSize, normalSize, positionSize));

  return {
    weightSize,
    weightCount,
    uvSize,
    colorFormat,
    normalSize,
    positionSize,
    indexSize,
    throughMode,
    weightOffset,
    uvOffset,
    colorOffset,
    normalOffset,
    positionOffset,
    stride,
  };
}

export interface DecodedVertex {
  /** Normalized to [-1, 1] for fixed-point formats; raw for float. */
  position: [number, number, number];
  normal?: [number, number, number];
  /** Normalized so that 1.0 spans the texture once (before any per-mesh UV scale). */
  uv?: [number, number];
  /** RGBA in [0, 1]. */
  color?: [number, number, number, number];
  weights?: number[];
  /**
   * Bytes per component of the source position/normal/UV (1, 2 or 4 = float).
   * Lets the writer store the exact source integers instead of floats.
   */
  sizes: { position: number; normal: number; uv: number };
}

export interface DecodedGeometry {
  vertices: DecodedVertex[];
  /** Triangle list, indices into `vertices`. Winding as emitted by the GE (front face per FFACE). */
  triangles: [number, number, number][];
}

function readSigned(reader: BinaryReader, offset: number, size: number): number {
  if (size === 1) return reader.s8(offset) / 0x7f;
  if (size === 2) return reader.s16(offset) / 0x7fff;
  return reader.f32(offset);
}

function readUnsigned(reader: BinaryReader, offset: number, size: number): number {
  if (size === 1) return reader.u8(offset) / 0x80;
  if (size === 2) return reader.u16(offset) / 0x8000;
  return reader.f32(offset);
}

function readColor(reader: BinaryReader, offset: number, format: number): [number, number, number, number] {
  if (format === 7) {
    return [reader.u8(offset) / 255, reader.u8(offset + 1) / 255, reader.u8(offset + 2) / 255, reader.u8(offset + 3) / 255];
  }
  const v = reader.u16(offset);
  if (format === 4) return [(v & 31) / 31, ((v >> 5) & 63) / 63, ((v >> 11) & 31) / 31, 1];
  if (format === 5) return [(v & 31) / 31, ((v >> 5) & 31) / 31, ((v >> 10) & 31) / 31, v >> 15];
  return [(v & 15) / 15, ((v >> 4) & 15) / 15, ((v >> 8) & 15) / 15, ((v >> 12) & 15) / 15];
}

function readVertex(reader: BinaryReader, base: number, fmt: VertexFormat): DecodedVertex {
  if (fmt.positionSize === 0) throw new Error("Vertex has no position");
  if (fmt.throughMode) throw new Error("Through-mode (2D) vertices are not supported");
  const p = base + fmt.positionOffset;
  const ps = fmt.positionSize;
  const vertex: DecodedVertex = {
    position: [readSigned(reader, p, ps), readSigned(reader, p + ps, ps), readSigned(reader, p + 2 * ps, ps)],
    sizes: { position: ps, normal: fmt.normalSize, uv: fmt.uvSize },
  };
  if (fmt.normalSize) {
    const n = base + fmt.normalOffset;
    const ns = fmt.normalSize;
    vertex.normal = [readSigned(reader, n, ns), readSigned(reader, n + ns, ns), readSigned(reader, n + 2 * ns, ns)];
  }
  if (fmt.uvSize) {
    const t = base + fmt.uvOffset;
    vertex.uv = [readUnsigned(reader, t, fmt.uvSize), readUnsigned(reader, t + fmt.uvSize, fmt.uvSize)];
  }
  if (fmt.colorFormat) vertex.color = readColor(reader, base + fmt.colorOffset, fmt.colorFormat);
  if (fmt.weightSize) {
    vertex.weights = [];
    for (let i = 0; i < fmt.weightCount; i++) {
      vertex.weights.push(readUnsigned(reader, base + fmt.weightOffset + i * fmt.weightSize, fmt.weightSize));
    }
  }
  return vertex;
}

const PRIM_TRIANGLES = 3;
const PRIM_TRIANGLE_STRIP = 4;
const PRIM_TRIANGLE_FAN = 5;

/** Upper bound on commands per list; a well-formed list ends with RET long before this. */
const MAX_COMMANDS = 1 << 20;

/**
 * Run the display list starting at `start` until RET. VADDR/IADDR arguments
 * are relative to `start` (the BASE register's high bits are always 0 in
 * PMO files and are ignored).
 */
export function runDisplayList(reader: BinaryReader, start: number): DecodedGeometry {
  const vertices: DecodedVertex[] = [];
  const triangles: [number, number, number][] = [];
  // Same (address) vertex referenced by several primitives maps to one output vertex.
  const vertexByAddress = new Map<number, number>();

  let vertexAddress: number | null = null;
  let indexAddress: number | null = null;
  let fmt: VertexFormat | null = null;
  let clockwise = false;

  const vertexAt = (address: number): number => {
    const existing = vertexByAddress.get(address);
    if (existing !== undefined) return existing;
    const index = vertices.length;
    vertices.push(readVertex(reader, address, fmt!));
    vertexByAddress.set(address, index);
    return index;
  };

  for (let pc = start, n = 0; ; pc += 4, n++) {
    if (n > MAX_COMMANDS) throw new Error(`Display list at 0x${start.toString(16)} has no RET`);
    const command = reader.u32(pc);
    const op = command >>> 24;
    const arg = command & 0xffffff;
    switch (op) {
      case 0x00: // NOP
      case 0x10: // BASE
      case 0x13: // OFFSETADDR
      case 0x14: // ORIGIN
        break;
      case 0x01: // VADDR
        vertexAddress = start + arg;
        break;
      case 0x02: // IADDR
        indexAddress = start + arg;
        break;
      case 0x12: // VTYPE
        fmt = decodeVertexType(arg);
        break;
      case 0x9b: // FFACE
        clockwise = (arg & 1) === 1;
        break;
      case 0x04: {
        // PRIM
        const type = (arg >> 16) & 7;
        const count = arg & 0xffff;
        if (!fmt || vertexAddress === null) throw new Error("PRIM before VTYPE/VADDR");
        const ids: number[] = [];
        if (fmt.indexSize) {
          if (indexAddress === null) throw new Error("Indexed PRIM before IADDR");
          for (let i = 0; i < count; i++) {
            const at = indexAddress + i * fmt.indexSize;
            const index = fmt.indexSize === 1 ? reader.u8(at) : fmt.indexSize === 2 ? reader.u16(at) : reader.u32(at);
            ids.push(vertexAt(vertexAddress + index * fmt.stride));
          }
          indexAddress += count * fmt.indexSize;
        } else {
          for (let i = 0; i < count; i++) ids.push(vertexAt(vertexAddress + i * fmt.stride));
          vertexAddress += count * fmt.stride;
        }
        emitTriangles(type, ids, clockwise, triangles);
        break;
      }
      case 0x0b: // RET
        return { vertices, triangles };
      default:
        throw new Error(`Unsupported GE command 0x${op.toString(16).padStart(2, "0")} at 0x${pc.toString(16)}`);
    }
  }
}

/** Append triangles in counter-clockwise (glTF) front-face order. */
function emitTriangles(type: number, ids: number[], clockwise: boolean, out: [number, number, number][]): void {
  const push = (a: number, b: number, c: number) => {
    if (a === b || b === c || a === c) return; // degenerate strip joiners
    out.push(clockwise ? [a, c, b] : [a, b, c]);
  };
  if (type === PRIM_TRIANGLES) {
    for (let i = 0; i + 2 < ids.length; i += 3) push(ids[i]!, ids[i + 1]!, ids[i + 2]!);
  } else if (type === PRIM_TRIANGLE_STRIP) {
    for (let i = 0; i + 2 < ids.length; i++) {
      if (i % 2 === 0) push(ids[i]!, ids[i + 1]!, ids[i + 2]!);
      else push(ids[i + 1]!, ids[i]!, ids[i + 2]!);
    }
  } else if (type === PRIM_TRIANGLE_FAN) {
    for (let i = 1; i + 1 < ids.length; i++) push(ids[0]!, ids[i]!, ids[i + 1]!);
  } else {
    throw new Error(`Unsupported primitive type ${type}`);
  }
}
