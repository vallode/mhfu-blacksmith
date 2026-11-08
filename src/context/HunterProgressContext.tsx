"use client";

/**
 * Shares the loaded hunter's owned items and craft checks with every tree
 * row, so the weapon/armor/decoration trees can mark them without each call
 * site wiring props through. Inactive (and fetches nothing) until a save
 * with an equipment box is loaded.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSave } from "@/context/SaveContext";
import { usePreferences } from "@/context/PreferencesContext";
import {
  getBundle,
  getDictionaries,
  getItems,
  peekBundle,
  peekDictionaries,
  type ItemLookup,
} from "@/lib/client-data";
import { useEquipmentIds } from "@/lib/equipment";
import { checkCraft, ownedHrefs, ownedItemCounts, type CraftCheck } from "@/lib/hunter-progress";
import type { WeaponBundle } from "@/lib/schema";

interface HunterProgressValue {
  /** A save with an equipment box is loaded and its IDs are resolved. */
  active: boolean;
  isOwned: (href: string) => boolean;
  /**
   * Can the hunter make this weapon now, forged from scratch or (when they own
   * its tree parent) upgraded? null while its data loads.
   */
  craftCheck: (type: string, slug: string, parentOwned: boolean) => CraftCheck | null;
}

const INACTIVE: HunterProgressValue = {
  active: false,
  isOwned: () => false,
  craftCheck: () => null,
};

const HunterProgressContext = createContext<HunterProgressValue>(INACTIVE);

export function HunterProgressProvider({ children }: { children: React.ReactNode }) {
  const { save } = useSave();
  // Only fetch the equipment ID table once a save with an equipment box is loaded.
  const enabled = Boolean(save?.equipment?.length);
  const { ids } = useEquipmentIds(enabled);
  // Bumped when a bundle this provider asked for finishes loading.
  const [loaded, setLoaded] = useState(0);
  const [wanted, setWanted] = useState<Set<string>>(() => new Set());

  const owned = useMemo(
    () => (ids && enabled ? ownedHrefs(ids, save) : null),
    [ids, enabled, save],
  );
  const counts = useMemo(() => ownedItemCounts(save), [save]);
  // With the zenny check off (Options page), only materials decide.
  const { checkZenny } = usePreferences().prefs;
  const zenny = checkZenny ? save?.zenny : undefined;
  const [items, setItems] = useState<ItemLookup | null>(null);

  useEffect(() => {
    if (!enabled || items) return;
    let cancelled = false;
    getItems().then(
      (l) => !cancelled && setItems(l),
      () => {}, // without item links no weapon is ever flagged
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, items]);

  useEffect(() => {
    if (wanted.size === 0) return;
    let cancelled = false;
    Promise.all([getDictionaries(), ...[...wanted].map((f) => getBundle(f))]).then(
      () => !cancelled && setLoaded((n) => n + 1),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  const isOwned = useCallback((href: string) => owned?.has(href) ?? false, [owned]);

  const craftCheck = useCallback(
    (type: string, slug: string, parentOwned: boolean): CraftCheck | null => {
      const file = `weapon-${type}`;
      const bundle = peekBundle(file) as WeaponBundle | null;
      const dict = peekDictionaries();
      if (!items) return null;
      if (!bundle || !dict) {
        // Ask for it after render; rows re-render once it's in.
        queueMicrotask(() => setWanted((w) => (w.has(file) ? w : new Set(w).add(file))));
        return null;
      }
      const weapon = bundle.items.find((w) => w.s === slug);
      return weapon
        ? checkCraft(dict, items.materials, weapon, counts, zenny, parentOwned)
        : { status: "unknown" };
    },
    // `loaded` re-creates the callback so rows re-check once a bundle arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, counts, zenny, loaded],
  );

  const value = useMemo<HunterProgressValue>(
    () => (owned ? { active: true, isOwned, craftCheck } : INACTIVE),
    [owned, isOwned, craftCheck],
  );

  return <HunterProgressContext.Provider value={value}>{children}</HunterProgressContext.Provider>;
}

export function useHunterProgress() {
  return useContext(HunterProgressContext);
}
