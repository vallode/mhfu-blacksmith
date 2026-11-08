/**
 * Per-slot armor model IDs (`ArmorValue.MaleID`/`FemaleID`) and the
 * `player/{m,f}/<folder>/` model files they index.
 *
 * Reads the same arrays as `tables/armor.ts`, through its
 * `ARMOR_POINTER_INDEX` / `ARMOR_SLOT_TABLE_NAMES`, so each site slot gets
 * its own array and count. Confirmed on an EU EBOOT: each array's highest
 * male and female IDs are exactly the last file in that slot's folder (e.g.
 * waist's 296/295 are `m_wst296`/`f_wst295`), and no ID falls outside it.
 */
import { BinaryReader, readPointer } from "../binary/reader.js";
import {
  ARMOR_POINTER_INDEX,
  ARMOR_SLOT_COUNTS,
  ARMOR_SLOT_TABLE_NAMES,
  type ArmorSlot,
} from "./armor.js";
import { ARMOR_ENTRY_SIZE, JP_BASE_ADDRESS, tableOffset } from "./offsets.js";
import type { TableAddressResolver } from "./resolver.js";

/** Armor slots as named in data/armor/ and data/equipment-ids.json. */
export type SiteArmorSlot = "helmet" | "plate" | "gauntlets" | "waist" | "leggings";

interface SlotLayout {
  /** This slot's name in tables/armor.ts. */
  array: ArmorSlot;
  count: number;
  /** Model folder under `player/m/` and `player/f/`. */
  folder: string;
}

export const ARMOR_MODEL_LAYOUT: Record<SiteArmorSlot, SlotLayout> = {
  helmet: { array: "head", count: ARMOR_SLOT_COUNTS.head, folder: "hair" },
  plate: { array: "chest", count: ARMOR_SLOT_COUNTS.chest, folder: "body" },
  gauntlets: { array: "arm", count: ARMOR_SLOT_COUNTS.arm, folder: "arm" },
  waist: { array: "waist", count: ARMOR_SLOT_COUNTS.waist, folder: "wst" },
  leggings: { array: "leg", count: ARMOR_SLOT_COUNTS.leg, folder: "reg" },
};

export interface ArmorModelIds {
  /** Equipment ID, i.e. the index into data/equipment-ids.json's slot list. */
  index: number;
  maleId: number;
  femaleId: number;
}

export function readArmorModelIds(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): Record<SiteArmorSlot, ArmorModelIds[]> {
  const ptrTable = resolver ? undefined : tableOffset("armorValuePointers");
  const result = {} as Record<SiteArmorSlot, ArmorModelIds[]>;
  for (const [slot, layout] of Object.entries(ARMOR_MODEL_LAYOUT) as [
    SiteArmorSlot,
    SlotLayout,
  ][]) {
    const base = resolver
      ? resolver.resolve(ARMOR_SLOT_TABLE_NAMES[layout.array], reader.buf)
      : readPointer(reader, ptrTable! + ARMOR_POINTER_INDEX[layout.array] * 4, JP_BASE_ADDRESS);
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
