/**
 * Item categories, by in-game item ID. The game numbers its items in groups
 * (consumables, then tools, ammo, gathered goods, monster materials, …), so
 * each category is one or more ID ranges. data/ has no category of its own
 * for items, so these ranges are read off the item list.
 */

export interface ItemCategory {
  slug: string;
  label: string;
  /** Inclusive item ID ranges */
  ranges: readonly (readonly [number, number])[];
}

/** In item ID order (by each category's first ID). */
export const ITEM_CATEGORIES = [
  // Books of Combos and the Alchemy Guide, then the guides and monster info
  // books the Guild Store sells.
  {
    slug: "books",
    label: "Books",
    ranges: [
      [1, 6],
      [829, 859],
    ],
  },
  // Potions, drinks, pills, meat and cooked fish.
  { slug: "consumables", label: "Consumables", ranges: [[7, 56]] },
  // Throwing items, bombs, traps, barrels, bait, pickaxes, bugnets, flutes.
  {
    slug: "tools",
    label: "Tools",
    ranges: [
      [57, 92],
      [136, 160],
    ],
  },
  // Huskberry and bone husks (ammo combos), shots and coatings.
  { slug: "ammo", label: "Ammo & Coatings", ranges: [[93, 135]] },
  // Honey, herbs, mushrooms, seeds and berries.
  { slug: "plants", label: "Plants", ranges: [[161, 196]] },
  // Shells, pearls, stones, ores and crystals.
  { slug: "ores", label: "Ores & Minerals", ranges: [[197, 221]] },
  { slug: "armor-spheres", label: "Armor Spheres", ranges: [[222, 228]] },
  { slug: "fish", label: "Fish", ranges: [[229, 245]] },
  { slug: "insects", label: "Insects", ranges: [[246, 265]] },
  // Sacs, extracts, bones, wyvern fangs/claws/stones, organs and treasures
  // that many monsters share.
  { slug: "common-materials", label: "Common Materials", ranges: [[266, 319]] },
  // One monster's scales, shells, hides and parts, monster by monster.
  { slug: "monster-materials", label: "Monster Materials", ranges: [[320, 815]] },
  // Wyverian Harp, Sinister Cloth, Lost Umbrella, ruststones, ancient stones.
  { slug: "relics", label: "Relics", ranges: [[816, 828]] },
  // Eggs to deliver, supply box items, ballista and cannon shots.
  { slug: "quest-items", label: "Quest Items", ranges: [[860, 883]] },
  { slug: "coins-tickets", label: "Coins & Tickets", ranges: [[884, 943]] },
  { slug: "jewels", label: "Jewels", ranges: [[944, 1115]] },
  // Treasure Hunting's treasures, rare gatherables and fish.
  { slug: "treasures", label: "Treasures", ranges: [[1116, 1260]] },
] as const satisfies readonly ItemCategory[];

export type ItemCategorySlug = (typeof ITEM_CATEGORIES)[number]["slug"];

/** The category an item ID is in; "other" if no range has it. */
export function itemCategory(id: number): ItemCategorySlug | "other" {
  const found = ITEM_CATEGORIES.find((c) => c.ranges.some(([from, to]) => id >= from && id <= to));
  return found?.slug ?? "other";
}

export function itemCategoryLabel(slug: string): string {
  return ITEM_CATEGORIES.find((c) => c.slug === slug)?.label ?? "Other";
}
