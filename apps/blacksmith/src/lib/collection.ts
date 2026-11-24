/**
 * The equipment-based Guild Card collection awards, worked out from the
 * loaded hunter's equipment box:
 *
 * - **Wyverian Artisan's Hammer** (award 22): four weapons from each of the
 *   eleven weapon classes' lists. Each box slot counts, so two copies of one
 *   weapon are two. `ARTISAN_WEAPONS` is the game's list.
 * - **Wyverian Artisan's Mitten** (award 46): five pieces of each armor slot
 *   at the site's rarity 9 or more.
 *
 * The counts themselves come from `award-collection.ts`, shared with the
 * Awards page's rules. The view shows what each award still needs, and the
 * eligible pieces the hunter doesn't own yet.
 */
import {
  ARTISAN_HAMMER_AWARD,
  ARTISAN_HAMMER_NEEDED,
  ARTISAN_MITTEN_AWARD,
  ARTISAN_MITTEN_NEEDED,
  ARTISAN_MITTEN_RARITY,
  ARTISAN_WEAPON_CATEGORIES,
  artisanHammerCounts,
  artisanMittenCounts,
} from "./award-collection";
import { ARTISAN_WEAPONS } from "./award-weapons";
import { ARMOR_SLOTS, WEAPON_TYPES, type ArmorSlot, type WeaponType } from "./constants";
import { resolveEquip } from "./equipment-ref";
import { EQUIP_TYPE_SLOTS, type EquipRef, type EquipmentIds } from "./schema";
import type { EquipSlot } from "./save-store";

export type CollectionCategory = WeaponType | ArmorSlot;
export type CollectionKind = "weapon" | "armor";

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
  /** Its index in AWARDS and data/mhfu/awards.json. */
  index: number;
  groups: CollectionAwardGroup[];
  /** Types whose count is already met. */
  done: number;
  total: number;
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

/** The eligible pieces of a table an incomplete group doesn't own, rarest first. */
function missingFromTable(
  ids: EquipmentIds,
  type: number,
  held: ReadonlySet<number>,
  eligible: (ref: EquipRef, id: number) => boolean,
): CollectionMissingPiece[] {
  return (ids[type] ?? [])
    .flatMap((ref, id) => {
      if (!ref || held.has(id) || !eligible(ref, id)) return [];
      const piece = missingPiece(ids, type, id);
      return piece ? [piece] : [];
    })
    .sort(comparePieces);
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
  const counts = artisanHammerCounts(equipment);
  const groups = ARTISAN_WEAPONS.map(([type, list], weaponClass) => {
    const category = ARTISAN_WEAPON_CATEGORIES[weaponClass];
    if (!category) return null;
    const owned = counts[weaponClass] ?? 0;
    let missingPieces: CollectionMissingPiece[] = [];
    if (owned < ARTISAN_HAMMER_NEEDED) {
      const listed = new Set(list);
      const held = new Set(
        equipment
          .filter((slot) => slot.type === type && listed.has(slot.id))
          .map((slot) => slot.id),
      );
      missingPieces = missingFromTable(ids, type, held, (_ref, id) => listed.has(id));
    }
    return awardGroup(category, "weapon", owned, ARTISAN_HAMMER_NEEDED, missingPieces);
  }).filter((group): group is CollectionAwardGroup => group !== null);
  // ARTISAN_WEAPONS lists the classes in the game's order, not the site's.
  return WEAPON_TYPES.flatMap((category) => groups.filter((g) => g.category === category));
}

/** The armor-slot groups of the Artisan's Mitten, in the site's slot order. */
function artisanArmorGroups(
  equipment: readonly EquipSlot[],
  ids: EquipmentIds,
): CollectionAwardGroup[] {
  const counts = artisanMittenCounts(equipment, ids);
  return ARMOR_SLOTS.map((category) => {
    const type = EQUIP_TYPE_SLOTS.indexOf(category);
    const owned = counts[type] ?? 0;
    let missingPieces: CollectionMissingPiece[] = [];
    if (owned < ARTISAN_MITTEN_NEEDED) {
      const held = new Set(equipment.filter((slot) => slot.type === type).map((slot) => slot.id));
      missingPieces = missingFromTable(
        ids,
        type,
        held,
        (ref) => (ref[2] ?? 0) >= ARTISAN_MITTEN_RARITY,
      );
    }
    return awardGroup(category, "armor", owned, ARTISAN_MITTEN_NEEDED, missingPieces);
  });
}

function award(index: number, groups: CollectionAwardGroup[]): CollectionAward {
  return {
    index,
    groups,
    done: groups.filter((group) => group.missing === 0).length,
    total: groups.length,
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
