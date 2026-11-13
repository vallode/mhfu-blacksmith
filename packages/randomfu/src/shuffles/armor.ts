/**
 * Armor progression: which armor piece you get at each place in the smithy.
 *
 * A place is an armor create entry (`EquipmentCreate`'s head, chest, arm,
 * waist and leg sections). Its `equipId` is the piece's index in that
 * slot's `ArmorValues` array (mhfu-extract's `tables/armor.ts`). This
 * shuffle gives each piece's places to another piece of the same slot,
 * rarity and `HunterType`:
 *
 * - `HunterType` is a bit field (1 male, 2 female, 4 Blademaster,
 *   8 Gunner; mhfu-extract's `emit/armor.ts`), so a piece only trades with
 *   pieces wearable by the same sexes and the same hunter types. A place
 *   both sexes can use never gets a one-sex piece.
 * - One substitution per slot is applied to every create entry, so a piece
 *   with two entries (an alternate recipe) still has both, as the new
 *   piece.
 * - A place keeps its materials and everything else in its entry; a piece
 *   keeps its own stats, skills, slots, sphere caps and price.
 *
 * Left alone: the dummy piece 0 (unused entries), pieces no create entry
 * makes, IDs past the slot's array and pieces with no sex or no hunter type
 * bit (not real pieces).
 *
 * The smithy's store (`mhfu-extract/src/shops/equipment.ts`, in
 * `lobby_task.ovl`) follows the shuffle, as it does for weapons: where it
 * sold a piece, it sells the piece now in that piece's places (the same
 * slot, rarity and wearers). Pieces it sells that the shuffle leaves alone
 * (no create entry makes them) stay.
 *
 * Mixing Blademaster and Gunner pieces isn't offered: nothing on a disc has
 * shown how the smithy lists a place whose piece is for the other type.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { HUNTER_TYPE_BITS } from "mhfu-extract/src/emit/armor.js";
import { ARMOR_CATEGORY } from "mhfu-extract/src/shops/equipment.js";
import type { NameTable } from "mhfu-extract/src/strings/names.js";
import {
  ARMOR_SLOT_COUNTS,
  ARMOR_SLOTS,
  armorValuesOffsets,
  type ArmorSlot,
} from "mhfu-extract/src/tables/armor.js";
import { ARMOR_ENTRY_SIZE, EQUIP_CREATE_ENTRY_SIZE } from "mhfu-extract/src/tables/offsets.js";
import { equipmentCreateLayout } from "mhfu-extract/src/tables/recipes.js";
import type { TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import type { Edits } from "../edits.js";
import { tableName } from "../names.js";
import type { Rng } from "../rng.js";
import { permuteWithinGroups, type ShuffleReport } from "./shuffle.js";
import { followStore, type SmithyStore } from "./store.js";

const HUNTER_TYPE_AT = 4;
const RARITY_AT = 5;

export const SLOT_NAMES: Record<ArmorSlot, { table: NameTable; label: string }> = {
  head: { table: "HeadArmorID", label: "Head" },
  chest: { table: "ChestArmorID", label: "Chest" },
  arm: { table: "ArmArmorID", label: "Arms" },
  waist: { table: "WaistArmorID", label: "Waist" },
  leg: { table: "LegArmorID", label: "Legs" },
};

/** Who can wear a piece, for the spoiler: "" when anyone can. */
function wearers(bits: number): string {
  const { male, female, blademaster, gunner } = HUNTER_TYPE_BITS;
  const parts: string[] = [];
  if (!(bits & gunner)) parts.push("Blademaster");
  if (!(bits & blademaster)) parts.push("Gunner");
  if (!(bits & female)) parts.push("male only");
  if (!(bits & male)) parts.push("female only");
  return parts.join(", ");
}

/** True if a piece has at least one sex bit and one hunter type bit. */
export function wearable(bits: number): boolean {
  const { male, female, blademaster, gunner } = HUNTER_TYPE_BITS;
  return (bits & (male | female)) !== 0 && (bits & (blademaster | gunner)) !== 0;
}

export function shuffleArmor(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
  rng: Rng,
  edits: Edits,
  /** The smithy's store, or null to leave it (none found on the disc). */
  store: SmithyStore | null,
): ShuffleReport {
  const reader = new BinaryReader(eboot);
  const create = equipmentCreateLayout(reader, resolver);
  const values = armorValuesOffsets(reader, resolver);
  const out = edits.eboot();
  const lines: { where: string; text: string; order: number }[] = [];
  let moved = 0;
  let pieces = 0;

  ARMOR_SLOTS.forEach((slot, slotIndex) => {
    const count = ARMOR_SLOT_COUNTS[slot];
    const { table, label } = SLOT_NAMES[slot];
    const name = (i: number) => tableName(table, i) ?? `${label} ${i}`;
    const valueAt = (i: number) => values[slot] + i * ARMOR_ENTRY_SIZE;
    const hunterType = (i: number) => reader.u8(valueAt(i) + HUNTER_TYPE_AT);
    const rarity = (i: number) => reader.u8(valueAt(i) + RARITY_AT);
    const { offset, count: entries } = create[slot];
    const entryAt = Array.from({ length: entries }, (_, i) => offset + i * EQUIP_CREATE_ENTRY_SIZE);

    const made = new Set(entryAt.map((at) => reader.u16(at + 2)));
    const shuffled = [...made]
      .filter((i) => i > 0 && i < count && wearable(hunterType(i)))
      .sort((a, b) => a - b);
    pieces += shuffled.length;

    const next = permuteWithinGroups(
      shuffled,
      (i) => `${rarity(i)}:${hunterType(i)}`,
      (i) => i,
      rng,
    );
    const sigma = new Map(shuffled.map((piece, k) => [piece, next[k]!]));

    for (const at of entryAt) {
      const piece = reader.u16(at + 2);
      out.writeUInt16LE(sigma.get(piece) ?? piece, at + 2);
    }

    // The store sells whatever is now in the places of what it sold.
    if (store) {
      followStore(
        store,
        ARMOR_CATEGORY[slot],
        (i) => sigma.get(i) ?? i,
        name,
        `Armor: ${label}`,
        edits,
      );
    }

    for (const piece of shuffled) {
      const now = sigma.get(piece)!;
      if (now === piece) continue;
      moved++;
      const who = wearers(hunterType(piece));
      lines.push({
        where: `${label}, rarity ${rarity(piece) + 1}`,
        text: `${name(piece)} -> ${name(now)}${who ? ` (${who})` : ""}`,
        order: slotIndex * 256 + rarity(piece),
      });
    }
  });

  return {
    title: "Armor progression",
    notes: [
      "Each line is a place in the smithy: you now get the second piece where you used to get the first.",
      "The new piece is for the same slot and rarity, and can be worn by the same hunters (Blademaster, Gunner or both; male, female or both).",
      "Places keep their materials; pieces keep their own stats, skills, slots and price. Where a piece had two recipes, both now make the same new piece.",
      `${moved} of ${pieces} pieces changed places.`,
    ],
    // By slot, then rarity (a stable sort keeps piece order within each).
    lines: lines.sort((a, b) => a.order - b.order).map(({ where, text }) => ({ where, text })),
  };
}
