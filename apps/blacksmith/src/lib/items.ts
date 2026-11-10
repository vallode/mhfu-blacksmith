/**
 * In-game item IDs (data/items.json) and the name resolution that links them to
 * the material names used in recipe/drop data. Shared by scripts/generate-data.ts
 * (builds the items bundle) and scripts/validate.ts (checks every material
 * resolves).
 */

/**
 * The game caps item names at this many characters (hence spellings like
 * "Eldr Dragon Bone"). Material names are padded to it when rendered, so a
 * list lines up in one column the way the game's does.
 */
export const ITEM_NAME_LENGTH = 16;

/** One entry of data/items.json (see data/schemas/item.schema.json). */
export interface ItemRecord {
  id: number;
  name: string;
  name_jp: string;
  aliases?: string[];
  rarity?: number;
  regions?: ("jp" | "us" | "eu")[];
  placeholder?: true;
}

/**
 * Normalise a material name for matching: drop a trailing quantity suffix used
 * by monster drop tables ("Akantor Claw x1"), collapse whitespace, lowercase.
 */
export function normalizeItemName(name: string): string {
  return name
    .replace(/\s+x\d+$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Build a normalised-name -> item ID lookup from `name` and `aliases`.
 * Names claimed by more than one ID are reported in `collisions` and left out.
 */
export function buildItemNameIndex(items: ItemRecord[]): {
  index: Map<string, number>;
  collisions: Map<string, number[]>;
} {
  const owners = new Map<string, Set<number>>();
  for (const item of items) {
    for (const n of [item.name, ...(item.aliases ?? [])]) {
      const key = normalizeItemName(n);
      if (!key) continue;
      const set = owners.get(key) ?? new Set<number>();
      set.add(item.id);
      owners.set(key, set);
    }
  }
  const index = new Map<string, number>();
  const collisions = new Map<string, number[]>();
  for (const [key, ids] of owners) {
    if (ids.size === 1) index.set(key, [...ids][0]);
    else collisions.set(key, [...ids]);
  }
  return { index, collisions };
}

/**
 * Decorations whose name in data/decorations.json is spelled differently from
 * their item in data/items.json (the game's shortened item names).
 */
export const DECORATION_ITEM_ALIASES: Record<string, string> = {
  "Constitutn Jewel": "ConstitutnJewel",
  "StrongShot Jewel+": "StrongShotJewel+",
};

/** A decoration's in-game item ID, or undefined if no item matches its name. */
export function decorationItemId(name: string, index: Map<string, number>): number | undefined {
  return index.get(normalizeItemName(DECORATION_ITEM_ALIASES[name] ?? name));
}
