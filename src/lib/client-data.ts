"use client";

/**
 * Client-side data access for the compact /data/*.json bundles.
 *
 * - fetch through a module-level Map cache (served from the SW precache when offline)
 * - decode() hydrates compact shapes back into the full Weapon / ArmorPiece /
 *   Monster / Decoration / WeaponTreeNode types used by the render components
 * - hooks resolve synchronously from the module cache when possible, so
 *   navigating between already-loaded items renders with no loading frame
 * - typed hooks return { item, tree, loading }
 */
import { useEffect, useState } from "react";
import type {
  Weapon,
  ArmorPiece,
  Monster,
  Decoration,
  WeaponTreeNode,
} from "./types";
import {
  type Dictionaries,
  type Bundle,
  type WeaponBundle,
  type ArmorBundle,
  type MonsterBundle,
  type DecorationBundle,
  decodeWeapon,
  decodeArmor,
  decodeMonster,
  decodeDecoration,
  decodeTree,
} from "./schema";

// ---------------------------------------------------------------------------
// Module-level caches
// ---------------------------------------------------------------------------
let dictionariesPromise: Promise<Dictionaries> | null = null;
let dictionariesCache: Dictionaries | null = null;
const bundlePromises = new Map<string, Promise<Bundle>>();
const bundleCache = new Map<string, Bundle>();

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return (await res.json()) as T;
}

export function getDictionaries(): Promise<Dictionaries> {
  if (dictionariesCache) return Promise.resolve(dictionariesCache);
  if (!dictionariesPromise) {
    dictionariesPromise = fetchJson<Dictionaries>("/data/dictionaries.json").then((d) => {
      dictionariesCache = d;
      return d;
    });
  }
  return dictionariesPromise;
}

export function getBundle(file: string): Promise<Bundle> {
  const cached = bundleCache.get(file);
  if (cached) return Promise.resolve(cached);
  let p = bundlePromises.get(file);
  if (!p) {
    p = fetchJson<Bundle>(`/data/${file}.json`).then((b) => {
      bundleCache.set(file, b);
      return b;
    });
    bundlePromises.set(file, p);
  }
  return p;
}

/**
 * Warm the cache for a bundle (and the dictionaries) ahead of navigation,
 * e.g. on link hover/focus. No-op if already loading/loaded.
 */
export function prefetchBundle(file: string): void {
  void getBundle(file);
  void getDictionaries();
}

// ---------------------------------------------------------------------------
// Generic hook
// ---------------------------------------------------------------------------
interface DetailState<I> {
  item: I | null;
  tree: WeaponTreeNode[] | null;
  loading: boolean;
}

/** Resolve synchronously from the module cache, or null if not yet loaded. */
function resolveFromCache<I>(
  file: string,
  pick: (bundle: Bundle, dict: Dictionaries) => { item: I | null; tree: WeaponTreeNode[] | null }
): DetailState<I> | null {
  const bundle = bundleCache.get(file);
  const dict = dictionariesCache;
  if (!bundle || !dict) return null;
  const { item, tree } = pick(bundle, dict);
  return { item, tree, loading: false };
}

function useBundle<I>(
  file: string,
  pick: (bundle: Bundle, dict: Dictionaries) => { item: I | null; tree: WeaponTreeNode[] | null }
): DetailState<I> {
  // Initialize synchronously from cache when the bundle is already loaded,
  // so client-side navigations between cached items never show a loading frame.
  const [state, setState] = useState<DetailState<I>>(
    () => resolveFromCache(file, pick) ?? { item: null, tree: null, loading: true }
  );

  useEffect(() => {
    // Fast path: already cached — set state synchronously, no loading flash.
    const cached = resolveFromCache(file, pick);
    if (cached) {
      setState(cached);
      return;
    }
    let cancelled = false;
    setState({ item: null, tree: null, loading: true });
    Promise.all([getBundle(file), getDictionaries()])
      .then(([bundle, dict]) => {
        if (cancelled) return;
        const { item, tree } = pick(bundle, dict);
        setState({ item, tree, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ item: null, tree: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  return state;
}

// ---------------------------------------------------------------------------
// Typed hooks
// ---------------------------------------------------------------------------
export function useWeapon(type: string, slug: string): DetailState<Weapon> {
  return useBundle<Weapon>(`weapon-${type}`, (bundle, dict) => {
    const b = bundle as WeaponBundle;
    const cw = b.items.find((w) => w.s === slug);
    return {
      item: cw ? decodeWeapon(dict, cw, b.type) : null,
      tree: decodeTree(b.tree, b.type),
    };
  });
}

export function useArmorPiece(slot: string, rank: string, slug: string): DetailState<ArmorPiece> {
  return useBundle<ArmorPiece>(`armor-${slot}-${rank}`, (bundle, dict) => {
    const b = bundle as ArmorBundle;
    const ca = b.items.find((a) => a.s === slug);
    return {
      item: ca ? decodeArmor(dict, ca, b.slot) : null,
      tree: decodeTree(b.tree, b.slot),
    };
  });
}

export function useMonster(category: string, slug: string): DetailState<Monster> {
  return useBundle<Monster>(`monster-${category}`, (bundle, dict) => {
    const b = bundle as MonsterBundle;
    const cm = b.items.find((m) => m.s === slug);
    return { item: cm ? decodeMonster(dict, cm, b.category) : null, tree: null };
  });
}

export function useDecoration(slug: string): DetailState<Decoration> {
  return useBundle<Decoration>("decorations", (bundle, dict) => {
    const b = bundle as DecorationBundle;
    const cd = b.items.find((d) => d.s === slug);
    return {
      item: cd ? decodeDecoration(dict, cd) : null,
      tree: decodeTree(b.tree, "decoration"),
    };
  });
}

// Re-export melodies lookup for the horn table.
export function useMelodies(notes: string[] | null | undefined) {
  const [melodies, setMelodies] = useState<Dictionaries["melodies"][string] | null>(null);
  useEffect(() => {
    if (!notes || notes.length === 0) {
      setMelodies(null);
      return;
    }
    let cancelled = false;
    getDictionaries().then((d) => {
      if (!cancelled) setMelodies(d.melodies[notes.join("-")] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [notes]);
  return melodies;
}
