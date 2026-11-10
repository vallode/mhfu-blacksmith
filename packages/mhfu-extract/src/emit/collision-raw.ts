/**
 * Raw dumps for working out monster hurtboxes (`extract --raw`): the bytes
 * the collision table (`monsters/collision.ts`) and skeleton
 * (`models/ahi.ts`) were decoded from, kept for checking the decoding
 * on more monsters.
 *
 * `raw/collision.json`, one entry per `MonChunk` (emID 0-89):
 * - the whole 0x1D0-byte chunk as hex, and every u32 in it that holds a
 *   user-memory address, with the file it points into;
 * - the chunk's `CollisionPTR` (`+0x50` in the vendored `game_task.hexpat`,
 *   unnamed beyond that) and 0x800 bytes at its target, as hex and as f32s.
 *   If the target starts with a list of pointers (as `HitzonePTR`'s does),
 *   0x200 bytes at each of them too. A target outside `game_task.ovl` is
 *   read from the monster's own `overlay/emNN.ovl` when there is one.
 *
 * `raw/parts.json`, one entry per `MonChunk`, for finding the breakable
 * parts: the 28 u32s of the hexpat's `emPTRChunk` (`+0x158` to `+0x1C8`,
 * after the tolerances; `PartDurabilityPTR` is its 24th, `+0x1B4`), and for
 * each that resolves, 0x200 bytes at its target, plus 0x100 bytes at each
 * pointer in a list the target starts with.
 *
 * `raw/emmodel.json`, one entry per `emmodel/emNN.pac`: every package entry
 * (size, magic, first 0x40 bytes) and, for the PMO mesh, the header and the
 * raw mesh and vertex-group records with each group's vertex count, weights
 * per vertex and raw position bounds. The mesh decoder skips the bytes that
 * bind vertex groups to skeleton joints; they are in these records. The
 * entries that are neither PMO nor TMH (skeleton or collision candidates)
 * are written whole to `raw/emmodel/emNN.<index>.bin` by `extract`.
 */
import type { OvlFile } from "../container/ovl.js";
import { BinaryReader } from "../binary/reader.js";
import {
  COLLISION_POINTER_OFFSET,
  isUserAddress,
  resolveChunkPointer as resolve,
  type ResolvedPointer as Resolved,
} from "../monsters/collision.js";
import { MONSTER_CHUNK_COUNT, MONSTER_CHUNK_SIZE } from "../monsters/hitzones.js";
import { runDisplayList } from "../models/ge.js";
import { isPac, readPac } from "../models/pac.js";
import { isPmo } from "../models/pmo.js";
import { isTmh } from "../models/tmh.js";

const TARGET_WINDOW = 0x800;
const LIST_TARGET_WINDOW = 0x200;
const MAX_LIST_POINTERS = 64;
const PAC_HEAD_BYTES = 0x40;

const hex = (n: number) => `0x${n.toString(16).padStart(8, "0")}`;

export type PointerFile = "game_task" | "em_ovl" | "other";

export interface ChunkPointer {
  /** Byte offset within the chunk. */
  at: string;
  value: string;
  file: PointerFile;
}

export interface ByteWindow {
  /** Pointer value this window starts at. */
  vaddr: string;
  file: Exclude<PointerFile, "other">;
  fileOffset: string;
  hex: string;
}

export interface CollisionTarget extends ByteWindow {
  /** The window as little-endian f32s, 6 significant digits; non-finite values are null. */
  f32: (number | null)[];
  /** If the target starts with pointers into the same file: 0x200 bytes at each. */
  list: ByteWindow[];
}

export interface CollisionRawEntry {
  emId: number;
  name: string | null;
  chunkOffset: string;
  chunkHex: string;
  pointers: ChunkPointer[];
  collisionPointer: string;
  collision: CollisionTarget | null;
  /** The monster's own `overlay/emNN.ovl`, if the disc has one. */
  emOvl: { loadBase: string; loadEnd: string; length: number } | null;
}

function window(target: Resolved, vaddr: number, size: number): ByteWindow {
  const buf = target.ovl.reader.buf;
  const end = Math.min(buf.length, target.offset + size);
  return {
    vaddr: hex(vaddr),
    file: target.file,
    fileOffset: hex(target.offset),
    hex: buf.subarray(target.offset, end).toString("hex"),
  };
}

function f32View(bytes: Buffer): (number | null)[] {
  const out: (number | null)[] = [];
  for (let at = 0; at + 4 <= bytes.length; at += 4) {
    const value = bytes.readFloatLE(at);
    out.push(Number.isFinite(value) ? Number(value.toPrecision(6)) : null);
  }
  return out;
}

function collisionTarget(
  vaddr: number,
  gameTask: OvlFile,
  emOvl: OvlFile | undefined,
  size = TARGET_WINDOW,
  listSize = LIST_TARGET_WINDOW,
): CollisionTarget | null {
  const target = resolve(vaddr, gameTask, emOvl);
  if (!target) return null;
  const main = window(target, vaddr, size);
  const list: ByteWindow[] = [];
  const reader = target.ovl.reader;
  for (
    let at = target.offset;
    at + 4 <= reader.length && list.length < MAX_LIST_POINTERS;
    at += 4
  ) {
    const pointer = reader.u32(at);
    const sub = resolve(pointer, gameTask, emOvl);
    if (!sub || sub.ovl !== target.ovl) break;
    list.push(window(sub, pointer, listSize));
  }
  return { ...main, f32: f32View(Buffer.from(main.hex, "hex")), list };
}

/**
 * Dumps every chunk of `MonChunk[90]` at `chunksOffset` in `game_task.ovl`.
 * `emOvls` maps emID to its `overlay/emNN.ovl`; `names` maps emID to the
 * `emID` enum name.
 */
export function dumpCollisionRaw(
  gameTask: OvlFile,
  chunksOffset: number,
  emOvls: ReadonlyMap<number, OvlFile>,
  names: (emId: number) => string | null,
): CollisionRawEntry[] {
  const reader = gameTask.reader;
  const entries: CollisionRawEntry[] = [];
  for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
    const base = chunksOffset + emId * MONSTER_CHUNK_SIZE;
    const emOvl = emOvls.get(emId);
    const pointers: ChunkPointer[] = [];
    for (let at = 0; at < MONSTER_CHUNK_SIZE; at += 4) {
      const value = reader.u32(base + at);
      if (!isUserAddress(value)) continue;
      const file = resolve(value, gameTask, emOvl)?.file ?? "other";
      pointers.push({ at: `0x${at.toString(16)}`, value: hex(value), file });
    }
    const collisionPointer = reader.u32(base + COLLISION_POINTER_OFFSET);
    entries.push({
      emId,
      name: names(emId),
      chunkOffset: hex(base),
      chunkHex: reader.buf.subarray(base, base + MONSTER_CHUNK_SIZE).toString("hex"),
      pointers,
      collisionPointer: hex(collisionPointer),
      collision: collisionTarget(collisionPointer, gameTask, emOvl),
      emOvl: emOvl
        ? {
            loadBase: hex(emOvl.loadBase),
            loadEnd: hex(emOvl.loadEnd),
            length: emOvl.reader.length,
          }
        : null,
    });
  }
  return entries;
}

/** The hexpat's `emPTRChunk`: 28 u32s from `+0x158`, then the u64 `TERM` to the chunk's end. */
export const PTR_TABLE_OFFSET = 0x158;
export const PTR_TABLE_COUNT = 28;
/** `PartDurabilityPTR`, the table's 24th pointer. */
export const PART_DURABILITY_OFFSET = PTR_TABLE_OFFSET + 23 * 4;
const PARTS_TARGET_WINDOW = 0x200;
const PARTS_LIST_WINDOW = 0x100;

export interface PartsRawPointer {
  /** Byte offset within the chunk. */
  at: string;
  /** Index in `emPTRChunk` (23 = `PartDurabilityPTR`). */
  index: number;
  value: string;
  target: CollisionTarget | null;
}

export interface PartsRawEntry {
  emId: number;
  name: string | null;
  /** Every pointer slot in `emPTRChunk`, resolved or not. */
  pointers: PartsRawPointer[];
}

/** Dumps each chunk's `emPTRChunk` and the bytes its pointers lead to; see `raw/parts.json` above. */
export function dumpPartsRaw(
  gameTask: OvlFile,
  chunksOffset: number,
  emOvls: ReadonlyMap<number, OvlFile>,
  names: (emId: number) => string | null,
): PartsRawEntry[] {
  const reader = gameTask.reader;
  const entries: PartsRawEntry[] = [];
  for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
    const base = chunksOffset + emId * MONSTER_CHUNK_SIZE;
    const emOvl = emOvls.get(emId);
    const pointers: PartsRawPointer[] = [];
    for (let index = 0; index < PTR_TABLE_COUNT; index++) {
      const at = PTR_TABLE_OFFSET + index * 4;
      const value = reader.u32(base + at);
      pointers.push({
        at: `0x${at.toString(16)}`,
        index,
        value: hex(value),
        target: collisionTarget(value, gameTask, emOvl, PARTS_TARGET_WINDOW, PARTS_LIST_WINDOW),
      });
    }
    entries.push({ emId, name: names(emId), pointers });
  }
  return entries;
}

export interface PacEntryRaw {
  index: number;
  size: number;
  magic: string | null;
  /** "empty" is an unused (0, 0) slot. */
  kind: "pmo" | "tmh" | "unknown" | "empty";
  headHex: string;
}

export interface VertexGroupRaw {
  /** The 0x10-byte record: u8 material slot, u8, u16, u32 display-list offset, u32, u32. */
  hex: string;
  vertices: number;
  /** Skinning weights per vertex (0 when unweighted). */
  weights: number;
  /** Min and max decoded position (normalized source integers, before the model scale). */
  min: [number, number, number] | null;
  max: [number, number, number] | null;
  error?: string;
}

export interface PmoRaw {
  /** Header bytes 0x00-0x38 (see `models/pmo.ts`; 0x2c is unknown). */
  headerHex: string;
  /** Each 0x18-byte mesh record, two u32s and a u16 of which are unknown. */
  meshes: { hex: string; firstGroup: number; groupCount: number }[];
  vertexGroups: VertexGroupRaw[];
}

export interface EmModelRawEntry {
  file: string;
  entries: PacEntryRaw[];
  pmo: PmoRaw | null;
  error?: string;
}

const MESH_STRIDE = 0x18;
const VERTEX_GROUP_STRIDE = 0x10;

const round = (v: number) => Number(v.toPrecision(6));

function dumpPmo(buf: Buffer): PmoRaw {
  const reader = new BinaryReader(buf);
  const meshCount = reader.u16(0x1c);
  const meshTable = reader.u32(0x20);
  const groupTable = reader.u32(0x24);
  const displayListBase = reader.u32(0x34);
  const meshes: PmoRaw["meshes"] = [];
  let groupTotal = 0;
  for (let m = 0; m < meshCount; m++) {
    const at = meshTable + m * MESH_STRIDE;
    const groupCount = reader.u16(at + 0x14);
    const firstGroup = reader.u16(at + 0x16);
    groupTotal = Math.max(groupTotal, firstGroup + groupCount);
    meshes.push({
      hex: buf.subarray(at, at + MESH_STRIDE).toString("hex"),
      firstGroup,
      groupCount,
    });
  }
  const vertexGroups: VertexGroupRaw[] = [];
  for (let g = 0; g < groupTotal; g++) {
    const at = groupTable + g * VERTEX_GROUP_STRIDE;
    const raw = buf.subarray(at, at + VERTEX_GROUP_STRIDE).toString("hex");
    try {
      const { vertices } = runDisplayList(reader, displayListBase + reader.u32(at + 4));
      let min: [number, number, number] | null = null;
      let max: [number, number, number] | null = null;
      for (const { position } of vertices) {
        min = min ? (min.map((v, i) => Math.min(v, position[i]!)) as typeof min) : [...position];
        max = max ? (max.map((v, i) => Math.max(v, position[i]!)) as typeof max) : [...position];
      }
      vertexGroups.push({
        hex: raw,
        vertices: vertices.length,
        weights: vertices[0]?.weights?.length ?? 0,
        min: min && (min.map(round) as typeof min),
        max: max && (max.map(round) as typeof max),
      });
    } catch (err) {
      vertexGroups.push({
        hex: raw,
        vertices: 0,
        weights: 0,
        min: null,
        max: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { headerHex: buf.subarray(0, 0x38).toString("hex"), meshes, vertexGroups };
}

/**
 * Dumps one `emmodel/emNN.pac`. Returns the summary and the entries that are
 * neither PMO nor TMH, for the caller to write out whole.
 */
export function dumpEmModelRaw(
  file: string,
  buf: Buffer,
): { entry: EmModelRawEntry; unknown: { index: number; data: Buffer }[] } {
  if (!isPac(buf))
    return { entry: { file, entries: [], pmo: null, error: "not a .pac" }, unknown: [] };
  const entries: PacEntryRaw[] = [];
  const unknown: { index: number; data: Buffer }[] = [];
  let pmo: PmoRaw | null = null;
  let error: string | undefined;
  for (const pacEntry of readPac(buf)) {
    const kind =
      pacEntry.data.length === 0
        ? "empty"
        : isPmo(pacEntry.data)
          ? "pmo"
          : isTmh(pacEntry.data)
            ? "tmh"
            : "unknown";
    entries.push({
      index: pacEntry.index,
      size: pacEntry.data.length,
      magic: pacEntry.magic,
      kind,
      headHex: pacEntry.data.subarray(0, PAC_HEAD_BYTES).toString("hex"),
    });
    if (kind === "unknown") unknown.push({ index: pacEntry.index, data: pacEntry.data });
    // The first PMO is the monster; the second (large monsters) is a few flat quads.
    if (kind === "pmo" && !pmo) {
      try {
        pmo = dumpPmo(pacEntry.data);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }
  }
  return { entry: { file, entries, pmo, ...(error ? { error } : {}) }, unknown };
}
