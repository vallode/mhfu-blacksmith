/**
 * `extract --raw`: a numbers-only dump of every weapon value struct, for
 * correlating raw fields against committed `data/weapons/*.json` without
 * shipping disc bytes (vallode/mhfu-blacksmith#33, affinity).
 *
 * Per weapon: its table (`bm` = `WepBMValues`, `gun` = `WepGunValues`),
 * `index` (the `WepBMID`/`WepGunID` enum position), the resolved name and
 * type, every byte of the struct, and the decoded fields. The class
 * modifier table is included too. Names come from the enum tables already
 * in this repo (`strings/enums.ts`), not from the disc.
 */
import type { BinaryReader } from "../binary/reader.js";
import {
  WEAPON_BM_ENTRY_SIZE,
  WEAPON_GUN_ENTRY_SIZE,
  resolveTableOffset,
  type TableName,
} from "../tables/offsets.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import {
  readBlademasterWeapons,
  readGunnerWeapons,
  readModelToWeaponType,
  readWeaponClassModifiers,
  type WeaponClassModifiers,
} from "../tables/weapons.js";
import { getNameResolver } from "../strings/names.js";

export interface RawWeapon {
  table: "bm" | "gun";
  index: number;
  name: string | null;
  type: string | null;
  bytes: number[];
  fields: Record<string, number>;
}

export interface WeaponsRawDump {
  classModifiers: WeaponClassModifiers;
  bmOffset: number;
  gunOffset: number;
  weapons: RawWeapon[];
}

function bytesOf(reader: BinaryReader, offset: number, size: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < size; i++) out.push(reader.u8(offset + i));
  return out;
}

export function dumpWeaponsRaw(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): WeaponsRawDump {
  const names = getNameResolver();
  const modelToType = readModelToWeaponType(reader, resolver);
  const offsetOf = (table: TableName) => resolveTableOffset(table, reader, resolver);
  const bmOffset = offsetOf("weaponsBlademaster");
  const gunOffset = offsetOf("weaponsGunner");

  const weapons: RawWeapon[] = [];
  for (const { index, ...fields } of readBlademasterWeapons(reader, resolver)) {
    weapons.push({
      table: "bm",
      index,
      name: names.resolve("WepBMID", index) ?? null,
      type: modelToType[fields.modelId] ?? null,
      bytes: bytesOf(reader, bmOffset + index * WEAPON_BM_ENTRY_SIZE, WEAPON_BM_ENTRY_SIZE),
      fields,
    });
  }
  for (const { index, ...fields } of readGunnerWeapons(reader, resolver)) {
    weapons.push({
      table: "gun",
      index,
      name: names.resolve("WepGunID", index) ?? null,
      type: modelToType[fields.modelId] ?? null,
      bytes: bytesOf(reader, gunOffset + index * WEAPON_GUN_ENTRY_SIZE, WEAPON_GUN_ENTRY_SIZE),
      fields,
    });
  }

  return {
    classModifiers: readWeaponClassModifiers(reader, resolver),
    bmOffset,
    gunOffset,
    weapons,
  };
}
