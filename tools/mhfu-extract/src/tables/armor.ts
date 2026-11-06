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
 *
 * `armorValuePointers` is the one table in this pipeline `SignatureResolver`
 * can't resolve directly for a new region: its own bytes are 5 *pointers*
 * (absolute vaddrs), and pointer values are NOT region-independent (unlike
 * every other table's raw stat/id content) — the exact same problem
 * documented for `bowgunModTable` (also a pointer table) in README's
 * "Region support" section. The fix used here: skip resolving the pointer
 * table itself for a signature-based region, and instead resolve each
 * slot's *target* `ArmorValue` array directly (its content — defense,
 * price, skills — absolutely is region-independent, so the same signature
 * technique works once you point it at the right bytes). See
 * `ARMOR_SLOT_TABLE_NAMES` and `readArmorValues()`'s `resolver` parameter.
 */
import { BinaryReader, readPointer } from "../binary/reader.js";
import { ARMOR_ENTRY_SIZE, JP_BASE_ADDRESS, TABLE_COUNTS, tableOffset } from "./offsets.js";
import type { TableAddressResolver } from "./resolver.js";

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

/**
 * Synthetic per-slot "table" names for `TableAddressResolver`s that resolve
 * each slot's `ArmorValue` array directly, bypassing `armorValuePointers`'
 * pointer indirection entirely (see module doc comment above). Only
 * meaningful to a signature-based resolver (e.g. `MHP2G_EU_RESOLVER`,
 * games/mhp2g.ts) — JP's default path (no `resolver` passed to
 * `readArmorValues()`) never looks these up.
 */
export const ARMOR_SLOT_TABLE_NAMES: Record<ArmorSlot, string> = {
  head: "armorValuesHead",
  chest: "armorValuesChest",
  arm: "armorValuesArm",
  waist: "armorValuesWaist",
  leg: "armorValuesLeg",
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

/**
 * ArmorValues (ArmorValuePTR) @ 0x08975970 — five single pointers, one per
 * armor slot.
 *
 * `resolver` is optional and changes *how* each slot's array base is found:
 * - Omitted (JP default): exactly the original behavior — dereference
 *   `armorValuePointers`' pointer table via JP's static offset + `JP_BASE_ADDRESS`.
 * - Provided (e.g. `MHP2G_EU_RESOLVER`): resolves each slot's array
 *   *directly* via `ARMOR_SLOT_TABLE_NAMES`, bypassing the pointer table —
 *   see module doc comment above for why armor needs this different
 *   strategy from every other table.
 */
export function readArmorValues(reader: BinaryReader, resolver?: TableAddressResolver): Record<ArmorSlot, ArmorValueEntry[]> {
  const result = {} as Record<ArmorSlot, ArmorValueEntry[]>;
  const ptrTableOffset = resolver ? undefined : tableOffset("armorValuePointers");
  ARMOR_SLOTS.forEach((slot, slotIndex) => {
    const count = ARMOR_SLOT_COUNTS[slot];
    const arrayBase = resolver
      ? resolver.resolve(ARMOR_SLOT_TABLE_NAMES[slot], reader.buf)
      : readPointer(reader, ptrTableOffset! + slotIndex * 4, JP_BASE_ADDRESS);
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
