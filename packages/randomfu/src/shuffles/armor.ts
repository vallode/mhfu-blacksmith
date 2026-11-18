/**
 * Armor progression: which armor piece you get at each place in the smithy.
 *
 * A place is an armor create entry (`EquipmentCreate`'s head, chest, arm,
 * waist and leg sections). Its `equipId` is the piece's index in that
 * slot's `ArmorValues` array (mhfu-extract's `tables/armor.ts`). This
 * shuffle gives each piece's places to another piece of the same slot and
 * `HunterType`, and of the same rarity, the same rank (Low, High or G, by
 * `rankFromRarity`) or any rarity (`ArmorScope`):
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
 * (no create entry makes them) stay. A new hunter's Mafumofu set
 * (`edit_task.ovl`) follows it the same way.
 *
 * Mixing Blademaster and Gunner pieces isn't offered: nothing on a disc has
 * shown how the smithy lists a place whose piece is for the other type.
 *
 * The Mafumofu body pieces are rarity 1 and for anyone, a group of three
 * per slot on the EU disc (Mafumofu, Leather, Chain), so following the
 * shuffle at one rarity nearly always starts a hunter in Leather or Chain.
 * `drawStarterArmor` instead gives the box any piece a new hunter can wear.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { HUNTER_TYPE_BITS } from "mhfu-extract/src/emit/armor.js";
import { ARMOR_CATEGORY } from "mhfu-extract/src/shops/equipment.js";
import { displayRarity, rankFromRarity } from "mhfu-extract/src/emit/common.js";
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
import { followGear, type GearEntry, type GearList } from "./store.js";

export const ARMOR_SCOPES = ["rarity", "rank", "any"] as const;
/** Which pieces a place can get: the same rarity, the same rank (Low, High or G), or any. */
export type ArmorScope = (typeof ARMOR_SCOPES)[number];

const rankOf = (rarity: number) => rankFromRarity(displayRarity(rarity));

/** The group a piece trades within under `scope`: its wearers, and its rarity or rank. */
function scopeGroup(scope: ArmorScope, rarity: number, bits: number): string {
  if (scope === "rarity") return `${rarity}:${bits}`;
  if (scope === "rank") return `${rankOf(rarity)}:${bits}`;
  return `${bits}`;
}

const SCOPE_NOTES: Record<ArmorScope, string> = {
  rarity: "The new piece is for the same slot and rarity",
  rank: "The new piece is for the same slot and rank (Low, High or G; any rarity in it)",
  any: "The new piece is for the same slot, of any rarity",
};

export const HUNTER_TYPE_AT = 4;
export const RARITY_AT = 5;

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

/** Who a piece is for: Blademaster only, Gunner only, or both. */
export type HunterClass = "blade" | "gun" | "both";

export function hunterClass(bits: number): HunterClass | null {
  if (!wearable(bits)) return null;
  const blade = (bits & HUNTER_TYPE_BITS.blademaster) !== 0;
  const gun = (bits & HUNTER_TYPE_BITS.gunner) !== 0;
  return blade && gun ? "both" : blade ? "blade" : "gun";
}

/** A piece the smithy makes. */
export interface ArmorPiece {
  slot: ArmorSlot;
  index: number;
  /** File offset of the `ArmorValue`. */
  at: number;
  /** Raw rarity (shown as rarity + 1). */
  rarity: number;
  /** `HunterType` bits. */
  bits: number;
  hunter: HunterClass;
}

/**
 * Every piece a create entry makes, by slot and index: not piece 0, IDs
 * past the slot's array or pieces with no sex or hunter type bit.
 */
export function readArmorPieces(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
): ArmorPiece[] {
  const reader = new BinaryReader(eboot);
  const create = equipmentCreateLayout(reader, resolver);
  const values = armorValuesOffsets(reader, resolver);
  const pieces: ArmorPiece[] = [];
  for (const slot of ARMOR_SLOTS) {
    const { offset, count } = create[slot];
    const made = new Set<number>();
    for (let i = 0; i < count; i++) made.add(reader.u16(offset + i * EQUIP_CREATE_ENTRY_SIZE + 2));
    for (const index of [...made].sort((a, b) => a - b)) {
      if (index <= 0 || index >= ARMOR_SLOT_COUNTS[slot]) continue;
      const at = values[slot] + index * ARMOR_ENTRY_SIZE;
      const bits = reader.u8(at + HUNTER_TYPE_AT);
      const hunter = hunterClass(bits);
      if (!hunter) continue;
      pieces.push({ slot, index, at, rarity: reader.u8(at + RARITY_AT), bits, hunter });
    }
  }
  return pieces;
}

/**
 * Where a line goes in the armor spoilers: its slot and rarity as the game
 * shows it, and an order that sorts by slot, then rarity.
 */
export function spoilerPlace(slot: ArmorSlot, rarity: number): { where: string; order: number } {
  return {
    where: `${SLOT_NAMES[slot].label}, rarity ${displayRarity(rarity)}`,
    order: ARMOR_SLOTS.indexOf(slot) * 256 + rarity,
  };
}

/** A piece's name, for the spoiler. */
export function pieceName(piece: { slot: ArmorSlot; index: number }): string {
  const { table, label } = SLOT_NAMES[piece.slot];
  return tableName(table, piece.index) ?? `${label} ${piece.index}`;
}

export function shuffleArmor(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
  scope: ArmorScope,
  rng: Rng,
  edits: Edits,
  /** Equipment outside the create entries that follows the shuffle (the store, the starting box). */
  gear: GearList[],
): ShuffleReport {
  const reader = new BinaryReader(eboot);
  const create = equipmentCreateLayout(reader, resolver);
  const values = armorValuesOffsets(reader, resolver);
  const out = edits.eboot();
  const lines: { where: string; text: string; order: number }[] = [];
  let moved = 0;
  let pieces = 0;

  for (const slot of ARMOR_SLOTS) {
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
      (i) => scopeGroup(scope, rarity(i), hunterType(i)),
      (i) => i,
      rng,
    );
    const sigma = new Map(shuffled.map((piece, k) => [piece, next[k]!]));

    for (const at of entryAt) {
      const piece = reader.u16(at + 2);
      out.writeUInt16LE(sigma.get(piece) ?? piece, at + 2);
    }

    // The store and the starting box have whatever is now in the places of what they had.
    followGear(
      gear,
      ARMOR_CATEGORY[slot],
      (i) => sigma.get(i) ?? i,
      name,
      `Armor: ${label}`,
      edits,
    );

    for (const piece of shuffled) {
      const now = sigma.get(piece)!;
      if (now === piece) continue;
      moved++;
      const who = wearers(hunterType(piece));
      const nowRarity = rarity(now) === rarity(piece) ? "" : `rarity ${displayRarity(rarity(now))}`;
      const notes = [nowRarity, who].filter(Boolean).join("; ");
      lines.push({
        ...spoilerPlace(slot, rarity(piece)),
        text: `${name(piece)} -> ${name(now)}${notes ? ` (${notes})` : ""}`,
      });
    }
  }

  return {
    title: "Armor progression",
    notes: [
      "Each line is a place in the smithy: you now get the second piece where you used to get the first.",
      `${SCOPE_NOTES[scope]}, and can be worn by the same hunters (Blademaster, Gunner or both; male, female or both).${scope === "rarity" ? "" : " A piece of another rarity says so."}`,
      "Places keep their materials; pieces keep their own stats, skills, slots and price. Where a piece had two recipes, both now make the same new piece.",
      `${moved} of ${pieces} pieces changed places.`,
    ],
    // By slot, then rarity (a stable sort keeps piece order within each).
    lines: lines.sort((a, b) => a.order - b.order).map(({ where, text }) => ({ where, text })),
  };
}

/** Starting armor drawn at random: Low Rank pieces, or any. */
export type StarterScope = "rank" | "any";

/**
 * Gives each armor piece in a new hunter's box (`starter`) a piece drawn
 * from every piece the smithy makes for its slot that a new hunter can
 * wear: for Blademasters (the box's worn weapon is one, under any weapon
 * shuffle) and both sexes (the box is filled the same for either), of Low
 * Rank with `scope` "rank". An ID the box gives twice (the Mafumofu set's
 * second run) gets the same piece both times.
 *
 * Takes those entries out of `starter`, so the armor shuffle's `followGear`
 * leaves them alone: call it before `shuffleArmor`. Reads rarity and
 * wearers from `eboot` as on the disc.
 */
export function drawStarterArmor(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
  starter: GearList,
  scope: StarterScope,
  rng: Rng,
  edits: Edits,
): void {
  const { male, female, blademaster } = HUNTER_TYPE_BITS;
  const pieces = readArmorPieces(eboot, resolver).filter(
    (p) =>
      (p.bits & (male | female)) === (male | female) &&
      (p.bits & blademaster) !== 0 &&
      (scope === "any" || rankOf(p.rarity) === "low-rank"),
  );
  const drawn = new Map<string, number>();
  const taken = new Set<GearEntry>();
  for (const slot of ARMOR_SLOTS) {
    const category = ARMOR_CATEGORY[slot];
    const entries = starter.entries.filter((e) => e.category === category);
    const pool = pieces.filter((p) => p.slot === slot);
    if (entries.length === 0 || pool.length === 0) continue;
    const out = edits.overlay(starter.overlay);
    const name = (index: number) => pieceName({ slot, index });
    for (const entry of entries) {
      let now = drawn.get(`${category}:${entry.id}`);
      if (now === undefined) {
        now = pool[rng.int(pool.length)]!.index;
        if (now >= starter.maxId) throw new Error(`${starter.title}: ID ${now} doesn't fit`);
        drawn.set(`${category}:${entry.id}`, now);
        const worn = entries.some((e) => e.id === entry.id && e.worn) ? " (worn)" : "";
        starter.lines.push({
          where: `Armor: ${SLOT_NAMES[slot].label}`,
          text: `${name(entry.id)} -> ${name(now)}${worn}`,
        });
      }
      out.writeUInt16LE(now, entry.idAt);
      taken.add(entry);
    }
  }
  if (taken.size === 0) return;
  starter.entries = starter.entries.filter((e) => !taken.has(e));
  starter.notes.push(
    `Its armor doesn't follow the armor shuffle: each piece is drawn from ${scope === "rank" ? "the Low Rank pieces" : "all the pieces, G Rank included,"} the smithy makes for its slot that a new hunter can wear (Blademaster pieces for both sexes).`,
  );
}
