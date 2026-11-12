/**
 * Monster sizes and crowns, from the EBOOT (EU disc; see the README's
 * "Monster size").
 *
 * When a quest sets up its large monsters (EBOOT `0x0886DB0C`), each one
 * that can vary in size rolls a percent (`0x0886D524`):
 *
 *   tier  = TIER_PICK[rand() & 31]        // 0-6, weighted toward 3
 *   roll  = TIERS[tier][rand() & 31]      // 75-125
 *   roll  = clamp(roll, VARIATION[v])     // v: the quest header's u8 at 0x4a
 *   size  = MonSizeModifier * roll / 100  // integer; the header's s16 at 0x38
 *
 * The size is kept in the monster's quest record (`+0x30`) and is what the
 * Guild Card records. A monster that can't vary is always 100, and so is
 * every monster in some story quests until a save flag is set
 * (`FIXED_SIZE_QUESTS`).
 *
 * The Guild Card gives a record a crown by comparing it with its monster's
 * entry in the crown table (EBOOT `0x08853F84`): at most `mini` is a mini
 * crown, at least `gold` a gold crown, at least `silver` a silver crown.
 * Subspecies share their base monster's entry, and the record compared is
 * the largest (or smallest) across all of them. It shows sizes in
 * centimetres: the percent times the monster's base size, over 100.
 *
 * Addresses are virtual; only the EU disc's have been worked out.
 */
import type { BinaryReader } from "../binary/reader.js";

/** `u8[32]`: a tier by `rand() & 31`. */
const TIER_PICK = 0x089a8164;
/** `u8*[7]`: each tier's `u8[32]` of percents. */
const TIER_TABLES = 0x089a8148;
const TIER_COUNT = 7;
const ROLL_SLOTS = 32;
/**
 * `{ u8 min, u8 max }[5]` by the quest header's u8 at 0x4a. The game copies
 * them to `0x08A62C80` at boot and reads them from there.
 */
const VARIATION = 0x089a7ea4;
const VARIATION_COUNT = 5;
/**
 * The crown table, 14 bytes an entry: `u8` entry index, two `u8`s, `u8`
 * emID, then `s16` silver, gold and mini thresholds (percent). Entries
 * without crowns are all zero.
 */
const CROWNS = 0x08930bdc;
const CROWN_COUNT = 62;
const CROWN_SIZE = 14;
/** `u8*` by emID: the emIDs (ending 0xff) whose records a crown entry takes. */
const CROWN_GROUPS = 0x0899bf40;
/** `f32` by emID: the size in centimetres at 100 percent. */
const BASE_SIZES = 0x0899c760;
/**
 * `{ u16 flag, u16 index, u16 questId }[38]`: quests whose monsters stay at
 * 100 until save flag `flag` is set (EBOOT `0x08874124`); flag 356 rolls
 * from the start.
 */
const FIXED_SIZE_TABLE = 0x089a8624;
const FIXED_SIZE_COUNT = 38;
const ALWAYS_ROLLS_FLAG = 356;

const MONSTER_COUNT = 90;

export interface Crowns {
  /** A record at most this percent gets a mini crown. */
  mini: number;
  /** At least this percent: a silver crown. */
  silver: number;
  /** At least this percent: a gold crown. */
  gold: number;
}

export interface CrownEntry extends Crowns {
  /** The emIDs that share the entry, base monster first. */
  emIds: number[];
}

export interface SizeTables {
  /** A tier (0-6) by `rand() & 31`. */
  tierPick: number[];
  /** Each tier's 32 percents. */
  tiers: number[][];
  /** `[min, max]` the roll is clamped to, by the quest header's u8 at 0x4a. */
  variation: [number, number][];
  /** Crown entries with thresholds; the monsters in them are the ones that vary in size. */
  crowns: CrownEntry[];
  /** Centimetres at 100 percent, by emID. */
  baseSizes: number[];
  /**
   * Quests whose monsters are 100 until a save flag is set, by quest ID: the
   * flag's bit, or null for the one quest that rolls from the start anyway.
   */
  fixedSizeQuests: Map<number, number | null>;
}

export class SizeTableError extends Error {}

/** The size tables, or throws if they aren't where the EU disc has them. */
export function readSizeTables(eboot: BinaryReader, baseAddress: number): SizeTables {
  const at = (vaddr: number) => {
    const offset = vaddr - baseAddress;
    if (offset < 0 || offset >= eboot.length)
      throw new SizeTableError(`0x${vaddr.toString(16)} is outside the EBOOT`);
    return offset;
  };
  const bytes = (vaddr: number, count: number) =>
    Array.from({ length: count }, (_, i) => eboot.u8(at(vaddr) + i));

  const tierPick = bytes(TIER_PICK, ROLL_SLOTS);
  const tiers = Array.from({ length: TIER_COUNT }, (_, t) =>
    bytes(eboot.u32(at(TIER_TABLES) + t * 4), ROLL_SLOTS),
  );
  const variation = Array.from(
    { length: VARIATION_COUNT },
    (_, v) => bytes(VARIATION + v * 2, 2) as [number, number],
  );
  const baseSizes = Array.from({ length: MONSTER_COUNT }, (_, emId) =>
    eboot.f32(at(BASE_SIZES) + emId * 4),
  );

  const crowns: CrownEntry[] = [];
  for (let i = 0; i < CROWN_COUNT; i++) {
    const entry = at(CROWNS) + i * CROWN_SIZE;
    const silver = eboot.s16(entry + 4);
    const gold = eboot.s16(entry + 6);
    const mini = eboot.s16(entry + 8);
    if (silver === 0 && gold === 0 && mini === 0) continue;
    const emIds: number[] = [];
    let member = at(eboot.u32(at(CROWN_GROUPS) + eboot.u8(entry + 3) * 4));
    while (eboot.u8(member) !== 0xff && emIds.length < MONSTER_COUNT)
      emIds.push(eboot.u8(member++));
    crowns.push({ emIds, mini, silver, gold });
  }

  const fixedSizeQuests = new Map<number, number | null>();
  for (let i = 0; i < FIXED_SIZE_COUNT; i++) {
    const entry = at(FIXED_SIZE_TABLE) + i * 6;
    const flag = eboot.u16(entry);
    fixedSizeQuests.set(eboot.u16(entry + 4), flag === ALWAYS_ROLLS_FLAG ? null : flag);
  }

  const tables = { tierPick, tiers, variation, crowns, baseSizes, fixedSizeQuests };
  checkTables(tables);
  return tables;
}

/** Values the EU tables are known to hold; anything else means the wrong addresses. */
function checkTables(t: SizeTables): void {
  const giadrome = t.crowns.find((c) => c.emIds.includes(77));
  const ok =
    t.tierPick.every((tier) => tier < TIER_COUNT) &&
    t.tiers[0]![0] === 75 &&
    t.tiers[6]![31] === 125 &&
    JSON.stringify(t.variation) === "[[100,100],[100,105],[100,115],[95,114],[85,125]]" &&
    t.crowns.length === 31 &&
    giadrome?.mini === 90 &&
    giadrome.silver === 119 &&
    giadrome.gold === 123 &&
    Math.abs(t.baseSizes[77]! - 738.4) < 0.01 &&
    t.fixedSizeQuests.get(10104) === 322;
  if (!ok) throw new SizeTableError("the size tables aren't at their EU addresses");
}

/** A size the game computes: `modifier * roll / 100`, rounded toward zero. */
export function questSize(modifier: number, roll: number): number {
  return Math.trunc((modifier * roll) / 100);
}

/** The smallest and largest size a quest's monsters can roll, in percent. */
export function sizeRange(
  tables: SizeTables,
  modifier: number,
  variation: number,
): { min: number; max: number } {
  const [lo, hi] = tables.variation[variation] ?? [100, 100];
  return { min: questSize(modifier, lo), max: questSize(modifier, hi) };
}

/** Each size a quest's monsters can roll, with its chance (summing to 1). */
export function sizeChances(
  tables: SizeTables,
  modifier: number,
  variation: number,
): Map<number, number> {
  const [lo, hi] = tables.variation[variation] ?? [100, 100];
  const out = new Map<number, number>();
  const weight = 1 / (ROLL_SLOTS * ROLL_SLOTS);
  for (const tier of tables.tierPick)
    for (const roll of tables.tiers[tier]!) {
      const size = questSize(modifier, Math.min(Math.max(roll, lo), hi));
      out.set(size, (out.get(size) ?? 0) + weight);
    }
  return out;
}

/** The crown entry an emID's records count toward, if it has one. */
export function crownsFor(tables: SizeTables, emId: number): CrownEntry | undefined {
  return tables.crowns.find((c) => c.emIds.includes(emId));
}

/**
 * The chance a monster rolls each crown in a quest: a mini, silver or gold
 * crown size (silver short of gold). Undefined for a monster without crowns,
 * which is always 100.
 */
export function crownChances(
  tables: SizeTables,
  emId: number,
  modifier: number,
  variation: number,
): Crowns | undefined {
  const crowns = crownsFor(tables, emId);
  if (!crowns) return undefined;
  const out: Crowns = { mini: 0, silver: 0, gold: 0 };
  for (const [size, chance] of sizeChances(tables, modifier, variation)) {
    if (size <= crowns.mini) out.mini += chance;
    else if (size >= crowns.gold) out.gold += chance;
    else if (size >= crowns.silver) out.silver += chance;
  }
  return out;
}
