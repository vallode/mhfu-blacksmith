/**
 * The two equipment-based Guild Card collection awards' rules: the Wyverian
 * Artisan's Hammer (four weapons from each of eleven class lists) and the
 * Wyverian Artisan's Mitten (five rarity-9+ pieces of each armor slot).
 *
 * Shared by the Awards page's rules and the Collection page's breakdown, so
 * their counts can't drift apart.
 */
import { ARTISAN_WEAPONS } from "./award-weapons";
import type { WeaponType } from "./constants";
import type { EquipmentIds } from "./schema";
import type { EquipSlot } from "./save-store";

/** The awards' indexes in AWARDS and data/awards.json. */
export const ARTISAN_HAMMER_AWARD = 22;
export const ARTISAN_MITTEN_AWARD = 46;
export const ARTISAN_HAMMER_NEEDED = 4;
export const ARTISAN_MITTEN_NEEDED = 5;
/** The game's rarity 8, the site's 9. */
export const ARTISAN_MITTEN_RARITY = 9;

/**
 * Each ARTISAN_WEAPONS entry's weapon type, in its order: Sword and Shield,
 * Great Sword, Lance, Hammer, Dual Blades, Light Bowgun, Heavy Bowgun, Long
 * Sword, Bow, Gunlance and Hunting Horn.
 */
export const ARTISAN_WEAPON_CATEGORIES: readonly WeaponType[] = [
  "sword-and-shield",
  "great-sword",
  "lance",
  "hammer",
  "dual-blades",
  "light-bowgun",
  "heavy-bowgun",
  "long-sword",
  "bow",
  "gunlance",
  "hunting-horn",
];

/** The Artisan's Hammer's weapon class of each listed weapon, by `type:id`. */
const ARTISAN_CLASS = new Map(
  ARTISAN_WEAPONS.flatMap(([type, ids], weaponClass) =>
    ids.map((id) => [`${type}:${id}`, weaponClass] as const),
  ),
);

/** Box slots held from each Artisan's Hammer class, in ARTISAN_WEAPONS order. */
export function artisanHammerCounts(equipment: readonly EquipSlot[]): number[] {
  const held = ARTISAN_WEAPONS.map(() => 0);
  for (const slot of equipment) {
    const weaponClass = ARTISAN_CLASS.get(`${slot.type}:${slot.id}`);
    if (weaponClass !== undefined) held[weaponClass]!++;
  }
  return held;
}

/** Rarity 9+ box slots held in each armor equip type code (0 leggings … 4 waist). */
export function artisanMittenCounts(equipment: readonly EquipSlot[], ids: EquipmentIds): number[] {
  return [0, 1, 2, 3, 4].map(
    (type) =>
      equipment.filter(
        (slot) => slot.type === type && (ids[type]?.[slot.id]?.[2] ?? 0) >= ARTISAN_MITTEN_RARITY,
      ).length,
  );
}
