"use client";

import { useEffect, useState } from "react";

/**
 * 3D models extracted from the game by tools/mhfu-extract (`export-site`)
 * live under public/models/. Which item has which model is listed per
 * category, so a page only fetches its own list:
 *
 *   /models/manifest/monsters.json        { "<monster name>": NN }
 *   /models/manifest/weapons/<type>.json  { "<weapon name>": NNN }
 *   /models/manifest/armor/<slot>.json    { "<name>" or "<name>|<Sex>": [maleNNN, femaleNNN] }
 *
 * Values are the game's model IDs (0 = none); the file paths are rebuilt
 * from them below.
 */
type Manifest = Record<string, number | [number, number]>;

const manifests = new Map<string, Promise<Manifest | null>>();
/** Manifests that have finished loading, so hooks can read them synchronously. */
const loadedManifests = new Map<string, Manifest | null>();

function loadManifest(name: string): Promise<Manifest | null> {
  let promise = manifests.get(name);
  if (!promise) {
    promise = fetch(`/models/manifest/${name}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<Manifest>) : null))
      .catch(() => null)
      .then((m) => {
        loadedManifests.set(name, m);
        return m;
      });
    manifests.set(name, promise);
  }
  return promise;
}

/** Start loading a manifest ahead of the page that needs it (e.g. from a layout). */
export function prefetchManifest(name: string): void {
  void loadManifest(name);
}

const pad = (id: number, digits: number) => String(id).padStart(digits, "0");

/** Model folder per armor slot, as in the game's player/<m|f>/<folder>/ files. */
const ARMOR_FOLDER: Record<string, string> = {
  helmet: "hair",
  plate: "body",
  gauntlets: "arm",
  waist: "wst",
  leggings: "reg",
};

/** Resolve a value from one manifest once it's loaded; null while loading, when absent, or offline without it. */
function useManifestValue<T>(
  manifest: string | null,
  item: string,
  pick: (m: Manifest) => T | null,
): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    setValue(null);
    if (!manifest) return;
    loadManifest(manifest).then((m) => {
      const found = m ? pick(m) : null;
      if (!cancelled && found) setValue(found);
    });
    return () => {
      cancelled = true;
    };
    // `pick` only reads values `item` encodes, so it isn't a dependency itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, item]);
  // An already-loaded manifest answers during render, so the model button
  // shows up with the rest of the page instead of a frame later.
  const loaded = manifest ? loadedManifests.get(manifest) : undefined;
  if (loaded !== undefined) return loaded ? pick(loaded) : null;
  return value;
}

/** URL of a monster's model. */
export function useMonsterModel(name: string | undefined): string | null {
  return useManifestValue(name ? "monsters" : null, name ?? "", (m) => {
    const id = name ? m[name] : undefined;
    return typeof id === "number" && id ? `/models/monsters/em${pad(id, 2)}.glb` : null;
  });
}

/** URL of a weapon's model. */
export function useWeaponModel(type: string, name: string | undefined): string | null {
  return useManifestValue(name ? `weapons/${type}` : null, name ?? "", (m) => {
    const id = name ? m[name] : undefined;
    return typeof id === "number" && id ? `/models/weapons/we${pad(id, 3)}.glb` : null;
  });
}

export interface ArmorModelUrls {
  male?: string;
  female?: string;
}

/** URLs of an armor piece's male and/or female models. `sex` is the piece's data value ("Male", "Female" or "Male/Female"). */
export function useArmorModel(
  slot: string,
  name: string | undefined,
  sex: string | undefined,
): ArmorModelUrls | null {
  const single = sex === "Male" || sex === "Female" ? sex : null;
  const folder = ARMOR_FOLDER[slot];
  const result = useManifestValue(
    name && folder ? `armor/${slot}` : null,
    `${name}|${single}`,
    (m) => {
      if (!name) return null;
      // Same-named male/female pieces are keyed "<name>|<Sex>".
      const ids = (single ? m[`${name}|${single}`] : undefined) ?? m[name];
      if (!Array.isArray(ids)) return null;
      const url = (sexPrefix: "m" | "f", id: number) =>
        id ? `/models/armor/${sexPrefix}_${folder}${pad(id, 3)}.glb` : undefined;
      // A single-sex piece only shows that sex's model.
      const male = single === "Female" ? undefined : url("m", ids[0]);
      const female = single === "Male" ? undefined : url("f", ids[1]);
      return male || female ? { male, female } : null;
    },
  );
  return result;
}
