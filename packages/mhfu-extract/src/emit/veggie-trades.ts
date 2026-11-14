/**
 * Maps the Veggie Elder's trade tables (`tables/veggie-trades.ts`) onto
 * `data/veggie-trades.json` (schema: `data/schemas/veggie-trade.schema.json`):
 * one Elder per table, with the maps he trades on and his rows in the
 * game's order (he takes the first row whose item the hunter carries).
 */
import { getNameResolver } from "../strings/names.js";
import { MAP_NAMES } from "../tables/quest-maps.js";
import { RARE_TRADE_CHANCE, TRADE_TABLE_MAPS, type VeggieTrades } from "../tables/veggie-trades.js";

export interface EmittedVeggieTrade {
  give: string;
  common: string;
  rare: string;
}

export interface EmittedVeggieElder {
  maps: string[];
  trades: EmittedVeggieTrade[];
}

export interface EmittedVeggieTrades {
  /** In percent: how often a trade gives the rare item, without Felyne Negotiations. */
  rare_chance: number;
  elders: EmittedVeggieElder[];
}

export function emitVeggieTrades(trades: VeggieTrades): EmittedVeggieTrades {
  const names = getNameResolver();
  const item = (id: number) => names.resolve("ItemID", id) ?? `Item ${id}`;
  return {
    rare_chance: RARE_TRADE_CHANCE,
    elders: trades.tables.map((rows, i) => ({
      maps: (TRADE_TABLE_MAPS[i] ?? []).map((id) => MAP_NAMES[id] ?? `Map ${id}`),
      trades: rows.map((r) => ({ give: item(r.give), common: item(r.common), rare: item(r.rare) })),
    })),
  };
}
