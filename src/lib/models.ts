"use client";

import { useEffect, useState } from "react";

/**
 * 3D models extracted from the game by tools/mhfu-extract (`export-site`)
 * live under public/models/, listed in public/models/manifest.json. Keys are
 * the site's own names, paths are relative to /models/.
 */
export interface ModelManifest {
  /** "<monster name>" */
  monsters: Record<string, string>;
  /** "<weapon type>/<weapon name>" */
  weapons: Record<string, string>;
  /** "<armor slot>/<piece name>", or "...|Male"/"...|Female" for same-named pieces */
  armor: Record<string, { male?: string; female?: string }>;
}

let manifestPromise: Promise<ModelManifest | null> | null = null;

function loadManifest(): Promise<ModelManifest | null> {
  manifestPromise ??= fetch("/models/manifest.json")
    .then((res) => (res.ok ? (res.json() as Promise<ModelManifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

/** Resolve something from the manifest once it's loaded; null while loading, when absent, or offline without it. */
function useManifestLookup<T>(key: string | null, pick: (manifest: ModelManifest, key: string) => T | null | undefined): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    setValue(null);
    if (!key) return;
    loadManifest().then((manifest) => {
      const found = manifest ? pick(manifest, key) : null;
      if (!cancelled && found) setValue(found);
    });
    return () => {
      cancelled = true;
    };
    // `pick` is a stable module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

const url = (relative: string | undefined) => (relative ? `/models/${relative}` : undefined);

const pickMonster = (m: ModelManifest, key: string) => url(m.monsters?.[key]);
const pickWeapon = (m: ModelManifest, key: string) => url(m.weapons?.[key]);

/** URL of a monster's model. */
export function useMonsterModel(name: string | undefined): string | null {
  return useManifestLookup(name ?? null, pickMonster);
}

/** URL of a weapon's model. */
export function useWeaponModel(type: string, name: string | undefined): string | null {
  return useManifestLookup(name ? `${type}/${name}` : null, pickWeapon);
}

export interface ArmorModelUrls {
  male?: string;
  female?: string;
}

const pickArmor = (m: ModelManifest, key: string): ArmorModelUrls | null => {
  const [base, sex] = key.split("\n") as [string, string];
  // Same-named male/female pieces are keyed "<slot>/<name>|<sex>".
  const files = (sex ? m.armor?.[`${base}|${sex}`] : undefined) ?? m.armor?.[base];
  if (!files) return null;
  // A single-sex piece only shows that sex's model.
  const male = sex === "Female" ? undefined : url(files.male);
  const female = sex === "Male" ? undefined : url(files.female);
  return male || female ? { male, female } : null;
};

/** URLs of an armor piece's male and/or female models. `sex` is the piece's data value ("Male", "Female" or "Male/Female"). */
export function useArmorModel(slot: string, name: string | undefined, sex: string | undefined): ArmorModelUrls | null {
  const single = sex === "Male" || sex === "Female" ? sex : "";
  return useManifestLookup(name ? `${slot}/${name}\n${single}` : null, pickArmor);
}
