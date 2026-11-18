/**
 * `extract --raw`: a numbers-only dump of everything sharpness extraction
 * reads, for checking the derivation against committed data without
 * shipping disc bytes (vallode/mhfu-blacksmith#31).
 *
 * Holds the 40 `SharpnessTable` entries, the 11 per-class pointers, each
 * class's entries from its pointer up to the highest `sharpnessId` that
 * class uses, and per weapon its index, model, type, `sharpnessId` and
 * `sharpnessAmount`. No names or strings: weapon `index` is the
 * `WepBMID` enum position.
 */
import type { BinaryReader } from "../binary/reader.js";
import { SHARPNESS_COLORS, readSharpnessTables, type SharpnessEntry } from "../tables/sharpness.js";
import { SHARPNESS_ENTRY_SIZE, TABLE_COUNTS } from "../tables/offsets.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import {
  WEAPON_TYPE_NAMES,
  readBlademasterWeapons,
  readModelToWeaponType,
} from "../tables/weapons.js";

export interface SharpnessRawDump {
  tableOffset: number;
  vaddrBase: number;
  /**
   * Every u16 from 1 KiB before the table to 1 KiB after the pointer array,
   * in case the per-class entries live outside the 40-entry table.
   */
  window: { start: number; u16: number[] };
  /** The 40 entries from the table start, cumulative values in colour order. */
  table: number[][];
  pointers: {
    typeId: number;
    type: string;
    raw: number;
    offset: number;
    tableIndex: number;
    valid: boolean;
    /** Entries from this class's pointer, ids 0..(max id used + 2). */
    entries: number[][];
  }[];
  weapons: {
    index: number;
    modelId: number;
    typeId: number | null;
    sharpnessId: number;
    sharpnessAmount: number;
  }[];
}

const cumulativeArray = (entry: SharpnessEntry): number[] =>
  SHARPNESS_COLORS.map((color) => entry.cumulative[color]);

export function dumpSharpnessRaw(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): SharpnessRawDump {
  const tables = readSharpnessTables(reader, resolver);
  const modelToType = readModelToWeaponType(reader, resolver);
  const weapons = readBlademasterWeapons(reader, resolver).map((w) => {
    const type = modelToType[w.modelId] ?? null;
    return {
      index: w.index,
      modelId: w.modelId,
      typeId: type ? WEAPON_TYPE_NAMES.indexOf(type) : null,
      sharpnessId: w.sharpnessId,
      sharpnessAmount: w.sharpnessAmount,
    };
  });

  const table: number[][] = [];
  for (let i = 0; i < TABLE_COUNTS.sharpnessEntries; i++) {
    table.push(cumulativeArray(tables.entryFor(null, i)));
  }

  const pointers = tables.pointers.map((pointer) => {
    const ids = weapons.filter((w) => w.typeId === pointer.typeId).map((w) => w.sharpnessId);
    const count = ids.length > 0 ? Math.max(...ids) + 3 : 0;
    const entries: number[][] = [];
    for (let id = 0; pointer.valid && id < count; id++) {
      if (pointer.offset + (id + 1) * SHARPNESS_ENTRY_SIZE > reader.buf.length) break;
      entries.push(cumulativeArray(tables.entryFor(pointer.typeId, id)));
    }
    return { ...pointer, type: WEAPON_TYPE_NAMES[pointer.typeId] ?? "?", entries };
  });

  const start = Math.max(0, tables.tableOffset - 1024);
  const end = Math.min(reader.buf.length, tables.tableOffset + 0x43c + 1024);
  const u16: number[] = [];
  for (let off = start; off + 2 <= end; off += 2) u16.push(reader.u16(off));

  return {
    tableOffset: tables.tableOffset,
    vaddrBase: tables.vaddrBase,
    window: { start, u16 },
    table,
    pointers,
    weapons,
  };
}
