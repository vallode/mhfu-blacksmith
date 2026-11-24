/**
 * The equipment-based Guild Card collection awards, worked out from the
 * loaded hunter's equipment box:
 *
 * - **Wyverian Artisan's Hammer** (award 22): four weapons from each of the
 *   eleven weapon classes' lists in the box. Each box slot counts, so two
 *   copies of one weapon are two. `ARTISAN_WEAPONS` is the game's list.
 * - **Wyverian Artisan's Mitten** (award 46): five pieces of each armor slot
 *   in the box at the game's rarity 8 or more (the site's 9 or more).
 *
 * The view shows the counts each award still needs, and the eligible pieces
 * the hunter doesn't own yet.
 */
import { ARTISAN_WEAPONS } from "./award-weapons";
import { ARMOR_SLOTS, WEAPON_TYPES, type ArmorSlot, type WeaponType } from "./constants";
import { resolveEquip } from "./equipment-ref";
import { EQUIP_TYPE_SLOTS, type EquipmentIds } from "./schema";
import type { EquipSlot } from "./save-store";

export type CollectionCategory = WeaponType | ArmorSlot;
export type CollectionKind = "weapon" | "armor";

/** Four weapons from each class's list. */
export const ARTISAN_HAMMER_AWARD = 22;
export const ARTISAN_HAMMER_NEEDED = 4;
/** Five rarity 9+ pieces of each armor slot. */
export const ARTISAN_MITTEN_AWARD = 46;
export const ARTISAN_MITTEN_NEEDED = 5;
export const ARTISAN_MITTEN_RARITY = 9;

/** An eligible piece the hunter doesn't have in the box. */
export interface CollectionMissingPiece {
  key: string;
  /** Its English name; the view shows the game text's translation. */
  name: string;
  rarity: number | null;
  href: string;
}

/** One weapon class or armor slot's share of an award. */
export interface CollectionAwardGroup {
  category: CollectionCategory;
  kind: CollectionKind;
  /** The type's list page: its weapons, or its armor at every rank. */
  href: string;
  /** Box slots that count towards the award, duplicates included. */
  owned: number;
  /** Box slots the award needs from this type. */
  needed: number;
  /** Box slots still to find. */
  missing: number;
  /** Eligible pieces not in the box, for the type's "what's left" list. */
  missingPieces: CollectionMissingPiece[];
}

/** One equipment collection award and the hunter's progress towards it. */
export interface CollectionAward {
  /** Its index in AWARDS and data/awards.json. */
  index: number;
  groups: CollectionAwardGroup[];
  /** Types whose count is already met. */
  done: number;
  total: number;
  /** Box slots counting towards the award. */
  pieces: number;
}

const categoryHref = (category: CollectionCategory, kind: CollectionKind): string =>
  kind === "weapon" ? `/blacksmith/${category}/` : `/armorsmith/${category}/`;

/** Rarest first, then by name, so a missing list reads like the trees. */
function comparePieces(a: CollectionMissingPiece, b: CollectionMissingPiece): number {
  const rarity = (b.rarity ?? -1) - (a.rarity ?? -1);
  if (rarity !== 0) return rarity;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** A resolved missing piece, or null if its ID has no page. */
function missingPiece(ids: EquipmentIds, type: number, id: number): CollectionMissingPiece | null {
  const item = resolveEquip(ids, { type, id });
  if (!item) return null;
  return { key: `${type}:${id}`, name: item.name, rarity: item.rarity, href: item.href };
}

/** A group's counts, from the box slots that count and the pieces it needs. */
function awardGroup(
  category: CollectionCategory,
  kind: CollectionKind,
  owned: number,
  needed: number,
  missingPieces: CollectionMissingPiece[],
): CollectionAwardGroup {
  return {
    category,
    kind,
    href: categoryHref(category, kind),
    owned,
    needed,
    missing: Math.max(0, needed - owned),
    missingPieces,
  };
}

/** The weapon-class groups of the Artisan's Hammer, in the site's weapon order. */
function artisanWeaponGroups(
  equipment: readonly EquipSlot[],
  ids: EquipmentIds,
): CollectionAwardGroup[] {
  const groups = ARTISAN_WEAPONS.flatMap(([type, list]) => {
    const first = ids[type]?.[list[0]];
    const category = first ? WEAPON_TYPES[first[0]] : undefined;
    if (!category) return [];

    const listed = new Set(list);
    const held = new Set<number>();
    let owned = 0;
    for (const slot of equipment) {
      if (slot.type === type && listed.has(slot.id)) {
        owned++;
        held.add(slot.id);
      }
    }

    const missingPieces = [...listed]
      .filter((id) => !held.has(id))
      .flatMap((id) => {
        const piece = missingPiece(ids, type, id);
        return piece ? [piece] : [];
      })
      .sort(comparePieces);

    return [awardGroup(category, "weapon", owned, ARTISAN_HAMMER_NEEDED, missingPieces)];
  });
  // ARTISAN_WEAPONS lists the classes in the game's order, not the site's.
  return WEAPON_TYPES.flatMap((category) => groups.filter((g) => g.category === category));
}

/** The armor-slot groups of the Artisan's Mitten, in the site's slot order. */
function artisanArmorGroups(
  equipment: readonly EquipSlot[],
  ids: EquipmentIds,
): CollectionAwardGroup[] {
  return ARMOR_SLOTS.map((category) => {
    const type = EQUIP_TYPE_SLOTS.indexOf(category);
    const held = new Set(equipment.filter((slot) => slot.type === type).map((slot) => slot.id));
    const owned = equipment.filter(
      (slot) => slot.type === type && (ids[type]?.[slot.id]?.[2] ?? 0) >= ARTISAN_MITTEN_RARITY,
    ).length;
    const missingPieces = (ids[type] ?? [])
      .flatMap((ref, id) => {
        if (!ref || (ref[2] ?? 0) < ARTISAN_MITTEN_RARITY || held.has(id)) return [];
        const piece = missingPiece(ids, type, id);
        return piece ? [piece] : [];
      })
      .sort(comparePieces);
    return awardGroup(category, "armor", owned, ARTISAN_MITTEN_NEEDED, missingPieces);
  });
}

function award(index: number, groups: CollectionAwardGroup[]): CollectionAward {
  return {
    index,
    groups,
    done: groups.filter((group) => group.missing === 0).length,
    total: groups.length,
    pieces: groups.reduce((n, group) => n + group.owned, 0),
  };
}

/** The Artisan's Hammer's weapon-class counts and missing pieces. */
export function weaponCollectionAward(
  equipment: readonly EquipSlot[],
  ids: EquipmentIds,
): CollectionAward {
  return award(ARTISAN_HAMMER_AWARD, artisanWeaponGroups(equipment, ids));
}

/** The Artisan's Mitten's armor-slot counts and missing pieces. */
export function armorCollectionAward(
  equipment: readonly EquipSlot[],
  ids: EquipmentIds,
): CollectionAward {
  return award(ARTISAN_MITTEN_AWARD, artisanArmorGroups(equipment, ids));
}
