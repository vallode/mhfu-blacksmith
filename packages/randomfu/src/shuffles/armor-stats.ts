/**
 * Armor stats: defense, elemental resistances, decoration slots and rarity
 * of each piece the smithy makes, in its own `ArmorValue` (mhfu-extract's
 * `tables/armor.ts`), so they go with the piece wherever the armor shuffle
 * puts it. Each stat is left alone, shuffled or randomized on its own:
 *
 * - defense: u8 at +12, the piece's level 1 defense. Every level adds 2
 *   (`defenceAtLevel`) up to the last of the seven sphere caps (u8, +20 to
 *   +26). Shuffled, defense trades with its sphere caps, so a piece gets
 *   another's defense at every level. Randomized, it's multiplied by a
 *   factor within the spread and kept within what pieces of the same
 *   hunter type have from one rarity below to one above (`RarityBounds`),
 *   and the caps stay. In game, a level 1 defense of 254 shows as 254 and
 *   upgrades past 256, and the total adds up past 255, so nothing past
 *   the byte itself limits it.
 * - resistances: five s8 at +13 (fire, water, thunder, dragon, ice).
 *   Shuffled, a piece's five trade together; randomized, each moves by up
 *   to the spread in points, kept within that element's bounds (as for
 *   defense), else within the disc's range for it.
 * - slots: u8 at +18, 0 to 3. Shuffled, they trade; randomized, they're
 *   drawn from the slot counts pieces of that rarity have on the disc, so
 *   a rarity keeps about as many slots.
 * - rarity: u8 at +5, shown + 1. Shuffled, rarities trade between pieces of
 *   the same rank (Low, High or G, by `rankFromRarity`) and hunter type;
 *   randomized, a rarity moves by up to the spread, staying within the
 *   rarities its rank has on the disc. What the game reads armor rarity
 *   for hasn't been checked in game.
 *
 * Shuffles trade between pieces of the same rarity and hunter type
 * (Blademaster only, Gunner only, or both), as the armor skill shuffle
 * does, so each rarity keeps the same values. Every piece draws from a
 * stat's stream whether or not its value can move, so a piece's roll
 * depends only on the seed and its place in the list.
 *
 * Everything reads the disc as it was (the armor and skill shuffles touch
 * other bytes), so groups and bounds never see another stat's new values.
 * The pieces are `readArmorPieces`': piece 0, pieces no create entry makes
 * and pieces with no `HunterType` bits are left alone.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { defenceAtLevel } from "mhfu-extract/src/emit/armor.js";
import { displayRarity, rankFromRarity } from "mhfu-extract/src/emit/common.js";
import type { TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import type { Edits } from "../edits.js";
import type { Rng } from "../rng.js";
import type { Mode } from "../settings.js";
import { RARITY_AT, pieceName, readArmorPieces, spoilerPlace, type ArmorPiece } from "./armor.js";
import {
  RarityBounds,
  clamp,
  getOrInsert,
  permuteWithinGroups,
  type ShuffleReport,
} from "./shuffle.js";

const DEFENSE_AT = 12;
const RESISTANCES_AT = 13;
const SLOTS_AT = 18;
const SPHERE_CAPS_AT = 20;
const SPHERE_CAP_COUNT = 7;

/** The five resistances, in their order on the disc. */
export const RESISTANCES = ["Fire", "Water", "Thunder", "Dragon", "Ice"] as const;

export type ArmorStat = "defense" | "resistances" | "slots" | "rarity";
export const ARMOR_STATS: readonly ArmorStat[] = ["defense", "resistances", "slots", "rarity"];

export interface ArmorStatOptions {
  defense: Mode;
  /** Defense factor spread (0.2 = 80% to 120%), when randomized. */
  defenseSpread: number;
  resistances: Mode;
  /** Points each resistance can move, when randomized. */
  resistanceSpread: number;
  slots: Mode;
  rarity: Mode;
  /** Levels rarity can move, when randomized. */
  raritySpread: number;
}

interface Stats {
  defense: number;
  /** The seven sphere caps; the last is the highest level. */
  caps: number[];
  resistances: number[];
  slots: number;
  rarity: number;
}

interface Piece extends ArmorPiece {
  before: Stats;
}

function readStats(reader: BinaryReader, at: number): Stats {
  return {
    defense: reader.u8(at + DEFENSE_AT),
    caps: Array.from({ length: SPHERE_CAP_COUNT }, (_, k) => reader.u8(at + SPHERE_CAPS_AT + k)),
    resistances: RESISTANCES.map((_, k) => reader.s8(at + RESISTANCES_AT + k)),
    slots: reader.u8(at + SLOTS_AT),
    rarity: reader.u8(at + RARITY_AT),
  };
}

function writeStats(buf: Buffer, at: number, stats: Stats): void {
  buf.writeUInt8(stats.defense, at + DEFENSE_AT);
  stats.caps.forEach((cap, k) => buf.writeUInt8(cap, at + SPHERE_CAPS_AT + k));
  stats.resistances.forEach((r, k) => buf.writeInt8(r, at + RESISTANCES_AT + k));
  buf.writeUInt8(stats.slots, at + SLOTS_AT);
  buf.writeUInt8(stats.rarity, at + RARITY_AT);
}

/** Defense at a piece's last sphere cap. */
const maxDefense = (s: Stats) => defenceAtLevel(s.defense, s.caps[SPHERE_CAP_COUNT - 1]!);

const rankOf = (rarity: number) => rankFromRarity(displayRarity(rarity));

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

/** A uniform integer in [-spread, spread]. */
const roll = (spread: number, rng: Rng) => rng.int(2 * spread + 1) - spread;

/** Each piece's value, traded within groups of the same rarity and hunter type. */
function shuffled<V>(
  pieces: readonly Piece[],
  group: (p: Piece) => string,
  value: (s: Stats) => V,
  rng: Rng,
): V[] {
  return permuteWithinGroups(pieces, group, (p) => value(p.before), rng);
}

const sameRarity = (p: Piece) => `${p.rarity}:${p.hunter}`;
const sameRank = (p: Piece) => `${rankOf(p.rarity)}:${p.hunter}`;

export function randomizeArmorStats(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
  options: ArmorStatOptions,
  rngs: Record<ArmorStat, Rng>,
  edits: Edits,
): ShuffleReport {
  const reader = new BinaryReader(eboot);
  const pieces: Piece[] = readArmorPieces(eboot, resolver).map((p) => ({
    ...p,
    before: readStats(reader, p.at),
  }));
  const after = pieces.map((p) => ({
    ...p.before,
    caps: [...p.before.caps],
    resistances: [...p.before.resistances],
  }));
  const bounds = (value: (s: Stats) => number) =>
    new RarityBounds(
      pieces,
      (p) => p.hunter,
      (p) => p.rarity,
      (p) => value(p.before),
    );
  const notes: string[] = [];

  if (options.defense === "shuffle") {
    const traded = shuffled(
      pieces,
      sameRarity,
      (s) => ({ defense: s.defense, caps: s.caps }),
      rngs.defense,
    );
    traded.forEach(({ defense, caps }, i) => {
      after[i]!.defense = defense;
      after[i]!.caps = [...caps];
    });
    notes.push(
      "Defense: pieces of the same rarity and hunter type trade their defense, with how far armor spheres upgrade it.",
    );
  } else if (options.defense === "randomize") {
    const spread = options.defenseSpread;
    const window = bounds((s) => s.defense);
    pieces.forEach((p, i) => {
      const factor = 1 - spread + rngs.defense.float() * 2 * spread;
      const value = clamp(Math.round(p.before.defense * factor), window.of(p));
      after[i]!.defense = Math.max(1, Math.min(value, 255));
    });
    notes.push(
      `Defense is ${Math.round((1 - spread) * 100)}% to ${Math.round((1 + spread) * 100)}% of what it was, within what pieces of the same hunter type have from one rarity below to one above. Armor spheres upgrade it as far as before.`,
    );
  }

  if (options.resistances === "shuffle") {
    const traded = shuffled(pieces, sameRarity, (s) => s.resistances, rngs.resistances);
    traded.forEach((r, i) => (after[i]!.resistances = [...r]));
    notes.push(
      "Resistances: pieces of the same rarity and hunter type trade all five resistances together.",
    );
  } else if (options.resistances === "randomize") {
    const spread = options.resistanceSpread;
    const windows = RESISTANCES.map((_, k) => bounds((s) => s.resistances[k]!));
    const ranges = RESISTANCES.map((_, k): [number, number] => {
      const all = pieces.map((p) => p.before.resistances[k]!);
      return [Math.min(...all), Math.max(...all)];
    });
    pieces.forEach((p, i) => {
      after[i]!.resistances = p.before.resistances.map((r, k) => {
        const moved = r + roll(spread, rngs.resistances);
        return clamp(moved, windows[k]!.of(p) ?? ranges[k]!);
      });
    });
    notes.push(
      `Each resistance moves by up to ${spread} points, within what pieces of the same hunter type have from one rarity below to one above.`,
    );
  }

  if (options.slots === "shuffle") {
    shuffled(pieces, sameRarity, (s) => s.slots, rngs.slots).forEach(
      (slots, i) => (after[i]!.slots = slots),
    );
    notes.push("Slots: pieces of the same rarity and hunter type trade their decoration slots.");
  } else if (options.slots === "randomize") {
    const byRarity = new Map<number, number[]>();
    for (const p of pieces) getOrInsert(byRarity, p.rarity, () => []).push(p.before.slots);
    pieces.forEach((p, i) => {
      const counts = byRarity.get(p.rarity)!;
      after[i]!.slots = counts[rngs.slots.int(counts.length)]!;
    });
    notes.push(
      "Slots are drawn from the slot counts pieces of the same rarity have, so each rarity has about as many as before.",
    );
  }

  if (options.rarity === "shuffle") {
    shuffled(pieces, sameRank, (s) => s.rarity, rngs.rarity).forEach(
      (rarity, i) => (after[i]!.rarity = rarity),
    );
    notes.push(
      "Rarity: pieces of the same rank (Low, High or G) and hunter type trade their rarity.",
    );
  } else if (options.rarity === "randomize") {
    const spread = options.raritySpread;
    const ranks = new Map<string, [number, number]>();
    for (const p of pieces) {
      const range = getOrInsert(ranks, rankOf(p.rarity), (): [number, number] => [
        p.rarity,
        p.rarity,
      ]);
      range[0] = Math.min(range[0], p.rarity);
      range[1] = Math.max(range[1], p.rarity);
    }
    pieces.forEach((p, i) => {
      const moved = p.rarity + roll(spread, rngs.rarity);
      after[i]!.rarity = clamp(moved, ranks.get(rankOf(p.rarity))!);
    });
    notes.push(`Rarity moves by up to ${spread}, staying within its rank (Low, High or G).`);
  }
  if (options.rarity !== "off") {
    notes.push(
      "This spoiler and the armor skills one list pieces by their new rarity. The armor shuffle's lists smithy places by the rarity on the disc, and every armor shuffle still groups pieces by that rarity. What the game uses armor rarity for hasn't been checked in game.",
    );
  }

  const buf = edits.eboot();
  const lines: { where: string; text: string; order: number }[] = [];
  pieces.forEach((p, i) => {
    const was = p.before;
    const now = after[i]!;
    writeStats(buf, p.at, now);
    const changes: string[] = [];
    if (now.defense !== was.defense || maxDefense(now) !== maxDefense(was)) {
      changes.push(
        `defense ${was.defense} -> ${now.defense} (upgraded ${maxDefense(was)} -> ${maxDefense(now)})`,
      );
    }
    RESISTANCES.forEach((name, k) => {
      const [a, b] = [was.resistances[k]!, now.resistances[k]!];
      if (a !== b) changes.push(`${name} ${signed(a)} -> ${signed(b)}`);
    });
    if (now.slots !== was.slots) changes.push(`slots ${was.slots} -> ${now.slots}`);
    if (now.rarity !== was.rarity) {
      changes.push(`rarity ${displayRarity(was.rarity)} -> ${displayRarity(now.rarity)}`);
    }
    if (changes.length === 0) return;
    lines.push({
      ...spoilerPlace(p.slot, now.rarity),
      text: `${pieceName(p)}: ${changes.join(", ")}`,
    });
  });

  return {
    title: "Armor stats",
    notes: [
      "Each piece's own stats, so they go with it wherever the armor shuffle puts it.",
      ...notes,
      "Skills, price and who can wear a piece don't change here.",
      `${lines.length} of ${pieces.length} pieces changed.`,
    ],
    // By slot, then rarity (a stable sort keeps piece order within each).
    lines: lines.sort((a, b) => a.order - b.order).map(({ where, text }) => ({ where, text })),
  };
}
