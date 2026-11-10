/**
 * `build-data`'s `items` target: writes each item's rarity, carry limit and
 * price from the disc's item table (`emit/items.ts`) into `data/items.json`,
 * pairing by ID. Names, aliases, regions and placeholder flags stay as
 * committed; placeholders get no stats.
 */
import type { EmittedItem } from "../emit/items.js";

export const ITEM_STAT_FIELDS = ["rarity", "carry", "price"] as const;
export type ItemStatField = (typeof ITEM_STAT_FIELDS)[number];

interface CommittedItem {
  id: number;
  name: string;
  rarity?: number;
  carry?: number;
  price?: number;
  regions?: string[];
  placeholder?: true;
  [key: string]: unknown;
}

/** One stat the disc changed; `before` is undefined where the committed item had none. */
export interface ItemStatChange {
  id: number;
  name: string;
  field: ItemStatField;
  before: number | undefined;
  after: number;
}

export interface ItemStatsMerge {
  content: { items: CommittedItem[] } & Record<string, unknown>;
  changes: ItemStatChange[];
  /** Committed, non-placeholder items the disc has no entry for, left as they were. */
  missing: { id: number; name: string }[];
}

/**
 * The committed file with the disc's stats on every item but the
 * placeholders. New stats go before `regions`; every other key keeps its
 * place.
 */
export function mergeItemStats(committed: unknown, disc: EmittedItem[]): ItemStatsMerge {
  const doc = committed as ItemStatsMerge["content"];
  if (!Array.isArray(doc?.items)) throw new Error("data/items.json has no items array");
  const byId = new Map(disc.map((item) => [item.id, item]));
  const changes: ItemStatChange[] = [];
  const missing: ItemStatsMerge["missing"] = [];

  const items = doc.items.map((item) => {
    const found = byId.get(item.id);
    if (item.placeholder || !found) {
      if (!item.placeholder) missing.push({ id: item.id, name: item.name });
      return item;
    }
    const stats = { rarity: found.rarity, carry: found.carry, price: found.price };
    for (const field of ITEM_STAT_FIELDS) {
      if (item[field] !== found[field])
        changes.push({
          id: item.id,
          name: item.name,
          field,
          before: item[field],
          after: found[field],
        });
    }
    // `regions` last: spreading `rest` keeps every other key where it was.
    const { regions, ...rest } = item;
    const out: CommittedItem = { ...rest, ...stats };
    if (regions) out.regions = regions;
    return out;
  });
  return { content: { ...doc, items }, changes, missing };
}
