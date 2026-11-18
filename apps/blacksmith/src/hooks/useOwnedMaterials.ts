"use client";

import { useEffect, useMemo, useState } from "react";
import { useSave } from "@/context/SaveContext";
import { usePreferences } from "@/context/PreferencesContext";
import { getItems, type ItemLookup } from "@/lib/client-data";
import { ownedItemCounts } from "@/lib/hunter-progress";

/**
 * How many of a recipe material the loaded hunter owns, summed across the item
 * box and pouch. Returns a lookup that gives `null` when no save is loaded, the
 * item names haven't loaded, or the material doesn't link to an in-game item,
 * so callers can fall back to showing only the required amount. Also `null`
 * throughout when material counts are turned off on the Options page.
 *
 * The items bundle is fetched only once a save is loaded.
 */
export function useOwnedMaterials(): (materialName: string) => number | null {
  const { save: loaded } = useSave();
  const { showMaterialCounts } = usePreferences().prefs;
  const save = showMaterialCounts ? loaded : null;
  const [items, setItems] = useState<ItemLookup | null>(null);

  useEffect(() => {
    if (!save || items) return;
    let cancelled = false;
    getItems().then(
      (l) => !cancelled && setItems(l),
      () => {}, // leave counts hidden if the bundle can't be fetched
    );
    return () => {
      cancelled = true;
    };
  }, [save, items]);

  const owned = useMemo(() => ownedItemCounts(save), [save]);

  return (materialName: string) => {
    if (!owned || !items) return null;
    const id = items.materials[materialName];
    if (id === undefined) return null;
    return owned.get(id) ?? 0;
  };
}
