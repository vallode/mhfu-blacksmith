/**
 * `extract --raw`: a numbers-only dump of what gunner extraction reads, for
 * correlating raw values against committed `data/weapons/{light-bowgun,
 * heavy-bowgun,bow}.json` without shipping disc bytes
 * (vallode/mhfu-blacksmith#32).
 *
 * Holds `BGShotTable`, `BowChargeTable`, `BGModTable` and the rapid fire
 * table in full, the u8
 * bytes from 1 KiB before the shot table to 1 KiB after the dual attribute
 * table (the gunner tables sit together in that range), and per gunner
 * weapon its `index` (the `WepGunID` enum position), type and every
 * `WepGunValue` field.
 *
 * The rapid fire table is included as `[weapon index, flags]` pairs.
 */
import type { BinaryReader } from "../binary/reader.js";
import { JP_TABLE_ADDRESSES, resolveTableOffset } from "../tables/offsets.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import {
  readBowChargeTable,
  readBowgunModTable,
  readBowgunShotTable,
  readRapidFireTable,
  type BowgunModLevel,
} from "../tables/gunner.js";
import { readGunnerWeapons, readModelToWeaponType } from "../tables/weapons.js";

export interface GunnerRawDump {
  shotTableOffset: number;
  chargeTableOffset: number;
  shotTable: number[][];
  bowCharges: number[][];
  bowgunMods: BowgunModLevel[][];
  window: { start: number; u8: number[] };
  weapons: ({ index: number; type: string | null } & Record<string, number | string | null>)[];
  rapidFire: [number, number][];
}

function u8Window(reader: BinaryReader, start: number, end: number): number[] {
  const out: number[] = [];
  for (let off = Math.max(0, start); off < Math.min(reader.buf.length, end); off++) {
    out.push(reader.u8(off));
  }
  return out;
}

export function dumpGunnerRaw(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): GunnerRawDump {
  const shotTableOffset = resolveTableOffset("bowgunShotTable", reader, resolver);
  const chargeTableOffset = resolveTableOffset("bowChargeTable", reader, resolver);
  const windowEnd =
    shotTableOffset +
    (JP_TABLE_ADDRESSES.dualAttributeWeapons - JP_TABLE_ADDRESSES.bowgunShotTable) +
    15 * 10 +
    1024;
  const modelToType = readModelToWeaponType(reader, resolver);

  const weapons = readGunnerWeapons(reader, resolver).map((w) => ({
    ...w,
    type: modelToType[w.modelId] ?? null,
  }));

  return {
    shotTableOffset,
    chargeTableOffset,
    shotTable: readBowgunShotTable(reader, resolver),
    bowCharges: readBowChargeTable(reader, resolver),
    bowgunMods: readBowgunModTable(reader, resolver),
    window: {
      start: shotTableOffset - 1024,
      u8: u8Window(reader, shotTableOffset - 1024, windowEnd),
    },
    weapons,
    rapidFire: [...readRapidFireTable(reader, resolver)],
  };
}
