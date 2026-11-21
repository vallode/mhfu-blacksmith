"use client";

/**
 * An armor piece's set (lib/armor-sets.ts), matched in the browser from the
 * same cached bundles as the armor pages: every slot's pieces of its rank,
 * and the equipment ID table for the game IDs the matching orders by. The
 * sets aren't in the bundles, which would grow them past their size budget.
 */
import { useEffect, useState } from "react";
import { getBundle, getDictionaries } from "./client-data";
import { ARMOR_SLOTS, type ArmorSlot } from "./constants";
import { getEquipmentIds } from "./equipment";
import { armorGameIds, armorSetMatcher, type ArmorSetNames } from "./armor-sets";
import { decodeArmor, EQUIP_TYPE_SLOTS, type ArmorBundle } from "./schema";

/** A rank's set matcher, and where each slot's pieces sit in it, by slug. */
interface RankSets {
  setOf: (slot: ArmorSlot, index: number) => ArmorSetNames | null;
  indices: Record<ArmorSlot, Map<string, number>>;
}

const rankSets = new Map<string, Promise<RankSets>>();

function getRankSets(rank: string): Promise<RankSets> {
  let promise = rankSets.get(rank);
  if (!promise) {
    promise = Promise.all([
      getDictionaries(),
      getEquipmentIds(),
      Promise.all(ARMOR_SLOTS.map((slot) => getBundle(`armor-${slot}-${rank}`))),
    ]).then(([dict, ids, bundles]) => {
      const pieces = Object.fromEntries(
        ARMOR_SLOTS.map((slot, i) => {
          const decoded = (bundles[i] as ArmorBundle).items.map((item) =>
            decodeArmor(dict, item, slot),
          );
          const gameIds = armorGameIds(ids[EQUIP_TYPE_SLOTS.indexOf(slot)] ?? [], decoded);
          return [slot, decoded.map((p, j) => ({ ...p, id: gameIds[j]! }))];
        }),
      ) as Record<ArmorSlot, (ReturnType<typeof decodeArmor> & { id: number })[]>;
      return {
        setOf: armorSetMatcher(pieces),
        indices: Object.fromEntries(
          ARMOR_SLOTS.map((slot) => [slot, new Map(pieces[slot].map((p, i) => [p.slug, i]))]),
        ) as RankSets["indices"],
      };
    });
    promise.catch(() => rankSets.delete(rank)); // allow a retry, e.g. once back online
    rankSets.set(rank, promise);
  }
  return promise;
}

/**
 * The set of the piece `slug` in `slot` at `rank`, by name per slot; null
 * while loading, if it has none, or until `enabled`.
 */
export function useArmorSet(
  slot: ArmorSlot,
  rank: string,
  slug: string,
  enabled = true,
): ArmorSetNames | null {
  const [found, setFound] = useState<{ key: string; set: ArmorSetNames | null } | null>(null);
  const key = `${slot}/${rank}/${slug}`;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getRankSets(rank).then(
      ({ setOf, indices }) => {
        const index = indices[slot].get(slug);
        if (!cancelled) setFound({ key, set: index === undefined ? null : setOf(slot, index) });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, key, rank, slot, slug]);
  return found?.key === key ? found.set : null;
}
