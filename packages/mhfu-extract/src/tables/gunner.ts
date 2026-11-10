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
/**
 * `BGModTable`: four pointers, one per mod type (`WepGunValue.RangedPhysxTbl`),
 * each to five consecutive `BGModLevel`s (power barrel levels). The
 * vendored pattern declares 4 x 5 pointers, but on disc only the first four
 * u32s are pointers (each 5 x 24 bytes after the last), followed by 48
 * bytes of other data and then the rapid fire table.
 */
export const BOWGUN_MOD_TYPES = 4;
export const BOWGUN_MOD_LEVELS = 5;
export const BOWGUN_MOD_LEVEL_SIZE = 24;
/** Bytes from `BGModTable` to the rapid fire table. */
export const RAPID_FIRE_TABLE_OFFSET = 0x40;
/** `RapidFire.WeaponID` value that ends the rapid fire table. */
export const RAPID_FIRE_END = 999;
const RAPID_FIRE_MAX_ENTRIES = 354;

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
  attackIncrease: number;
  speed: number;
  distanceDeviation: number;
  dropoffSpeed: number;
  horizontalDeviation: number;
  efxTiming: number;
}

/**
 * File offset of `BGModTable`. The table holds pointers, so it is found
 * next to the sharpness table (same distance on JP and EU, see
 * `sharpnessVaddrBase()`), not through `bowgunModTable`, whose EU
 * signature resolves to the pointed-to pool instead.
 */
function bowgunModTableOffset(reader: BinaryReader, resolver?: TableAddressResolver): number {
  const sharpness = resolveTableOffset("sharpnessTable", reader, resolver);
  return sharpness + (JP_TABLE_ADDRESSES.bowgunModTable - JP_TABLE_ADDRESSES.sharpnessTable);
}

/**
 * `BGModTable` as `[modType][level]`. A pointer that falls outside the
 * EBOOT (zeroed synthetic fixtures) gives an empty list for that type.
 */
export function readBowgunModTable(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): BowgunModLevel[][] {
  const sharpness = resolveTableOffset("sharpnessTable", reader, resolver);
  const tableOffset = bowgunModTableOffset(reader, resolver);
  const vaddrBase = sharpnessVaddrBase(sharpness, reader);
  const out: BowgunModLevel[][] = [];
  for (let t = 0; t < BOWGUN_MOD_TYPES; t++) {
    const pointer = reader.u32(tableOffset + t * 4);
    const base = pointer - vaddrBase;
    const end = base + BOWGUN_MOD_LEVELS * BOWGUN_MOD_LEVEL_SIZE;
    if (pointer === 0 || base < 0 || end > reader.buf.length) {
      out.push([]);
      continue;
    }
    const levels: BowgunModLevel[] = [];
    for (let l = 0; l < BOWGUN_MOD_LEVELS; l++) {
      const off = base + l * BOWGUN_MOD_LEVEL_SIZE;
      levels.push({
        attackIncrease: reader.u32(off),
        speed: reader.f32(off + 4),
        distanceDeviation: reader.f32(off + 8),
        dropoffSpeed: reader.f32(off + 12),
        horizontalDeviation: reader.f32(off + 16),
        efxTiming: reader.f32(off + 20),
      });
    }
    out.push(levels);
  }
  return out;
}

/**
 * Light bowgun rapid fire: `{ u32 WeaponID, u32 flags }` pairs, ending at
 * `WeaponID` 999. `WeaponID` is the `WepGunID` index; the flag bits are
 * `RAPID_FIRE_BITS` (their own layout, not `ShotCoat`'s). Not in the
 * vendored pattern: found by searching the EBOOT for the gunner indices the
 * site lists with rapid fire (vallode/mhfu-blacksmith#32).
 */
export function readRapidFireTable(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): Map<number, number> {
  const out = new Map<number, number>();
  let off = bowgunModTableOffset(reader, resolver) + RAPID_FIRE_TABLE_OFFSET;
  for (let i = 0; i < RAPID_FIRE_MAX_ENTRIES && off + 8 <= reader.buf.length; i++, off += 8) {
    const weapon = reader.u32(off);
    if (weapon === RAPID_FIRE_END) break;
    const flags = reader.u32(off + 4);
    if (flags !== 0) out.set(weapon, flags);
  }
  return out;
}

/**
 * Rapid fire ammo per flag bit, in the site's spelling. Bits 1/2, 4/5,
 * 11/12 and 14/15 are two variants of the same ammo the site doesn't tell
 * apart (likely different shot counts).
 */
export const RAPID_FIRE_BITS: readonly string[] = [
  "Normal S Lv1",
  "Normal S Lv2",
  "Normal S Lv2",
  "Normal S Lv3",
  "Pierce S Lv1",
  "Pierce S Lv1",
  "Pierce S Lv2",
  "Pierce S Lv3",
  "Pellet S Lv1",
  "Pellet S Lv2",
  "Pellet S Lv3",
  "Crag S Lv1",
  "Crag S Lv1",
  "Clust S Lv1",
  "Flaming S",
  "Flaming S",
  "Water S",
  "Thunder S",
  "Freeze S",
  "Dragon S",
  "Recov S Lv1",
  "Poison S",
];
