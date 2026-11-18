"use client";

/**
 * Resolves a save file's equipment box (equip type code + equipment ID per
 * slot, see public/javascript/save-worker.js) to item pages, via the
 * equipment-ids.json bundle that scripts/generate-data.ts builds from
 * the weapons' and armor's game IDs in data/.
 */
import { useEffect, useState } from "react";
import type { EquipmentIds } from "./schema";

export { resolveEquip, type ResolvedEquip } from "./equipment-ref";

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

/** The equipment ID table, or null while it loads (or if it failed to). Fetches nothing while `enabled` is false. */
export function useEquipmentIds(enabled = true): { ids: EquipmentIds | null; error: boolean } {
  const [ids, setIds] = useState<EquipmentIds | null>(idsCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (ids || !enabled) return;
    let cancelled = false;
    getEquipmentIds().then(
      (v) => !cancelled && setIds(v),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, [ids, enabled]);
  return { ids, error };
}
