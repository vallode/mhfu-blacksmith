/**
 * Per-slot armor model IDs (`ArmorValue.MaleID`/`FemaleID`) and the
 * `player/{m,f}/<folder>/` model files they index.
 *
 * `ArmorValuePTR`'s five arrays are NOT in the order `tables/armor.ts`
 * labels them (head, chest, arm, waist, leg). Each array actually holds the
 * *next* slot's armor: the one labeled "chest" is helmets, "arm" is chest
 * plates, "waist" is gauntlets, "leg" is waist and "head" is leggings. So
 * the per-array counts rotate too (helmets are 436 entries, not 420).
 * Confirmed two independent ways on an EU EBOOT:
 *
 * - Stats: each array's (defense, slots, skills) match ~240 entries of the
 *   site's data for the rotated slot and only a handful for its own label.
 * - Models: each array's highest male and female IDs are exactly the last
 *   file in the rotated slot's folder (e.g. the "leg" array's maxima 296/295
 *   are `m_wst296`/`f_wst295`, the last waist models), and with the rotated
 *   counts no ID falls outside its folder.
 *
 * `tables/armor.ts` (and so `emit/armor.ts`) still uses the unrotated
 * labels; this module reads only the model IDs, with the corrected order.
 */
import { BinaryReader, readPointer } from "../binary/reader.js";
import { ARMOR_SLOT_TABLE_NAMES, type ArmorSlot } from "./armor.js";
import { ARMOR_ENTRY_SIZE, JP_BASE_ADDRESS, tableOffset } from "./offsets.js";
import type { TableAddressResolver } from "./resolver.js";

/** Armor slots as named in data/armor/ and data/equipment-ids.json. */
export type SiteArmorSlot = "helmet" | "plate" | "gauntlets" | "waist" | "leggings";

interface SlotLayout {
  /** The `ArmorValuePTR` array (by tables/armor.ts' label) that holds this slot. */
  array: ArmorSlot;
  count: number;
  /** Model folder under `player/m/` and `player/f/`. */
  folder: string;
}

export const ARMOR_MODEL_LAYOUT: Record<SiteArmorSlot, SlotLayout> = {
  helmet: { array: "chest", count: 436, folder: "hair" },
  plate: { array: "arm", count: 420, folder: "body" },
  gauntlets: { array: "waist", count: 411, folder: "arm" },
  waist: { array: "leg", count: 409, folder: "wst" },
  leggings: { array: "head", count: 420, folder: "reg" },
};

/** Position of each labeled array within the JP `ArmorValuePTR` pointer table. */
const POINTER_INDEX: Record<ArmorSlot, number> = { head: 0, chest: 1, arm: 2, waist: 3, leg: 4 };

export interface ArmorModelIds {
  /** Equipment ID, i.e. the index into data/equipment-ids.json's slot list. */
  index: number;
  maleId: number;
  femaleId: number;
}

export function readArmorModelIds(reader: BinaryReader, resolver?: TableAddressResolver): Record<SiteArmorSlot, ArmorModelIds[]> {
  const ptrTable = resolver ? undefined : tableOffset("armorValuePointers");
  const result = {} as Record<SiteArmorSlot, ArmorModelIds[]>;
  for (const [slot, layout] of Object.entries(ARMOR_MODEL_LAYOUT) as [SiteArmorSlot, SlotLayout][]) {
    const base = resolver
      ? resolver.resolve(ARMOR_SLOT_TABLE_NAMES[layout.array], reader.buf)
      : readPointer(reader, ptrTable! + POINTER_INDEX[layout.array] * 4, JP_BASE_ADDRESS);
    const entries: ArmorModelIds[] = [];
    for (let i = 0; i < layout.count; i++) {
      const at = base + i * ARMOR_ENTRY_SIZE;
      entries.push({ index: i, maleId: reader.u16(at), femaleId: reader.u16(at + 2) });
    }
    result[slot] = entries;
  }
  return result;
}

/** DATA.BIN path of an armor model, e.g. `player/m/wst/m_wst288.pac`. */
export function armorModelPath(slot: SiteArmorSlot, sex: "m" | "f", id: number): string {
  const folder = ARMOR_MODEL_LAYOUT[slot].folder;
  return `player/${sex}/${folder}/${sex}_${folder}${String(id).padStart(3, "0")}.pac`;
}
