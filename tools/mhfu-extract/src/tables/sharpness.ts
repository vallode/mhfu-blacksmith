/**
 * Sharpness table reader, transcribed from `SharpnessTable`/`WeaponSharpness`
 * in vendor/mhp2g-patterns/patterns/eboot.hexpat — MIT, see ../../NOTICE.md.
 *
 * Each of the 7 named fields is a *cumulative* threshold, not a step width
 * (see the pattern's own field names, e.g. `Orange` is labelled
 * `this - Red`) — callers wanting per-color pixel/step widths must take
 * consecutive differences themselves; we deliberately keep the raw
 * cumulative values here since that's the literal on-disk layout.
 */
import { BinaryReader } from "../binary/reader.js";
import {
  JP_BASE_ADDRESS,
  JP_TABLE_ADDRESSES,
  SHARPNESS_ENTRY_SIZE,
  TABLE_COUNTS,
  resolveTableOffset,
} from "./offsets.js";
import type { TableAddressResolver } from "./resolver.js";

export const SHARPNESS_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "white",
  "purple",
] as const;
export type SharpnessColor = (typeof SHARPNESS_COLORS)[number];

export interface SharpnessEntry {
  /** Index into the sharpness table — this is WepBMValue.sharpnessId. */
  index: number;
  /** Cumulative thresholds, in ascending color order (see SHARPNESS_COLORS). */
  cumulative: Record<SharpnessColor, number>;
}

/**
 * SharpnessTable.Sharpness[40] @ 0x08976508 — 14 bytes/entry (7x u16).
 * `resolver` defaults to JP's static table — pass e.g. `MHP2G_EU_RESOLVER`
 * (games/mhp2g.ts) to read from a different region.
 */
export function readSharpnessTable(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): SharpnessEntry[] {
  const base = resolveTableOffset("sharpnessTable", reader, resolver);
  const out: SharpnessEntry[] = [];
  for (let i = 0; i < TABLE_COUNTS.sharpnessEntries; i++) {
    out.push(readSharpnessEntryAt(reader, base + i * SHARPNESS_ENTRY_SIZE, i));
  }
  return out;
}

/** Reads one 14-byte `WeaponSharpness` entry at a file offset. */
export function readSharpnessEntryAt(
  reader: BinaryReader,
  offset: number,
  index: number,
): SharpnessEntry {
  const cumulative = {} as Record<SharpnessColor, number>;
  for (let c = 0; c < SHARPNESS_COLORS.length; c++) {
    cumulative[SHARPNESS_COLORS[c]!] = reader.u16(offset + c * 2);
  }
  return { index, cumulative };
}

/** `SharpnessTable.PTR[11]`: one pointer per `WepTypeID`, straight after the 40 entries. */
export const SHARPNESS_POINTER_COUNT = 11;
export const SHARPNESS_POINTERS_OFFSET = TABLE_COUNTS.sharpnessEntries * SHARPNESS_ENTRY_SIZE;

/**
 * Calibrates the region's vaddr -> file offset base from data next to the
 * sharpness table, so the pointers below resolve on EU as well as JP.
 *
 * The `BGModLevel` pool starts right after `PTR[11]` (sharpness table + 604
 * bytes, the same on JP and EU: see `BOWGUN_MOD_TABLE_POOL_EU`), and the
 * first pointer of `BGModTable` (sharpness table + 0x43c) holds the pool's
 * vaddr. Their difference is the base. On JP this gives exactly
 * `JP_BASE_ADDRESS` (pointer 0x08976764, pool offset 0x174d18). A zero
 * pointer (synthetic fixtures) falls back to `JP_BASE_ADDRESS`.
 */
export function sharpnessVaddrBase(tableOffset: number, reader: BinaryReader): number {
  const poolOffset = tableOffset + SHARPNESS_POINTERS_OFFSET + SHARPNESS_POINTER_COUNT * 4;
  const bgModTableOffset =
    tableOffset + (JP_TABLE_ADDRESSES.bowgunModTable - JP_TABLE_ADDRESSES.sharpnessTable);
  if (bgModTableOffset + 4 > reader.buf.length) return JP_BASE_ADDRESS;
  const poolPointer = reader.u32(bgModTableOffset);
  return poolPointer === 0 ? JP_BASE_ADDRESS : poolPointer - poolOffset;
}

export interface SharpnessClassPointer {
  /** `WepTypeID`, the index into `PTR[11]`. */
  typeId: number;
  /** The raw u32 pointer as stored on disc. */
  raw: number;
  /** File offset of this class's entry 0. */
  offset: number;
  /** `offset` as an index into the 40-entry table (may be fractional or out of range). */
  tableIndex: number;
  /** Whether `offset` lands inside the EBOOT. */
  valid: boolean;
}

export interface SharpnessTables {
  /** File offset of `SharpnessTable` (entry 0 of the 40). */
  tableOffset: number;
  /** The vaddr base used to resolve `pointers`. */
  vaddrBase: number;
  pointers: SharpnessClassPointer[];
  /**
   * The curve a weapon of class `typeId` with `sharpnessId` uses:
   * `PTR[typeId] + sharpnessId * 14`. A null pointer falls back to the
   * table's own entry `sharpnessId`.
   */
  entryFor(typeId: number | null, sharpnessId: number): SharpnessEntry;
}

/**
 * Reads `SharpnessTable` together with its per-class `PTR[11]`.
 *
 * `WepBMValue.SharpnessID` indexes the weapon class's own run of entries,
 * starting where that class's pointer points, not entry 0 of the table.
 * Reading every class from entry 0 only happens to work for the classes
 * whose pointer is the table start (vallode/mhfu-blacksmith#31).
 */
export function readSharpnessTables(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): SharpnessTables {
  const tableOffset = resolveTableOffset("sharpnessTable", reader, resolver);
  const vaddrBase = sharpnessVaddrBase(tableOffset, reader);
  const pointers: SharpnessClassPointer[] = [];
  for (let typeId = 0; typeId < SHARPNESS_POINTER_COUNT; typeId++) {
    const raw = reader.u32(tableOffset + SHARPNESS_POINTERS_OFFSET + typeId * 4);
    const offset = raw === 0 ? tableOffset : raw - vaddrBase;
    pointers.push({
      typeId,
      raw,
      offset,
      tableIndex: (offset - tableOffset) / SHARPNESS_ENTRY_SIZE,
      valid: offset >= 0 && offset + SHARPNESS_ENTRY_SIZE <= reader.buf.length,
    });
  }
  return {
    tableOffset,
    vaddrBase,
    pointers,
    entryFor(typeId, sharpnessId) {
      const pointer = typeId === null ? undefined : pointers[typeId];
      if (pointer && !pointer.valid) {
        throw new Error(
          `Sharpness pointer for weapon type ${pointer.typeId} (0x${pointer.raw.toString(16)}) resolves outside the EBOOT (offset ${pointer.offset}, base 0x${vaddrBase.toString(16)}).`,
        );
      }
      const start = pointer?.offset ?? tableOffset;
      return readSharpnessEntryAt(reader, start + sharpnessId * SHARPNESS_ENTRY_SIZE, sharpnessId);
    },
  };
}

/** Converts cumulative thresholds into per-color step widths (pixel/hit counts). */
export function sharpnessStepWidths(entry: SharpnessEntry): Record<SharpnessColor, number> {
  const widths = {} as Record<SharpnessColor, number>;
  let previous = 0;
  for (const color of SHARPNESS_COLORS) {
    const cumulative = entry.cumulative[color];
    widths[color] = cumulative - previous;
    previous = cumulative;
  }
  return widths;
}
