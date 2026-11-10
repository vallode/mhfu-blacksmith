/**
 * Maps the item table (`tables/items.ts`) onto the stats in
 * `data/items.json` (schema: `data/schemas/item.schema.json`): each item's
 * rarity, carry limit and price, by ItemID. Names come from the `ItemID`
 * enum, so `diff` can pair the entries with `data/items.json` by name;
 * `build-data` pairs them by ID and writes only the stats.
 */
import type { BinaryReader } from "../binary/reader.js";
import { getNameResolver } from "../strings/names.js";
import { readItemTable } from "../tables/items.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import { displayRarity } from "./common.js";

export interface EmittedItem {
  id: number;
  name: string;
  rarity: number;
  carry: number;
  price: number;
}

/** Every named item (ID 0, "None", has no name), in ID order. */
export function emitItems(reader: BinaryReader, resolver?: TableAddressResolver): EmittedItem[] {
  const names = getNameResolver();
  const out: EmittedItem[] = [];
  for (const entry of readItemTable(reader, resolver)) {
    const name = names.resolve("ItemID", entry.index);
    if (!name) continue;
    out.push({
      id: entry.index,
      name,
      rarity: displayRarity(entry.rarity),
      carry: entry.stackLimit,
      price: entry.price,
    });
  }
  return out;
}
