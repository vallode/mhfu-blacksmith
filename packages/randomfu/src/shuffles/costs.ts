/**
 * Crafting costs. The zenny a weapon, armor piece or decoration costs to
 * craft or upgrade is half its `price` field (mhfu-extract's
 * `emit/common.ts` `halveCost`), a u32 in each equipment record:
 *
 * - `WepBMValues` / `WepGunValues` (24 / 28 bytes): price at +4
 * - `ArmorValues` per slot (40 bytes): price at +8
 * - `DecorationValues` (item records, 24 bytes): price at +12
 *
 * Each price is multiplied by a random factor within the spread and rounded
 * so the cost stays a multiple of 10z. A decoration's price is also its
 * item's sell price, so that changes with it.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { DECORATION_ITEM_ID_OFFSET } from "mhfu-extract/src/emit/decorations.js";
import type { NameTable } from "mhfu-extract/src/strings/names.js";
import {
  ARMOR_SLOT_COUNTS,
  ARMOR_SLOTS,
  armorValuesOffsets,
  type ArmorSlot,
} from "mhfu-extract/src/tables/armor.js";
import {
  ARMOR_ENTRY_SIZE,
  ITEM_ENTRY_SIZE,
  TABLE_COUNTS,
  WEAPON_BM_ENTRY_SIZE,
  WEAPON_GUN_ENTRY_SIZE,
  resolveTableOffset,
} from "mhfu-extract/src/tables/offsets.js";
import type { TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import type { Edits } from "../edits.js";
import { itemName, tableName } from "../names.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport } from "./shuffle.js";

export interface PriceSlot {
  name: string;
  kind: "Weapon" | "Armor" | "Decoration";
  /** EBOOT file offset of the u32 price. */
  offset: number;
  price: number;
}

const ARMOR_NAME_TABLES: Record<ArmorSlot, NameTable> = {
  head: "HeadArmorID",
  chest: "ChestArmorID",
  arm: "ArmArmorID",
  waist: "WaistArmorID",
  leg: "LegArmorID",
};

/** Lowest price written: a 10z cost. */
const MIN_PRICE = 20;

export function collectPriceSlots(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
): PriceSlot[] {
  const reader = new BinaryReader(eboot);
  const slots: PriceSlot[] = [];
  const add = (kind: PriceSlot["kind"], name: string | null, offset: number): void => {
    const price = reader.u32(offset);
    if (name && price > 0) slots.push({ name, kind, offset, price });
  };

  for (const [table, names, size, count] of [
    ["weaponsBlademaster", "WepBMID", WEAPON_BM_ENTRY_SIZE, TABLE_COUNTS.weaponsBlademaster],
    ["weaponsGunner", "WepGunID", WEAPON_GUN_ENTRY_SIZE, TABLE_COUNTS.weaponsGunner],
  ] as const) {
    const base = resolveTableOffset(table, reader, resolver);
    for (let i = 1; i < count; i++) add("Weapon", tableName(names, i), base + i * size + 4);
  }

  const armor = armorValuesOffsets(reader, resolver);
  for (const slot of ARMOR_SLOTS) {
    for (let i = 1; i < ARMOR_SLOT_COUNTS[slot]; i++) {
      add("Armor", tableName(ARMOR_NAME_TABLES[slot], i), armor[slot] + i * ARMOR_ENTRY_SIZE + 8);
    }
  }

  const decorations = resolveTableOffset("decorationValues", reader, resolver);
  for (let i = 0; i < TABLE_COUNTS.decorations; i++) {
    const name = itemName(i + DECORATION_ITEM_ID_OFFSET);
    add(
      "Decoration",
      name.startsWith("Item ") ? null : name,
      decorations + i * ITEM_ENTRY_SIZE + 12,
    );
  }
  return slots;
}

export function randomizeCosts(
  slots: readonly PriceSlot[],
  spread: number,
  rng: Rng,
  edits: Edits,
): ShuffleReport {
  const buf = edits.eboot();
  const lines = slots.map((slot) => {
    const factor = 1 - spread + rng.float() * 2 * spread;
    const price = Math.max(MIN_PRICE, Math.round((slot.price * factor) / 20) * 20);
    buf.writeUInt32LE(price, slot.offset);
    return {
      where: slot.kind,
      text: `${slot.name}: ${price / 2}z (was ${Math.round(slot.price / 2)}z)`,
    };
  });
  return {
    title: "Crafting costs",
    notes: [
      `Each weapon, armor piece and decoration costs ${Math.round((1 - spread) * 100)}% to ${Math.round((1 + spread) * 100)}% of its usual price, in steps of 10z.`,
      "A weapon's upgrade cost is its own price too, so it changes with it.",
    ],
    lines,
  };
}
