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
import type { Weapon, ArmorPiece, Monster, Decoration, WeaponTreeNode } from "./types";
import {
  type Dictionaries,
  type Bundle,
  type WeaponBundle,
  type ArmorBundle,
  type MonsterBundle,
  type DecorationBundle,
  type ItemsBundle,
  decodeWeapon,
  decodeArmor,
  decodeMonster,
  decodeDecoration,
  decodeTree,
} from "./schema";
import { ARMOR_RANKS, ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "./constants";
import { decodeQuests, type Quest, type QuestsBundle } from "./quests";
import {
  prepareSearchData,
  type ArmorInput,
  type SearchData,
  type SkillTreeData,
} from "./set-search";

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

/** A bundle or the dictionaries if already loaded, without fetching. */
export function peekBundle(file: string): Bundle | null {
  return bundleCache.get(file) ?? null;
}
export function peekDictionaries(): Dictionaries | null {
  return dictionariesCache;
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
  pick: (bundle: Bundle, dict: Dictionaries) => { item: I | null; tree: WeaponTreeNode[] | null },
): DetailState<I> | null {
  const bundle = bundleCache.get(file);
  const dict = dictionariesCache;
  if (!bundle || !dict) return null;
  const { item, tree } = pick(bundle, dict);
  return { item, tree, loading: false };
}

function useBundle<I>(
  file: string,
  pick: (bundle: Bundle, dict: Dictionaries) => { item: I | null; tree: WeaponTreeNode[] | null },
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
  pick: (bundle: Bundle) => { tree: WeaponTreeNode[] | null; items: I[] | null },
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

// ---------------------------------------------------------------------------
// In-game items (save loader)
// ---------------------------------------------------------------------------
export interface ResolvedItem {
  id: number;
  name: string;
  /** icon type (falls back to "ukwn" for items with no linked material) */
  type: string;
  color: string;
  rarity?: number;
  known: boolean;
}

export interface ItemLookup {
  get(id: number): ResolvedItem;
  /** recipe/drop material name -> in-game item ID */
  materials: Record<string, number>;
}

let itemsPromise: Promise<ItemLookup> | null = null;
let itemsCache: ItemLookup | null = null;

function buildItemLookup(bundle: ItemsBundle, d: Dictionaries): ItemLookup {
  return {
    materials: bundle.materials,
    get(id: number): ResolvedItem {
      const it = bundle.items[id];
      if (!it || it.p) {
        return { id, name: `Unknown item #${id}`, type: "ukwn", color: "gray", known: false };
      }
      return {
        id,
        name: it.n,
        type: it.t !== undefined ? d.types[it.t] || "ukwn" : "ukwn",
        color: it.c !== undefined ? d.colors[it.c] || "gray" : "gray",
        rarity: it.r,
        known: true,
      };
    },
  };
}

export function getItems(): Promise<ItemLookup> {
  if (itemsCache) return Promise.resolve(itemsCache);
  if (!itemsPromise) {
    itemsPromise = Promise.all([fetchJson<ItemsBundle>("/data/items.json"), getDictionaries()])
      .then(([b, d]) => {
        itemsCache = buildItemLookup(b, d);
        return itemsCache;
      })
      .catch((e) => {
        itemsPromise = null; // allow a retry on the next call
        throw e;
      });
  }
  return itemsPromise;
}

/**
 * Item ID -> name lookup. `items` is null while loading or if the bundle could
 * not be fetched (`error` set); callers should still render raw IDs then.
 */
export function useItems(): { items: ItemLookup | null; error: boolean } {
  const [items, setItems] = useState<ItemLookup | null>(itemsCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (itemsCache) return;
    let cancelled = false;
    getItems().then(
      (l) => !cancelled && setItems(l),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { items, error };
}

// ---------------------------------------------------------------------------
// Quests (quests.json, see src/lib/quests.ts)
// ---------------------------------------------------------------------------
let questsPromise: Promise<Quest[]> | null = null;
let questsCache: Quest[] | null = null;

export function getQuests(): Promise<Quest[]> {
  if (questsCache) return Promise.resolve(questsCache);
  if (!questsPromise) {
    questsPromise = fetchJson<QuestsBundle>("/data/quests.json")
      .then((b) => {
        questsCache = decodeQuests(b);
        return questsCache;
      })
      .catch((e) => {
        questsPromise = null; // allow a retry on the next call
        throw e;
      });
  }
  return questsPromise;
}

/** Every quest, decoded. `quests` is null while loading or if quests.json could not be fetched (`error` set). */
export function useQuests(): { quests: Quest[] | null; error: boolean } {
  const [quests, setQuests] = useState<Quest[] | null>(questsCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (questsCache) return;
    let cancelled = false;
    getQuests().then(
      (q) => !cancelled && setQuests(q),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { quests, error };
}

// ---------------------------------------------------------------------------
// Set builder: every armor piece, decoration and skill tree
// ---------------------------------------------------------------------------
let setSearchPromise: Promise<SearchData> | null = null;

/**
 * Everything the set search needs, from the same cached bundles as the armor
 * and decoration pages plus skills.json.
 */
export function loadSetSearchData(): Promise<SearchData> {
  if (!setSearchPromise) {
    const armorFiles = ARMOR_SLOTS.flatMap((slot) =>
      ARMOR_RANKS.map((rank) => `armor-${slot}-${rank}`),
    );
    setSearchPromise = Promise.all([
      getDictionaries(),
      fetchJson<{ skills: SkillTreeData[] }>("/data/skills.json"),
      getBundle("decorations"),
      ...armorFiles.map((f) => getBundle(f)),
    ])
      .then(([dict, skills, decoBundle, ...armorBundles]) => {
        const armor: ArmorInput[] = (armorBundles as ArmorBundle[]).flatMap((b) =>
          b.items.map((ca) => {
            const a = decodeArmor(dict, ca, b.slot);
            return {
              slot: b.slot as ArmorSlot,
              rank: b.rank as ArmorRank,
              name: a.name,
              slug: a.slug,
              defence: Number(a.defence ?? 0),
              res: ca.re,
              slots: a.slots,
              rarity: Number(a.rarity ?? 0) || undefined,
              minRank: a.min_rank,
              sex: a.sex,
              hunterType: a.hunter_type,
              skills: a.skills?.map((s) => ({ name: s.name, amount: Number(s.amount) })),
            };
          }),
        );
        const decorations = (decoBundle as DecorationBundle).items.map((cd) => {
          const d = decodeDecoration(dict, cd);
          return { ...d, skills: d.skills ?? [], minRank: d.min_rank };
        });
        return prepareSearchData(skills.skills, armor, decorations);
      })
      .catch((e) => {
        setSearchPromise = null; // allow a retry
        throw e;
      });
  }
  return setSearchPromise;
}
