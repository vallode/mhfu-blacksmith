/**
 * Gunner-only tables, transcribed from
 * vendor/mhp2g-patterns/patterns/eboot.hexpat (`BowgunShots`, `BowCharges`,
 * `BGModTable`/`BGModLevel`) — MIT, see ../../NOTICE.md.
 *
 * Like tables/weapons.ts, these return raw values; the mapping onto the
 * `data/weapons/*.json` shape is in emit/weapons.ts.
 */
import type { BinaryReader } from "../binary/reader.js";
import { JP_TABLE_ADDRESSES, resolveTableOffset } from "./offsets.js";
import type { TableAddressResolver } from "./resolver.js";
import { sharpnessVaddrBase } from "./sharpness.js";

/** `BGShotTable[58]`: one ammo capacity per `ShotCoat` ammo type. */
export const BOWGUN_SHOT_COUNT = 58;
export const BOWGUN_SHOT_ENTRY_SIZE = 32;
/** `BowChargeTable[117]`: four `BowChargeID`s per entry. */
export const BOW_CHARGE_COUNT = 117;
export const BOW_CHARGE_ENTRY_SIZE = 4;
/** `BGModTable`: four mod types of five levels, each a pointer to a `BGModLevel`. */
export const BOWGUN_MOD_TYPES = 4;
export const BOWGUN_MOD_LEVELS = 5;
export const BOWGUN_MOD_LEVEL_SIZE = 24;

/** `BGShotTable`, each row 32 u8 capacities in `SHOT_COAT_FIELDS` order. */
export function readBowgunShotTable(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): number[][] {
  const base = resolveTableOffset("bowgunShotTable", reader, resolver);
  const rows: number[][] = [];
  for (let i = 0; i < BOWGUN_SHOT_COUNT; i++) {
    const off = base + i * BOWGUN_SHOT_ENTRY_SIZE;
    const row: number[] = [];
    for (let b = 0; b < BOWGUN_SHOT_ENTRY_SIZE; b++) row.push(reader.u8(off + b));
    rows.push(row);
  }
  return rows;
}

/** `BowChargeTable`, each row four `BowChargeID` values (charge levels 1 to 4). */
export function readBowChargeTable(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): number[][] {
  const base = resolveTableOffset("bowChargeTable", reader, resolver);
  const rows: number[][] = [];
  for (let i = 0; i < BOW_CHARGE_COUNT; i++) {
    const off = base + i * BOW_CHARGE_ENTRY_SIZE;
    rows.push([reader.u8(off), reader.u8(off + 1), reader.u8(off + 2), reader.u8(off + 3)]);
  }
  return rows;
}

export interface BowgunModLevel {
  /** The raw u32 pointer as stored on disc. */
  pointer: number;
  /** File offset the pointer resolves to, or null when it falls outside the EBOOT. */
  offset: number | null;
  attackIncrease: number | null;
  speed: number | null;
  distanceDeviation: number | null;
  dropoffSpeed: number | null;
  horizontalDeviation: number | null;
  efxTiming: number | null;
}

/**
 * `BGModTable`: `[modType][level]`. The table holds pointers, so it is
 * found next to the sharpness table (its offset from it is the same on JP
 * and EU, see `sharpnessVaddrBase()`), not through `bowgunModTable`, whose
 * EU signature resolves to the pointed-to pool instead.
 */
export function readBowgunModTable(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): BowgunModLevel[][] {
  const sharpness = resolveTableOffset("sharpnessTable", reader, resolver);
  const tableOffset =
    sharpness + (JP_TABLE_ADDRESSES.bowgunModTable - JP_TABLE_ADDRESSES.sharpnessTable);
  const vaddrBase = sharpnessVaddrBase(sharpness, reader);
  const out: BowgunModLevel[][] = [];
  for (let t = 0; t < BOWGUN_MOD_TYPES; t++) {
    const levels: BowgunModLevel[] = [];
    for (let l = 0; l < BOWGUN_MOD_LEVELS; l++) {
      const pointer = reader.u32(tableOffset + (t * BOWGUN_MOD_LEVELS + l) * 4);
      const offset = pointer - vaddrBase;
      const valid =
        pointer !== 0 && offset >= 0 && offset + BOWGUN_MOD_LEVEL_SIZE <= reader.buf.length;
      levels.push({
        pointer,
        offset: valid ? offset : null,
        attackIncrease: valid ? reader.u32(offset) : null,
        speed: valid ? reader.f32(offset + 4) : null,
        distanceDeviation: valid ? reader.f32(offset + 8) : null,
        dropoffSpeed: valid ? reader.f32(offset + 12) : null,
        horizontalDeviation: valid ? reader.f32(offset + 16) : null,
        efxTiming: valid ? reader.f32(offset + 20) : null,
      });
    }
    out.push(levels);
  }
  return out;
}
