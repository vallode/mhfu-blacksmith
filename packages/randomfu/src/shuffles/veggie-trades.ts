/**
 * The Veggie Elder's trades: seven lists in `game_task.ovl`, one per hunting
 * ground he trades on (mhfu-extract `tables/veggie-trades.ts`), of rows
 * (u16 item he takes, u16 common trade, u16 rare trade). Each row keeps the
 * item it takes and its place in the list (he takes the first item on it the
 * hunter carries); what it gives, the common and rare trade together, moves
 * to another row: of the same Elder, or of any Elder. Edited in place.
 */
import { MAP_NAMES } from "mhfu-extract/src/tables/quest-maps.js";
import { TRADE_TABLE_MAPS, readVeggieTrades } from "mhfu-extract/src/tables/veggie-trades.js";
import type { Edits } from "../edits.js";
import type { LoadedOverlay } from "../game/load.js";
import { itemName } from "../names.js";
import type { Rng } from "../rng.js";
import { permuteWithinGroups, type ShuffleReport } from "./shuffle.js";

export type TradeMix = "elder" | "all";

export interface TradeSlot {
  /** Which Elder's list (0-6). */
  elder: number;
  /** File offset of the row in `game_task.ovl`. */
  offset: number;
  give: number;
  common: number;
  rare: number;
}

/** Every Elder's rows, in the game's order. */
export function collectTradeSlots(gameTask: LoadedOverlay): TradeSlot[] {
  const found = readVeggieTrades(gameTask.ovl);
  if (!found) throw new Error("game_task.ovl: the Veggie Elder's trades weren't found");
  return found.tables.flatMap((rows, elder) => rows.map((r) => ({ elder, ...r })));
}

/** "Forest and Hills", from the Elder's first map without its time of day. */
export function elderName(elder: number): string {
  const map = MAP_NAMES[TRADE_TABLE_MAPS[elder]?.[0] ?? -1] ?? `Elder ${elder + 1}`;
  return map.replace(/ \((?:Day|Night)\)$/, "");
}

export function shuffleTrades(
  slots: readonly TradeSlot[],
  mix: TradeMix,
  rng: Rng,
  edits: Edits,
  gameTask: LoadedOverlay,
): ShuffleReport {
  const next = permuteWithinGroups(
    slots,
    (s) => (mix === "elder" ? String(s.elder) : ""),
    (s) => ({ common: s.common, rare: s.rare }),
    rng,
  );
  const buf = edits.overlay(gameTask);
  const trade = (common: number, rare: number) =>
    common === rare ? itemName(common) : `${itemName(common)} / ${itemName(rare)} (rare)`;
  const lines = slots.map((slot, i) => {
    const { common, rare } = next[i]!;
    buf.writeUInt16LE(common, slot.offset + 2);
    buf.writeUInt16LE(rare, slot.offset + 4);
    return {
      where: `Veggie Elder: ${elderName(slot.elder)}`,
      text: `${itemName(slot.give)} -> ${trade(common, rare)} (was ${trade(slot.common, slot.rare)})`,
    };
  });
  return {
    title: "Veggie Elder trades",
    notes: [
      mix === "elder"
        ? "What each trade gives (its common and rare items together) moves to another trade of the same Elder."
        : "What each trade gives (its common and rare items together) moves to any Elder's trades.",
      "Each trade keeps the item he takes and its place in his list: he takes the first item on it that the hunter carries.",
    ],
    lines,
  };
}
