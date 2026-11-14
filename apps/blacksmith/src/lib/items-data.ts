/**
 * Build-time item lookups for static params and page metadata, read from
 * data/items.json. Pages render from public/data/items.json on the client.
 */
import type { ItemRecord } from "./items";
import { DATA_DIR } from "./paths";
import { slugify } from "./slug";
import { readData } from "game-data";

export interface ItemSummary {
  id: number;
  name: string;
  slug: string;
  rarity?: number;
}

let cache: ItemSummary[] | null = null;

/** Every real item (placeholders left out), by ID. */
export function getItemSummaries(): ItemSummary[] {
  if (cache) return cache;
  const { items } = readData<{ items: ItemRecord[] }>(DATA_DIR, "items.json");
  cache = items
    .filter((i) => !i.placeholder)
    .map((i) => ({ id: i.id, name: i.name, slug: slugify(i.name), rarity: i.rarity }));
  return cache;
}

export function getItemSummary(slug: string): ItemSummary | undefined {
  return getItemSummaries().find((i) => i.slug === slug);
}
