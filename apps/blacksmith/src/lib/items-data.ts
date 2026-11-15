/**
 * Build-time item lookups for static params and page metadata, read from
 * data/<game>/items.json by ID (game-records.ts): names in the page's
 * language, slugs from the English names. Pages render from public/data/<game>/items.json on the client.
 */
import { gameRecords } from "./game-records";
import { slugify } from "./slug";

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
  const records = gameRecords();
  const { items } = records.raw<{
    items: { id: number; placeholder?: boolean; rarity?: number }[];
  }>("items.json");
  cache = items
    .filter((i) => !i.placeholder)
    .map((i) => ({
      id: i.id,
      name: records.strings.name("item", i.id),
      slug: slugify(records.englishStrings.name("item", i.id)),
      rarity: i.rarity,
    }));
  return cache;
}

export function getItemSummary(slug: string): ItemSummary | undefined {
  return getItemSummaries().find((i) => i.slug === slug);
}
