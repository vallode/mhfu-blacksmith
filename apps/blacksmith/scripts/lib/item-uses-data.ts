/**
 * Every item's uses (src/lib/item-uses.ts) from the gear in data/: the
 * weapons, armor and decorations with their recipes and the weapons' tree
 * parents. Shared by scripts/generate-data.ts and the tests.
 */
import { ARMOR_RANKS, ARMOR_SLOTS, WEAPON_TYPES } from "../../src/lib/constants";
import { buildItemUses, type ItemUse } from "../../src/lib/item-uses";
import { buildItemNameIndex, normalizeItemName, type ItemRecord } from "../../src/lib/items";
import { armorSlugs, slugify } from "../../src/lib/slug";
import { buildWeaponTree } from "../../src/lib/trees";
import type { ArmorPiece, Decoration, Weapon } from "../../src/lib/types";
import { treeParents } from "../../src/lib/wishlist";
import { readData } from "game-data";

export function itemUsesFromData(dataDir: string): Map<number, ItemUse[]> {
  const { index } = buildItemNameIndex(
    readData<{ items: ItemRecord[] }>(dataDir, "items.json").items,
  );
  return buildItemUses(
    {
      weapons: WEAPON_TYPES.map((type) => ({
        type,
        items: readData<{ weapons: Weapon[] }>(dataDir, "weapons", `${type}.json`).weapons.map(
          (w) => ({ ...w, slug: slugify(w.name) }),
        ),
      })),
      armor: ARMOR_SLOTS.flatMap((slot) => {
        const all = readData<{ armor: ArmorPiece[] }>(dataDir, "armor", `${slot}.json`).armor;
        return ARMOR_RANKS.map((rank) => {
          // Slugged per slot and rank, as the armor bundles are.
          const pieces = all.filter((p) => p.rank === rank);
          const slugs = armorSlugs(pieces);
          return { slot, rank, items: pieces.map((p, i) => ({ ...p, slug: slugs[i]! })) };
        });
      }),
      decorations: readData<{ decorations: Decoration[] }>(
        dataDir,
        "decorations.json",
      ).decorations.map((d) => ({ ...d, slug: slugify(d.name) })),
      parents: treeParents(WEAPON_TYPES.map(buildWeaponTree)),
    },
    (name) => index.get(normalizeItemName(name)),
  );
}
