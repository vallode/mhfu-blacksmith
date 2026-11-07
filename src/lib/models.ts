"use client";

import { useEffect, useState } from "react";

/**
 * 3D models extracted from the game by tools/mhfu-extract (`export-site`)
 * live under public/models/, listed in public/models/manifest.json.
 */
export interface ModelManifest {
  /** Site monster name -> path relative to /models/. */
  monsters: Record<string, string>;
}

let manifestPromise: Promise<ModelManifest | null> | null = null;

function loadManifest(): Promise<ModelManifest | null> {
  manifestPromise ??= fetch("/models/manifest.json")
    .then((res) => (res.ok ? (res.json() as Promise<ModelManifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

/** URL of a monster's model, or null when there is none (or the manifest can't be loaded, e.g. offline). */
export function useMonsterModel(name: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!name) return;
    loadManifest().then((manifest) => {
      const relative = manifest?.monsters[name];
      if (!cancelled && relative) setUrl(`/models/${relative}`);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);
  return url;
}
