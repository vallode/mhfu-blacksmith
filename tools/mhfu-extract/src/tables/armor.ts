/**
 * Armor value struct reader, transcribed from `ArmorValuePTR`/`ArmorValue`
 * in vendor/mhp2g-patterns/patterns/eboot.hexpat — MIT, see ../../NOTICE.md.
 *
 * `ArmorValuePTR` is five *single* pointers (one per armor slot), each
 * pointing to that slot's own contiguous array of 40-byte `ArmorValue`
 * structs elsewhere in the EBOOT — NOT, as the ImHex `Type *name[N] : u32`
 * syntax might suggest at a glance, N separate pointers stored inline.
 * Confirmed against a real EBOOT: only 5 plausible-looking vaddrs exist
 * before the next declared table (`Mod2WepType`) starts just 20 bytes later,
 * and dereferencing each as an array base yields a clean, plausible
 * defense/price progression (dummy armor 0, then a starter piece at
 * price=300/defense=2, then price=600/defense=4, ...).
 */
import { BinaryReader, readPointer } from "../binary/reader.js";
import { ARMOR_ENTRY_SIZE, JP_BASE_ADDRESS, TABLE_COUNTS, tableOffset } from "./offsets.js";

export const ARMOR_SLOTS = ["head", "chest", "arm", "waist", "leg"] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];

/** Pointer-array order and counts within ArmorValuePTR — must match eboot.hexpat exactly. */
const ARMOR_SLOT_COUNTS: Record<ArmorSlot, number> = {
  head: TABLE_COUNTS.headArmor,
  chest: TABLE_COUNTS.chestArmor,
  arm: TABLE_COUNTS.armArmor,
  waist: TABLE_COUNTS.waistArmor,
  leg: TABLE_COUNTS.legArmor,
};

export interface ArmorResistances {
  fire: number;
  water: number;
  thunder: number;
  dragon: number;
  ice: number;
}

export interface ArmorSphereCaps {
  armorSphere: number;
  armorSpherePlus: number;
  hrdArmorSphere: number;
  hvyArmorSphere: number;
  rylArmorSphere: number;
  truArmorSphere: number;
  truMax: number;
}

export interface ArmorSkill {
  skill: number;
  amount: number;
}

export interface ArmorValueEntry {
  /** Index within this slot's pointer array, and into e.g. HeadArmorID for name lookup. */
  index: number;
  maleId: number;
  femaleId: number;
  hunterType: number;
  rarity: number;
  unkn1: number;
  price: number;
  defense: number;
  resistances: ArmorResistances;
  slots: number;
  colorSeries: number;
  sphereCaps: ArmorSphereCaps;
  unkn2: number;
  unkn3: number;
  skills: ArmorSkill[];
}

function readArmorValueEntry(reader: BinaryReader, off: number, index: number): ArmorValueEntry {
  const skills: ArmorSkill[] = [];
  for (let i = 0; i < 5; i++) {
    skills.push({ skill: reader.u8(off + 30 + i * 2), amount: reader.s8(off + 31 + i * 2) });
  }
  return {
    index,
    maleId: reader.u16(off + 0),
    femaleId: reader.u16(off + 2),
    hunterType: reader.u8(off + 4),
    rarity: reader.u8(off + 5),
    unkn1: reader.u16(off + 6),
    price: reader.u32(off + 8),
    defense: reader.s8(off + 12),
    resistances: {
      fire: reader.s8(off + 13),
      water: reader.s8(off + 14),
      thunder: reader.s8(off + 15),
      dragon: reader.s8(off + 16),
      ice: reader.s8(off + 17),
    },
    slots: reader.u8(off + 18),
    colorSeries: reader.u8(off + 19),
    sphereCaps: {
      armorSphere: reader.u8(off + 20),
      armorSpherePlus: reader.u8(off + 21),
      hrdArmorSphere: reader.u8(off + 22),
      hvyArmorSphere: reader.u8(off + 23),
      rylArmorSphere: reader.u8(off + 24),
      truArmorSphere: reader.u8(off + 25),
      truMax: reader.u8(off + 26),
    },
    unkn2: reader.u8(off + 27),
    unkn3: reader.u16(off + 28),
    skills,
  };
}

/** ArmorValues (ArmorValuePTR) @ 0x08975970 — five single pointers, one per armor slot. */
export function readArmorValues(reader: BinaryReader): Record<ArmorSlot, ArmorValueEntry[]> {
  const result = {} as Record<ArmorSlot, ArmorValueEntry[]>;
  const ptrTableOffset = tableOffset("armorValuePointers");
  ARMOR_SLOTS.forEach((slot, slotIndex) => {
    const count = ARMOR_SLOT_COUNTS[slot];
    const arrayBase = readPointer(reader, ptrTableOffset + slotIndex * 4, JP_BASE_ADDRESS);
    const entries: ArmorValueEntry[] = [];
    for (let i = 0; i < count; i++) {
      entries.push(readArmorValueEntry(reader, arrayBase + i * ARMOR_ENTRY_SIZE, i));
    }
    result[slot] = entries;
  });
  return result;
}

/** Exported for tests/validation — the byte size of one ArmorValue struct. */
export const ARMOR_VALUE_ENTRY_SIZE = ARMOR_ENTRY_SIZE;
