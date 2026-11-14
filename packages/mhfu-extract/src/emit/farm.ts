/**
 * Maps Pokke Farm's gathering tables (`tables/farm.ts`) onto
 * `data/farm.json` (schema: `data/schemas/farm.schema.json`): one entry per
 * Mining Point, Insect Thicket, Mushroom Tree and Bee Hive, in the EBOOT's
 * order, with how many times each is drawn from per restock and its items'
 * chances.
 */
import { getNameResolver } from "../strings/names.js";
import type { FarmSpot, FarmTables } from "../tables/farm.js";

export interface EmittedFarmPoint {
  name: string;
  spot: FarmSpot;
  gathers: number;
  most_gathers: number;
  items: { item: string; chance: number }[];
}

export function emitFarm(farm: FarmTables): { points: EmittedFarmPoint[] } {
  const names = getNameResolver();
  const item = (id: number) => names.resolve("ItemID", id) ?? `Item ${id}`;
  return {
    points: farm.tables.map((t) => ({
      name: t.name,
      spot: t.spot,
      gathers: t.gathers,
      most_gathers: t.mostGathers,
      items: t.items.map((i) => ({ item: item(i.item), chance: i.chance })),
    })),
  };
}
