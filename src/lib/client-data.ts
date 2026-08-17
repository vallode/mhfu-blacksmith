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

export interface MonsterListItem {
  slug: string;
  name: string;
}

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
  // Force a re-render once a not-yet-cached bundle/dictionaries finish
  // loading; doesn't otherwise drive the returned state (see below).
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (bundleCache.has(file) && dictionariesCache) return;
    let cancelled = false;
    Promise.all([getBundle(file), getDictionaries()]).then(() => {
      if (!cancelled) forceUpdate((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Recomputed every render (not just when `file` changes) so switching
  // between two items backed by the *same* bundle — e.g. sibling weapons in
  // a tree, which share one weapon-{type}.json file — always reflects the
  // latest `pick` (closing over the current slug/etc.) instead of stale
  // state left over from the previously rendered item.
  return resolveFromCache(file, pick) ?? { item: null, tree: null, loading: true };
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

// ---------------------------------------------------------------------------
// Tree/list-only hooks — for the [type]/[slot+rank]/[category] tree/list
// pages, which only need the tree structure (or item names), not a single
// decoded item. Reuses the same bundle fetch/cache as the detail hooks, so
// visiting a list page after a detail page (or vice versa) is instant.
// ---------------------------------------------------------------------------
interface ListState<I> {
  tree: WeaponTreeNode[] | null;
  items: I[] | null;
  loading: boolean;
}

function useBundleList<I>(
  file: string,
  pick: (bundle: Bundle) => { tree: WeaponTreeNode[] | null; items: I[] | null }
): ListState<I> {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (bundleCache.has(file)) return;
    let cancelled = false;
    getBundle(file).then(() => {
      if (!cancelled) forceUpdate((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const bundle = bundleCache.get(file);
  if (!bundle) return { tree: null, items: null, loading: true };
  return { ...pick(bundle), loading: false };
}

export function useWeaponTree(type: string): ListState<never> {
  return useBundleList(`weapon-${type}`, (bundle) => {
    const b = bundle as WeaponBundle;
    return { tree: decodeTree(b.tree, b.type), items: null };
  });
}

export function useArmorTree(slot: string, rank: string): ListState<never> {
  return useBundleList(`armor-${slot}-${rank}`, (bundle) => {
    const b = bundle as ArmorBundle;
    return { tree: decodeTree(b.tree, b.slot), items: null };
  });
}

export function useDecorationTree(): ListState<never> {
  return useBundleList("decorations", (bundle) => {
    const b = bundle as DecorationBundle;
    return { tree: decodeTree(b.tree, "decoration"), items: null };
  });
}

export function useMonsterList(category: string): ListState<MonsterListItem> {
  return useBundleList<MonsterListItem>(`monster-${category}`, (bundle) => {
    const b = bundle as MonsterBundle;
    return {
      tree: null,
      items: b.items.map((m) => ({ slug: m.s, name: m.n })),
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
