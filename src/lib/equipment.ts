"use client";

/**
 * Resolves a save file's equipment box (equip type code + equipment ID per
 * slot, see public/javascript/save-worker.js) to item pages, via the
 * equipment-ids.json bundle that scripts/generate-data.ts builds from
 * data/equipment-ids.json.
 */
import { useEffect, useState } from "react";
import { ARMOR_RANKS, WEAPON_TYPES } from "./constants";
import { EQUIP_TYPE_SLOTS, type EquipmentIds } from "./schema";
import type { EquipSlot } from "./save-store";
import { slugify } from "./slug";

export interface ResolvedEquip {
  name: string;
  /** Only for armor sold as separate Male and Female pieces under one name. */
  sex?: string;
  rarity: number | null;
  /** Weapon type or armor slot; also the icon type. */
  category: string;
  href: string;
}

let idsPromise: Promise<EquipmentIds> | null = null;
let idsCache: EquipmentIds | null = null;

export function getEquipmentIds(): Promise<EquipmentIds> {
  if (idsCache) return Promise.resolve(idsCache);
  if (!idsPromise) {
    idsPromise = fetch("/data/equipment-ids.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch equipment IDs: ${res.status}`);
        return res.json() as Promise<EquipmentIds>;
      })
      .then((ids) => (idsCache = ids))
      .catch((err) => {
        idsPromise = null; // allow a retry, e.g. once back online
        throw err;
      });
  }
  return idsPromise;
}

/** The equipment ID table, or null while it loads (or if it failed to). */
export function useEquipmentIds(): { ids: EquipmentIds | null; error: boolean } {
  const [ids, setIds] = useState<EquipmentIds | null>(idsCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (ids) return;
    let cancelled = false;
    getEquipmentIds().then(
      (v) => !cancelled && setIds(v),
      () => !cancelled && setError(true)
    );
    return () => {
      cancelled = true;
    };
  }, [ids]);
  return { ids, error };
}

/** null for an unknown type code or an ID with no page. */
export function resolveEquip(ids: EquipmentIds, slot: EquipSlot): ResolvedEquip | null {
  const ref = ids[slot.type]?.[slot.id];
  if (!ref) return null;
  const [group, name, rarity, slug = slugify(name), sex] = ref;
  const typeSlot = EQUIP_TYPE_SLOTS[slot.type];
  if (typeSlot === "melee" || typeSlot === "ranged") {
    const type = WEAPON_TYPES[group];
    return { name, rarity, category: type, href: `/blacksmith/${type}/${slug}/` };
  }
  return {
    name,
    rarity,
    category: typeSlot,
    href: `/armorsmith/${typeSlot}/${ARMOR_RANKS[group]}/${slug}/`,
    ...(sex ? { sex } : {}),
  };
}
