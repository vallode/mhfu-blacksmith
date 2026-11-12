/**
 * Which description each piece of equipment shows. The str_tbl message
 * files (strings/disc-text.ts) hold fewer descriptions than names: a weapon
 * and its upgrade often share one (Carbalite Sword and Carbalite Sword+), as
 * do an armor piece and its variants. The EBOOT maps each equipment ID to its
 * description's index in seven u16 arrays, one after the other, each starting
 * on a 4-byte boundary:
 *
 *   blademaster 1150, gunner 354, head 436, chest 420, arm 411, waist 409,
 *   leg 420
 *
 * (the same counts and order as the equipment name tables). Index 0 is the
 * "Nothing equipped." entry. On the EU EBOOT the block starts at 0x1987b0
 * (`equipmentDescriptions` in eu-signatures.ts), and in every array the
 * largest index is exactly its description table's last entry.
 */
import type { BinaryReader } from "../binary/reader.js";

export const DESCRIPTION_INDEX_SLOTS = [
  "blademaster",
  "gunner",
  "head",
  "chest",
  "arm",
  "waist",
  "leg",
] as const;
export type DescriptionIndexSlot = (typeof DESCRIPTION_INDEX_SLOTS)[number];

/** Entries per array: the number of equipment IDs of each kind, ID 0 included. */
export const DESCRIPTION_INDEX_COUNTS: Readonly<Record<DescriptionIndexSlot, number>> = {
  blademaster: 1150,
  gunner: 354,
  head: 436,
  chest: 420,
  arm: 411,
  waist: 409,
  leg: 420,
};

export type DescriptionIndexes = Record<DescriptionIndexSlot, number[]>;

/** The seven arrays, read from `offset` (the blademaster array's start). */
export function readDescriptionIndexes(reader: BinaryReader, offset: number): DescriptionIndexes {
  const out = {} as DescriptionIndexes;
  let at = offset;
  for (const slot of DESCRIPTION_INDEX_SLOTS) {
    const count = DESCRIPTION_INDEX_COUNTS[slot];
    out[slot] = Array.from({ length: count }, (_, i) => reader.u16(at + i * 2));
    at = (at + count * 2 + 3) & ~3;
  }
  return out;
}
