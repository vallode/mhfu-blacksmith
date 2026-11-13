/**
 * An equipment ID (equip type code + ID, as a save file's equipment box and
 * set share codes hold them) to its item page, via the equipment-ids.json
 * bundle. Pure, so the Cloudflare Worker (src/cloudflare/worker.ts) can use
 * it through set-codec.ts; equipment.ts loads the bundle.
 */
import { ARMOR_RANKS, WEAPON_TYPES } from "./constants";
import { EQUIP_TYPE_SLOTS, type EquipmentIds } from "./schema";
import type { EquipSlot } from "./save-store";
import { slugify } from "./slug";

/** A weapon's page. */
export const weaponHref = (type: string, slug: string) => `/blacksmith/${type}/${slug}/`;

export interface ResolvedEquip {
  name: string;
  /** Only for armor sold as separate Male and Female pieces under one name. */
  sex?: string;
  rarity: number | null;
  /** Weapon type or armor slot; also the icon type. */
  category: string;
  href: string;
}

/** null for an unknown type code or an ID with no page. */
export function resolveEquip(ids: EquipmentIds, slot: EquipSlot): ResolvedEquip | null {
  const ref = ids[slot.type]?.[slot.id];
  if (!ref) return null;
  const [group, name, rarity, slug = slugify(name), sex] = ref;
  const typeSlot = EQUIP_TYPE_SLOTS[slot.type];
  if (typeSlot === "melee" || typeSlot === "ranged") {
    const type = WEAPON_TYPES[group];
    return { name, rarity, category: type, href: weaponHref(type, slug) };
  }
  return {
    name,
    rarity,
    category: typeSlot,
    href: `/armorsmith/${typeSlot}/${ARMOR_RANKS[group]}/${slug}/`,
    ...(sex ? { sex } : {}),
  };
}
