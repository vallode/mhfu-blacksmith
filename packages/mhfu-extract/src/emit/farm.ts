/**
 * Maps Pokke Farm's gathering tables (`tables/farm.ts`) onto
 * `data/farm.json` (schema: `data/schemas/farm.schema.json`): one entry per
 * Mining Point, Insect Thicket, Mushroom Tree and Bee Hive, in the EBOOT's
 * order, with how many times each is drawn from per restock and its items'
 * chances.
 */
import { getNameResolver } from "../strings/names.js";
import type { FishEntry, FishTables } from "../quests/fishing.js";
import type { FarmSpot, FarmTables, FishCasterItem } from "../tables/farm.js";

export interface EmittedFarmPoint {
  name: string;
  spot: FarmSpot;
  /** Null where the game's count isn't known (the fishing points). */
  gathers: number | null;
  most_gathers: number | null;
  items: { item: string; chance: number; amount?: number }[];
}

/** The Fishing Pier's three upgrades and the Casting Machine's rewards. */
export interface FarmFishing {
  /** The farm stage's first three fish tables, one per pier upgrade. */
  pier?: FishTables | null;
  caster?: FishCasterItem[] | null;
}

const PIER_NAMES = ["Fishing Pier", "Fishing Pier +1", "Fishing Pier +2"];

export function emitFarm(
  farm: FarmTables,
  { pier, caster }: FarmFishing = {},
): { points: EmittedFarmPoint[] } {
  const names = getNameResolver();
  const item = (id: number) => names.resolve("ItemID", id) ?? `Item ${id}`;
  const items = (
    rows: readonly ({ item: number; chance: number; amount?: number } | FishEntry)[],
  ) =>
    rows.map((i) => ({
      item: item("itemId" in i ? i.itemId : i.item),
      chance: i.chance,
      ...("amount" in i && i.amount !== 1 && { amount: i.amount }),
    }));
  const points: EmittedFarmPoint[] = farm.tables.map((t) => ({
    name: t.name,
    spot: t.spot,
    gathers: t.gathers,
    most_gathers: t.mostGathers,
    items: items(t.items),
  }));
  pier?.slice(0, PIER_NAMES.length).forEach((table: readonly FishEntry[], level) => {
    if (table.length === 0) return;
    points.push({
      name: PIER_NAMES[level]!,
      spot: "fishing",
      gathers: null,
      most_gathers: null,
      items: items(table),
    });
  });
  if (caster && caster.length > 0) {
    points.push({
      name: "Casting Machine",
      spot: "fishing",
      gathers: null,
      most_gathers: null,
      items: items(caster),
    });
  }
  return { points };
}
