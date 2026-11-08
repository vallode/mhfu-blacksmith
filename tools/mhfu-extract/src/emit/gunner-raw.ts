/**
 * `extract --raw`: a numbers-only dump of what gunner extraction reads, for
 * correlating raw values against committed `data/weapons/{light-bowgun,
 * heavy-bowgun,bow}.json` without shipping disc bytes
 * (vallode/mhfu-blacksmith#32).
 *
 * Holds `BGShotTable`, `BowChargeTable` and `BGModTable` in full, the u8
 * bytes from 1 KiB before the shot table to 1 KiB after the dual attribute
 * table (the gunner tables sit together in that range), and per gunner
 * weapon its `index` (the `WepGunID` enum position), type and every
 * `WepGunValue` field.
 *
 * `probes` searches the whole EBOOT for runs of gunner weapon indices, in
 * case rapid fire or bow coating bonuses live in a table keyed by weapon
 * rather than in `WepGunValue` itself. Each hit lists its offset, stride and
 * the u8 bytes around it.
 */
import type { BinaryReader } from "../binary/reader.js";
import { JP_TABLE_ADDRESSES, resolveTableOffset } from "../tables/offsets.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import {
  readBowChargeTable,
  readBowgunModTable,
  readBowgunShotTable,
  type BowgunModLevel,
} from "../tables/gunner.js";
import { readGunnerWeapons, readModelToWeaponType } from "../tables/weapons.js";

export interface ProbeHit {
  offset: number;
  width: 1 | 2;
  stride: number;
  /** u8 bytes from `windowStart`. */
  windowStart: number;
  bytes: number[];
}

export interface GunnerRawDump {
  shotTableOffset: number;
  chargeTableOffset: number;
  shotTable: number[][];
  bowCharges: number[][];
  bowgunMods: BowgunModLevel[][];
  window: { start: number; u8: number[] };
  weapons: ({ index: number; type: string | null } & Record<string, number | string | null>)[];
  probes: Record<string, ProbeHit[]>;
}

/**
 * Gunner indices to search for: the first light bowguns the site lists
 * with rapid fire, and the first bows it lists with a coating bonus
 * ("Poison Add" and so on), each in index order.
 */
const PROBES: Record<string, number[]> = {
  rapidFireLightBowguns: [2, 3, 8, 10, 11],
  coatingBonusBows: [145, 146, 147],
  coatingBonusBowsG: [303, 304],
  sleepBonusBows: [334, 335, 336, 337],
};

const MAX_HITS = 40;

function u8Window(reader: BinaryReader, start: number, end: number): number[] {
  const out: number[] = [];
  for (let off = Math.max(0, start); off < Math.min(reader.buf.length, end); off++) {
    out.push(reader.u8(off));
  }
  return out;
}

function probe(reader: BinaryReader, values: number[]): ProbeHit[] {
  const hits: ProbeHit[] = [];
  const buf = reader.buf;
  for (const width of [1, 2] as const) {
    for (let stride = width; stride <= 40; stride++) {
      const span = stride * (values.length - 1) + width;
      for (let off = 0; off + span <= buf.length; off++) {
        let ok = true;
        for (let k = 0; k < values.length && ok; k++) {
          const at = off + k * stride;
          const v = width === 1 ? buf[at]! : buf.readUInt16LE(at);
          ok = v === values[k];
        }
        if (!ok) continue;
        const windowStart = Math.max(0, off - 64);
        hits.push({
          offset: off,
          width,
          stride,
          windowStart,
          bytes: u8Window(reader, windowStart, off + span + 512),
        });
        if (hits.length >= MAX_HITS) return hits;
      }
    }
  }
  return hits;
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

  const probes: Record<string, ProbeHit[]> = {};
  for (const [name, values] of Object.entries(PROBES)) probes[name] = probe(reader, values);

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
    probes,
  };
}
