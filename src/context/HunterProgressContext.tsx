"use client";

/**
 * Shares the loaded hunter's owned items and upgrade checks with every tree
 * row, so the weapon/armor/decoration trees can mark them without each call
 * site wiring props through. Inactive (and fetches nothing) until a save
 * with an equipment box is loaded.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSave } from "@/context/SaveContext";
import { getBundle, getDictionaries, peekBundle, peekDictionaries } from "@/lib/client-data";
import { useEquipmentIds } from "@/lib/equipment";
import { checkUpgrade, itemBoxCounts, ownedHrefs, type UpgradeCheck } from "@/lib/hunter-progress";
import type { WeaponBundle } from "@/lib/schema";

interface HunterProgressValue {
  /** A save with an equipment box is loaded and its IDs are resolved. */
  active: boolean;
  /** Hrefs of the item pages the hunter owns; null until resolved. */
  owned: Set<string> | null;
  /** Item box quantities by item ID; null for older stored saves. */
  counts: Map<number, number> | null;
  zenny: number | undefined;
  isOwned: (href: string) => boolean;
  /** Can the hunter make this weapon from its tree parent now? null while its data loads. */
  upgradeCheck: (type: string, slug: string) => UpgradeCheck | null;
}

const INACTIVE: HunterProgressValue = {
  active: false,
  owned: null,
  counts: null,
  zenny: undefined,
  isOwned: () => false,
  upgradeCheck: () => null,
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

  const owned = useMemo(() => (ids && enabled ? ownedHrefs(ids, save) : null), [ids, enabled, save]);
  const counts = useMemo(() => itemBoxCounts(save), [save]);
  const zenny = save?.zenny;

  useEffect(() => {
    if (wanted.size === 0) return;
    let cancelled = false;
    Promise.all([getDictionaries(), ...[...wanted].map((f) => getBundle(f))]).then(
      () => !cancelled && setLoaded((n) => n + 1),
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  const isOwned = useCallback((href: string) => owned?.has(href) ?? false, [owned]);

  const upgradeCheck = useCallback(
    (type: string, slug: string): UpgradeCheck | null => {
      const file = `weapon-${type}`;
      const bundle = peekBundle(file) as WeaponBundle | null;
      const dict = peekDictionaries();
      if (!bundle || !dict) {
        // Ask for it after render; rows re-render once it's in.
        queueMicrotask(() => setWanted((w) => (w.has(file) ? w : new Set(w).add(file))));
        return null;
      }
      const weapon = bundle.items.find((w) => w.s === slug);
      return weapon ? checkUpgrade(dict, weapon, counts, zenny) : { status: "unknown" };
    },
    // `loaded` re-creates the callback so rows re-check once a bundle arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counts, zenny, loaded]
  );

  const value = useMemo<HunterProgressValue>(
    () => (owned ? { active: true, owned, counts, zenny, isOwned, upgradeCheck } : INACTIVE),
    [owned, counts, zenny, isOwned, upgradeCheck]
  );

  return <HunterProgressContext.Provider value={value}>{children}</HunterProgressContext.Provider>;
}

export function useHunterProgress() {
  return useContext(HunterProgressContext);
}
