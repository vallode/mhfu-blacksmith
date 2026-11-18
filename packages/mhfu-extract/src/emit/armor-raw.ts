/**
 * `extract --raw`: a numbers-only dump of every `ArmorValue` struct, for
 * correlating raw fields against committed `data/armor/*.json` without
 * shipping disc bytes (vallode/mhfu-blacksmith#10, max defence; and the
 * `sex`/`hunter_type` recheck).
 *
 * Per piece: its slot, `index` (the `HeadArmorID`/... enum position), the
 * resolved name, every byte of the 40-byte struct, and the decoded fields.
 * Names come from the enum tables already in this repo (`strings/enums.ts`),
 * not from the disc.
 *
 * Also dumped, as candidates for the defence-per-upgrade-level data:
 * - the seven armor sphere `EquipUpgrade` entries at the end of
 *   `EquipmentUpgrade` and the 49 unnamed `u32`s before them;
 * - `windowBytes` of raw bytes after each slot's array (the leg array is the
 *   last one; the others are followed directly by the next slot) and before
 *   the head array, where any neighbouring armor table would sit.
 */
import { readPointer, type BinaryReader } from "../binary/reader.js";
import {
  ARMOR_SLOTS,
  ARMOR_SLOT_COUNTS,
  ARMOR_SLOT_TABLE_NAMES,
  ARMOR_POINTER_INDEX,
  readArmorValues,
  type ArmorSlot,
} from "../tables/armor.js";
import {
  ARMOR_ENTRY_SIZE,
  EQUIP_UPGRADE_ENTRY_SIZE,
  JP_BASE_ADDRESS,
  TABLE_COUNTS,
  resolveTableOffset,
  tableOffset,
} from "../tables/offsets.js";
import { readEquipmentUpgrade, type EquipUpgradeEntry } from "../tables/recipes.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import { getNameResolver, type NameTable } from "../strings/names.js";

const SLOT_TO_NAME_TABLE: Record<ArmorSlot, NameTable> = {
  head: "HeadArmorID",
  chest: "ChestArmorID",
  arm: "ArmArmorID",
  waist: "WaistArmorID",
  leg: "LegArmorID",
};

/** Bytes of context dumped around the armor arrays. */
const WINDOW_BYTES = 4096;

export interface RawArmorPiece {
  slot: ArmorSlot;
  index: number;
  name: string | null;
  bytes: number[];
  fields: Record<string, number>;
}

export interface RawByteWindow {
  label: string;
  /** EBOOT file offset of `bytes[0]`. */
  offset: number;
  bytes: number[];
}

export interface ArmorRawDump {
  arrayOffsets: Record<ArmorSlot, number>;
  pieces: RawArmorPiece[];
  sphereUpgrades: { offset: number; entries: (EquipUpgradeEntry & { bytes: number[] })[] };
  equipUpgradeUnknown: { offset: number; u32: number[] };
  windows: RawByteWindow[];
}

function bytesOf(reader: BinaryReader, offset: number, size: number): number[] {
  const out: number[] = [];
  const end = Math.min(offset + size, reader.buf.length);
  for (let i = Math.max(0, offset); i < end; i++) out.push(reader.u8(i));
  return out;
}

function arrayOffset(
  reader: BinaryReader,
  slot: ArmorSlot,
  resolver?: TableAddressResolver,
): number {
  if (resolver) return resolver.resolve(ARMOR_SLOT_TABLE_NAMES[slot], reader.buf);
  const ptrTable = tableOffset("armorValuePointers");
  return readPointer(reader, ptrTable + ARMOR_POINTER_INDEX[slot] * 4, JP_BASE_ADDRESS);
}

export function dumpArmorRaw(reader: BinaryReader, resolver?: TableAddressResolver): ArmorRawDump {
  const names = getNameResolver();
  const values = readArmorValues(reader, resolver);
  const arrayOffsets = {} as Record<ArmorSlot, number>;
  const pieces: RawArmorPiece[] = [];
  const windows: RawByteWindow[] = [];

  for (const slot of ARMOR_SLOTS) {
    const base = arrayOffset(reader, slot, resolver);
    arrayOffsets[slot] = base;
    for (const entry of values[slot]) {
      const { index, resistances, sphereCaps, skills, ...scalars } = entry;
      const fields: Record<string, number> = { ...scalars };
      for (const [k, v] of Object.entries(resistances)) fields[`res_${k}`] = v;
      for (const [k, v] of Object.entries(sphereCaps)) fields[`cap_${k}`] = v;
      skills.forEach((s, i) => {
        fields[`skill${i}`] = s.skill;
        fields[`skill${i}_amount`] = s.amount;
      });
      pieces.push({
        slot,
        index,
        name: names.resolve(SLOT_TO_NAME_TABLE[slot], index) ?? null,
        bytes: bytesOf(reader, base + index * ARMOR_ENTRY_SIZE, ARMOR_ENTRY_SIZE),
        fields,
      });
    }
    const end = base + ARMOR_SLOT_COUNTS[slot] * ARMOR_ENTRY_SIZE;
    windows.push({
      label: `after-${slot}`,
      offset: end,
      bytes: bytesOf(reader, end, WINDOW_BYTES),
    });
  }
  const headBase = arrayOffsets.head;
  windows.push({
    label: "before-head",
    offset: headBase - WINDOW_BYTES,
    bytes: bytesOf(reader, headBase - WINDOW_BYTES, WINDOW_BYTES),
  });

  // Mirrors readEquipmentUpgrade()'s walk to locate the unnamed u32s and spheres.
  const upgradeBase = resolveTableOffset("equipmentUpgrade", reader, resolver);
  const unknownOffset =
    upgradeBase +
    (1 + TABLE_COUNTS.weaponsBlademaster + TABLE_COUNTS.weaponsGunner) * EQUIP_UPGRADE_ENTRY_SIZE;
  const sphereOffset = unknownOffset + 49 * 4;
  const u32: number[] = [];
  for (let i = 0; i < 49; i++) u32.push(reader.u32(unknownOffset + i * 4));
  const spheres = readEquipmentUpgrade(reader, resolver).armorSphere.map((e) => ({
    ...e,
    bytes: bytesOf(
      reader,
      sphereOffset + e.index * EQUIP_UPGRADE_ENTRY_SIZE,
      EQUIP_UPGRADE_ENTRY_SIZE,
    ),
  }));
  const afterSpheres = sphereOffset + 7 * EQUIP_UPGRADE_ENTRY_SIZE;
  windows.push({
    label: "after-sphere-upgrades",
    offset: afterSpheres,
    bytes: bytesOf(reader, afterSpheres, WINDOW_BYTES),
  });

  return {
    arrayOffsets,
    pieces,
    sphereUpgrades: { offset: sphereOffset, entries: spheres },
    equipUpgradeUnknown: { offset: unknownOffset, u32 },
    windows,
  };
}
