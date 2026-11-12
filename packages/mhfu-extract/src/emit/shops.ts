/**
 * Maps the shops' stock (`shops/shops.ts`) onto `data/shops.json` (schema:
 * `data/schemas/shop.schema.json`).
 *
 * Each shop has one list per stage of the game; an item lists the stages
 * (1-based, in disc order) whose list has it. What moves a shop to its next
 * stage isn't on the disc that we know of. Zenny prices are the item
 * table's price field (`tables/items.ts`, `+12`), which matches the general
 * store's prices on the game's shop screen (randomfu's `KNOWN_PRICES`). The
 * Point Exchange's Pokke Point prices haven't been found, so its prices are
 * null.
 */
import type { BinaryReader } from "../binary/reader.js";
import type { ShopData } from "../shops/shops.js";
import { getNameResolver } from "../strings/names.js";
import { ITEM_ENTRY_SIZE, TABLE_COUNTS, resolveTableOffset } from "../tables/offsets.js";
import type { TableAddressResolver } from "../tables/resolver.js";

/** The item record's u32 buy price. */
const PRICE_FIELD = 12;

export interface EmittedShopItem {
  item: string;
  /** Price in the shop's currency, or null where it isn't known. */
  price: number | null;
  /** The stages (1-based) whose list has the item. */
  stages: number[];
}

export interface EmittedShop {
  name: string;
  currency: "zenny" | "pokke-points";
  /** How many stage lists the shop has, empty ones included. */
  stage_count: number;
  items: EmittedShopItem[];
}

export function emitShops(
  shops: ShopData,
  eboot: BinaryReader,
  resolver?: TableAddressResolver,
): EmittedShop[] {
  const names = getNameResolver();
  const base = resolveTableOffset("itemTable", eboot, resolver);
  const records = TABLE_COUNTS.regularItems + TABLE_COUNTS.decorations;
  const price = (id: number) =>
    id < records ? eboot.u32(base + id * ITEM_ENTRY_SIZE + PRICE_FIELD) : null;

  return shops.tables.map((table) => {
    const stages = new Map<number, number[]>();
    table.lists.forEach((offset, i) => {
      for (const id of shops.lists.get(offset)?.items ?? []) {
        const seen = stages.get(id) ?? [];
        if (!seen.includes(i + 1)) seen.push(i + 1);
        stages.set(id, seen);
      }
    });
    const currency = table.special ? "pokke-points" : "zenny";
    return {
      name: table.name,
      currency,
      stage_count: table.lists.length,
      items: [...stages].map(([id, at]) => ({
        item: names.resolve("ItemID", id) ?? `Item ${id}`,
        price: currency === "zenny" ? price(id) : null,
        stages: at,
      })),
    };
  });
}
