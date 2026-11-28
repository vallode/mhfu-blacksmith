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
import { useEffect, useMemo, useState } from "react";
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
  decodeMonsterListItem,
  type MonsterListItem,
  decodeDecoration,
  decodeTree,
} from "./schema";
import {
  ARMOR_RANKS,
  ARMOR_SLOTS,
  MONSTER_CATEGORIES,
  type ArmorRank,
  type MonsterCategory,
} from "./constants";
import { decodeItemUses, type ItemUse, type ItemUsesBundle } from "./item-uses";
import { decodeAreaMap, type AreaMap, type AreaMapsBundle } from "./area-maps";
import { decodeItemPlaces, type ItemPlaces, type ItemPlacesBundle } from "./item-places";
import { buildItemSources, type ItemSources } from "./item-sources";
import { decodeCombinations, type CombinationIndex, type CombinationsBundle } from "./combinations";
import { indexVeggieTrades, type ItemTrades, type VeggieTradesBundle } from "./veggie-trades";
import { normalizeItemName } from "./items";
import { slugify } from "./slug";
import { decodeQuests, type Quest, type QuestsBundle } from "./quests";
import type { SearchData, SkillTreeData } from "./set-search";
import { setSearchDataFromBundles } from "./set-data";
import type { AwardText } from "./i18n/game-text";
import type { WeaponType } from "./constants";
import type { MotionMove, MotionValuesFile } from "./motion-values";
import {
  unpackHitzoneMonster,
  type HitzoneMonster,
  type PackedHitzoneMonster,
} from "./hitzone-pick";
import type { ShotsFile } from "./shots";

export type { MonsterListItem };

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
    p = fetchJson<Bundle>(`/data/${file}.json`).then(
      (b) => {
        bundleCache.set(file, b);
        return b;
      },
      (e) => {
        bundlePromises.delete(file); // allow a retry on the next call
        throw e;
      },
    );
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

/**
 * `useWeapon` for a caller that may not have a weapon (a save set with an
 * empty weapon slot): no fetch and `loading: false` when either is null.
 */
export function useWeaponOrNull(type: string | null, slug: string | null): DetailState<Weapon> {
  const file = type && slug ? `weapon-${type}` : null;
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!file || (bundleCache.has(file) && dictionariesCache)) return;
    let cancelled = false;
    Promise.all([getBundle(file), getDictionaries()]).then(() => {
      if (!cancelled) forceUpdate((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (!file || !slug) return { item: null, tree: null, loading: false };
  return (
    resolveFromCache<Weapon>(file, (bundle, dict) => {
      const b = bundle as WeaponBundle;
      const cw = b.items.find((w) => w.s === slug);
      return {
        item: cw ? decodeWeapon(dict, cw, b.type) : null,
        tree: decodeTree(b.tree, b.type),
      };
    }) ?? { item: null, tree: null, loading: true }
  );
}

/** A weapon bundle's weapons, decoded once per bundle. */
const decodedWeapons = new WeakMap<WeaponBundle, Weapon[]>();

/** A weapon bundle's weapons, decoded (once per bundle; shared, so don't change them). */
export function decodeWeaponBundle(b: WeaponBundle, dict: Dictionaries): Weapon[] {
  let item = decodedWeapons.get(b);
  if (!item) {
    item = b.items.map((w) => decodeWeapon(dict, w, b.type));
    decodedWeapons.set(b, item);
  }
  return item;
}

/** Every weapon of a class, decoded (the set builder's weapon suggestions). */
export function useWeaponList(type: string): DetailState<Weapon[]> {
  return useBundle<Weapon[]>(`weapon-${type}`, (bundle, dict) => ({
    item: decodeWeaponBundle(bundle as WeaponBundle, dict),
    tree: null,
  }));
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

/**
 * The decoration list and every decoration in it (the list's filters need
 * their slots and skills), from the same bundle as the detail page.
 */
export function useDecorationList(): DetailState<Decoration[]> {
  return useBundle<Decoration[]>("decorations", (bundle, dict) => {
    const b = bundle as DecorationBundle;
    return {
      item: b.items.map((d) => decodeDecoration(dict, d)),
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

/** One version of an armor piece: its rank and its row in that rank's tree. */
export interface ArmorVersionRow {
  rank: ArmorRank;
  node: WeaponTreeNode;
  /** The row's place in that rank's tree (by rarity). */
  order: number;
}

/**
 * Every armor piece in a slot with its versions at every rank (see
 * lib/armor-versions), from the slot's three rank bundles: one entry per
 * piece, low rank first, in the order of each piece's first version. Null
 * until every rank has loaded.
 */
export function useArmorVersions(slot: string): ArmorVersionRow[][] | null {
  const files = ARMOR_RANKS.map((rank) => `armor-${slot}-${rank}`);
  const [, forceUpdate] = useState(0);
  const key = files.join(",");
  useEffect(() => {
    if (files.every((f) => bundleCache.has(f))) return;
    let cancelled = false;
    Promise.all(files.map((f) => getBundle(f))).then(() => {
      if (!cancelled) forceUpdate((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const bundles = files.map((f) => bundleCache.get(f) as ArmorBundle | undefined);
  const ready = bundles.every(Boolean);
  return useMemo(() => {
    if (!ready) return null;
    const families = new Map<number, ArmorVersionRow[]>();
    const singles: ArmorVersionRow[][] = [];
    for (const b of bundles as ArmorBundle[]) {
      for (const [order, node] of decodeTree(b.tree, b.slot).entries()) {
        const row = { rank: b.rank as ArmorRank, node, order };
        if (node.family === undefined) singles.push([row]);
        else families.set(node.family, [...(families.get(node.family) ?? []), row]);
      }
    }
    return [...[...families.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v), ...singles];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);
}

export function useMonsterList(category: string): ListState<MonsterListItem> {
  return useBundleList<MonsterListItem>(`monster-${category}`, (bundle) => {
    const b = bundle as MonsterBundle;
    return {
      tree: null,
      items: b.items.map(decodeMonsterListItem),
    };
  });
}

/** Every monster type's list, with each monster's type: null until they have all loaded. */
export function useAllMonsters(): (MonsterListItem & { category: MonsterCategory })[] | null {
  const [monsters, setMonsters] = useState<
    (MonsterListItem & { category: MonsterCategory })[] | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      MONSTER_CATEGORIES.map((category) =>
        getBundle(`monster-${category}`).then((bundle) =>
          (bundle as MonsterBundle).items.map((m) => ({
            ...decodeMonsterListItem(m),
            category,
          })),
        ),
      ),
    )
      .then((lists) => {
        if (!cancelled) setMonsters(lists.flat());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return monsters;
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
  /** Its page's slug (see `itemHref`) */
  slug: string;
  /** icon type (falls back to "ukwn" for items with no linked material) */
  type: string;
  color: string;
  rarity?: number;
  /** Carry limit; 255 means unlimited */
  carry?: number;
  /** Price in zenny; 0 for items with none */
  price?: number;
  known: boolean;
}

export interface ItemLookup {
  get(id: number): ResolvedItem;
  /** recipe/drop material name -> in-game item ID */
  materials: Record<string, number>;
  /** Every real item (no unused IDs or placeholders), by ID */
  list: ResolvedItem[];
  /** An item by its page slug */
  bySlug(slug: string): ResolvedItem | undefined;
  /** The item a recipe or drop name ("Plesioth Scale", "Akantor Claw x1") is */
  idOf(name: string): number | undefined;
}

let itemsPromise: Promise<ItemLookup> | null = null;
let itemsCache: ItemLookup | null = null;

function buildItemLookup(bundle: ItemsBundle, d: Dictionaries): ItemLookup {
  const resolve = (id: number): ResolvedItem | null => {
    const it = bundle.items[id];
    if (!it || it.p) return null;
    return {
      id,
      name: it.n,
      slug: slugify(it.n),
      type: it.t !== undefined ? d.types[it.t] || "ukwn" : "ukwn",
      color: it.c !== undefined ? d.colors[it.c] || "gray" : "gray",
      rarity: it.r,
      carry: it.l,
      price: it.z,
      known: true,
    };
  };
  const list = bundle.items.flatMap((_, id) => resolve(id) ?? []);
  const slugs = new Map(list.map((it) => [it.slug, it]));
  // Names as recipes and drops spell them: the items' own, plus every
  // material the build linked to an item (aliases, quantity suffixes).
  const names = new Map<string, number>();
  for (const it of list) names.set(normalizeItemName(it.name), it.id);
  for (const [name, id] of Object.entries(bundle.materials)) names.set(normalizeItemName(name), id);
  return {
    materials: bundle.materials,
    list,
    bySlug: (slug) => slugs.get(slug),
    idOf: (name) => names.get(normalizeItemName(name)),
    get(id: number): ResolvedItem {
      return (
        resolve(id) ?? {
          id,
          name: `Unknown item #${id}`,
          slug: "",
          type: "ukwn",
          color: "gray",
          known: false,
        }
      );
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
// Item sources: every monster drop and quest reward, by item ID
// ---------------------------------------------------------------------------
let itemSourcesPromise: Promise<Map<number, ItemSources>> | null = null;
let itemSourcesCache: Map<number, ItemSources> | null = null;

/** Where every item comes from, from the items, monster and quest bundles. */
export function getItemSources(): Promise<Map<number, ItemSources>> {
  if (itemSourcesCache) return Promise.resolve(itemSourcesCache);
  if (!itemSourcesPromise) {
    itemSourcesPromise = Promise.all([
      getItems(),
      getDictionaries(),
      getQuests(),
      ...MONSTER_CATEGORIES.map((c) => getBundle(`monster-${c}`)),
    ])
      .then(([items, dict, quests, ...bundles]) => {
        const monsters = (bundles as MonsterBundle[]).flatMap((b) =>
          b.items.map((cm) => ({
            name: cm.n,
            href: `/monsters/${b.category}/${cm.s}/`,
            drops: decodeMonster(dict, cm, b.category).drops,
          })),
        );
        itemSourcesCache = buildItemSources(monsters, quests, items.idOf);
        return itemSourcesCache;
      })
      .catch((e) => {
        itemSourcesPromise = null; // allow a retry on the next call
        throw e;
      });
  }
  return itemSourcesPromise;
}

/** `getItemSources` as a hook: null while loading or on error (`error` set). */
export function useItemSources(): { sources: Map<number, ItemSources> | null; error: boolean } {
  const [sources, setSources] = useState(itemSourcesCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (itemSourcesCache) return;
    let cancelled = false;
    getItemSources().then(
      (s) => !cancelled && setSources(s),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { sources, error };
}

// ---------------------------------------------------------------------------
// Area maps: each quest's gathering points on the game's map
// ---------------------------------------------------------------------------
let areaMapsCache: AreaMapsBundle | null = null;
let areaMapsPromise: Promise<AreaMapsBundle> | null = null;

function getAreaMaps(): Promise<AreaMapsBundle> {
  areaMapsPromise ??= fetchJson<AreaMapsBundle>("/data/area-maps.json")
    .then((bundle) => (areaMapsCache = bundle))
    .catch((e) => {
      areaMapsPromise = null; // allow a retry on the next call
      throw e;
    });
  return areaMapsPromise;
}

/** A quest's map with its gathering points; `map` is null while loading, on error, or if it has none. */
export function useAreaMap(questId: number): { map: AreaMap | null; loading: boolean } {
  const [bundle, setBundle] = useState(areaMapsCache);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (areaMapsCache) return;
    let cancelled = false;
    getAreaMaps().then(
      (b) => !cancelled && setBundle(b),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const map = useMemo(() => (bundle ? decodeAreaMap(bundle, questId) : null), [bundle, questId]);
  return { map, loading: !bundle && !failed };
}

// ---------------------------------------------------------------------------
// Item places: where each item is gathered or sold, by item ID
// ---------------------------------------------------------------------------
let itemPlacesPromise: Promise<Map<number, ItemPlaces>> | null = null;
let itemPlacesCache: Map<number, ItemPlaces> | null = null;

/** Every item's gathering points and shops, from item-places.json. */
export function getItemPlaces(): Promise<Map<number, ItemPlaces>> {
  if (itemPlacesCache) return Promise.resolve(itemPlacesCache);
  if (!itemPlacesPromise) {
    itemPlacesPromise = fetchJson<ItemPlacesBundle>("/data/item-places.json")
      .then((bundle) => {
        itemPlacesCache = decodeItemPlaces(bundle);
        return itemPlacesCache;
      })
      .catch((e) => {
        itemPlacesPromise = null; // allow a retry on the next call
        throw e;
      });
  }
  return itemPlacesPromise;
}

/** `getItemPlaces` as a hook: null while loading or on error (`error` set). */
export function useItemPlaces(): { places: Map<number, ItemPlaces> | null; error: boolean } {
  const [places, setPlaces] = useState(itemPlacesCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (itemPlacesCache) return;
    let cancelled = false;
    getItemPlaces().then(
      (p) => !cancelled && setPlaces(p),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { places, error };
}

// ---------------------------------------------------------------------------
// Combinations: what each item is combined from and into, by item ID
// ---------------------------------------------------------------------------
let combinationsPromise: Promise<CombinationIndex> | null = null;
let combinationsCache: CombinationIndex | null = null;

/** The Combination List by item, from combinations.json. */
export function getCombinations(): Promise<CombinationIndex> {
  if (combinationsCache) return Promise.resolve(combinationsCache);
  if (!combinationsPromise) {
    combinationsPromise = fetchJson<CombinationsBundle>("/data/combinations.json")
      .then((bundle) => {
        combinationsCache = decodeCombinations(bundle);
        return combinationsCache;
      })
      .catch((e) => {
        combinationsPromise = null; // allow a retry on the next call
        throw e;
      });
  }
  return combinationsPromise;
}

/** `getCombinations` as a hook: null while loading or on error (`error` set). */
export function useCombinations(): { combinations: CombinationIndex | null; error: boolean } {
  const [combinations, setCombinations] = useState(combinationsCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (combinationsCache) return;
    let cancelled = false;
    getCombinations().then(
      (c) => !cancelled && setCombinations(c),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { combinations, error };
}

// ---------------------------------------------------------------------------
// Veggie Elder trades, by item ID
// ---------------------------------------------------------------------------
let tradeBundlePromise: Promise<VeggieTradesBundle> | null = null;
let tradeBundleCache: VeggieTradesBundle | null = null;
let tradesCache: Map<number, ItemTrades> | null = null;

/** The Veggie Elder's trades as the build wrote them, from veggie-trades.json. */
export function getVeggieTrades(): Promise<VeggieTradesBundle> {
  if (tradeBundleCache) return Promise.resolve(tradeBundleCache);
  if (!tradeBundlePromise) {
    tradeBundlePromise = fetchJson<VeggieTradesBundle>("/data/veggie-trades.json")
      .then((bundle) => {
        tradeBundleCache = bundle;
        return bundle;
      })
      .catch((e) => {
        tradeBundlePromise = null; // allow a retry on the next call
        throw e;
      });
  }
  return tradeBundlePromise;
}

/** The Veggie Elder's trades by item. */
export function getItemTrades(): Promise<Map<number, ItemTrades>> {
  if (tradesCache) return Promise.resolve(tradesCache);
  return getVeggieTrades().then((bundle) => (tradesCache ??= indexVeggieTrades(bundle)));
}

/** `getVeggieTrades` as a hook: null while loading or on error (`error` set). */
export function useVeggieTrades(): { bundle: VeggieTradesBundle | null; error: boolean } {
  const [bundle, setBundle] = useState(tradeBundleCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (tradeBundleCache) return;
    let cancelled = false;
    getVeggieTrades().then(
      (b) => !cancelled && setBundle(b),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { bundle, error };
}

/** `getItemTrades` as a hook: null while loading or on error (`error` set). */
export function useItemTrades(): { trades: Map<number, ItemTrades> | null; error: boolean } {
  const [trades, setTrades] = useState(tradesCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (tradesCache) return;
    let cancelled = false;
    getItemTrades().then(
      (t) => !cancelled && setTrades(t),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { trades, error };
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
      .then(([dict, skills, decoBundle, ...armorBundles]) =>
        setSearchDataFromBundles(
          dict,
          skills.skills,
          decoBundle as DecorationBundle,
          armorBundles as ArmorBundle[],
        ),
      )
      .catch((e) => {
        setSearchPromise = null; // allow a retry
        throw e;
      });
  }
  return setSearchPromise;
}

// ---------------------------------------------------------------------------
// Guild Card awards: each award's name and description, by its index
// ---------------------------------------------------------------------------

let awardTextPromise: Promise<AwardText[]> | null = null;
let awardTextCache: AwardText[] | null = null;

/** The awards' English text from awards.json, in the game's order (`AWARDS`'). */
export function getAwardText(): Promise<AwardText[]> {
  if (awardTextCache) return Promise.resolve(awardTextCache);
  if (!awardTextPromise) {
    awardTextPromise = fetchJson<AwardText[]>("/data/awards.json")
      .then((text) => (awardTextCache = text))
      .catch((e) => {
        awardTextPromise = null; // allow a retry on the next call
        throw e;
      });
  }
  return awardTextPromise;
}

/** `getAwardText` as a hook: null while loading or on error (`error` set). */
export function useAwardText(): { awards: AwardText[] | null; error: boolean } {
  const [awards, setAwards] = useState(awardTextCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (awardTextCache) return;
    let cancelled = false;
    getAwardText().then(
      (a) => !cancelled && setAwards(a),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { awards, error };
}

// ---------------------------------------------------------------------------
// Item uses: the gear whose recipes take each item (see src/lib/item-uses.ts)
// ---------------------------------------------------------------------------
let itemUsesCache: Map<number, ItemUse[]> | null = null;
let itemUsesPromise: Promise<Map<number, ItemUse[]>> | null = null;

/** What every item is used for, from item-uses.json. */
export function getItemUses(): Promise<Map<number, ItemUse[]>> {
  if (itemUsesCache) return Promise.resolve(itemUsesCache);
  itemUsesPromise ??= fetchJson<ItemUsesBundle>("/data/item-uses.json")
    .then((b) => (itemUsesCache = decodeItemUses(b, slugify)))
    .catch((e) => {
      itemUsesPromise = null; // allow a retry on the next call
      throw e;
    });
  return itemUsesPromise;
}

/** `getItemUses` as a hook: null while loading or on error (`error` set). */
export function useItemUses(): { uses: Map<number, ItemUse[]> | null; error: boolean } {
  const [uses, setUses] = useState(itemUsesCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (itemUsesCache) return;
    let cancelled = false;
    getItemUses().then(
      (u) => !cancelled && setUses(u),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { uses, error };
}

// ---------------------------------------------------------------------------
// Motion values: each weapon type's moves (see src/lib/motion-values.ts)
// ---------------------------------------------------------------------------
type MotionValuesBundle = MotionValuesFile["weapons"];
let motionValuesCache: MotionValuesBundle | null = null;
let motionValuesPromise: Promise<MotionValuesBundle> | null = null;

/** Every weapon type's moves and motion values, from motion-values.json. */
export function getMotionValues(): Promise<MotionValuesBundle> {
  if (motionValuesCache) return Promise.resolve(motionValuesCache);
  motionValuesPromise ??= fetchJson<MotionValuesBundle>("/data/motion-values.json")
    .then((b) => (motionValuesCache = b))
    .catch((e) => {
      motionValuesPromise = null; // allow a retry on the next call
      throw e;
    });
  return motionValuesPromise;
}

/** A weapon type's moves: null while loading or on error (`error` set). */
export function useMotionValues(type: WeaponType): { moves: MotionMove[] | null; error: boolean } {
  const [bundle, setBundle] = useState(motionValuesCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (motionValuesCache) return;
    let cancelled = false;
    getMotionValues().then(
      (b) => !cancelled && setBundle(b),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { moves: bundle ? (bundle[type] ?? []) : null, error };
}

// ---------------------------------------------------------------------------
// Bowgun shots: each ammo's values (see src/lib/shots.ts)
// ---------------------------------------------------------------------------
let shotsCache: ShotsFile | null = null;
let shotsPromise: Promise<ShotsFile> | null = null;

/** The bowgun shots' values, from shots.json. */
export function getShots(): Promise<ShotsFile> {
  if (shotsCache) return Promise.resolve(shotsCache);
  shotsPromise ??= fetchJson<ShotsFile>("/data/shots.json")
    .then((b) => (shotsCache = b))
    .catch((e) => {
      shotsPromise = null; // allow a retry on the next call
      throw e;
    });
  return shotsPromise;
}

/** The bowgun shots' values: null while loading or on error (`error` set). */
export function useShots(): { shots: ShotsFile | null; error: boolean } {
  const [shots, setShots] = useState(shotsCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (shotsCache) return;
    let cancelled = false;
    getShots().then(
      (b) => !cancelled && setShots(b),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { shots, error };
}

// ---------------------------------------------------------------------------
// Hitzones: every monster's hitzone parts (the damage calculator's picker)
// ---------------------------------------------------------------------------
let hitzoneMonstersCache: HitzoneMonster[] | null = null;
let hitzoneMonstersPromise: Promise<HitzoneMonster[]> | null = null;

/** Every monster with hitzones, by type then the monster files' order (hitzones.json). */
function getHitzoneMonsters(): Promise<HitzoneMonster[]> {
  if (hitzoneMonstersCache) return Promise.resolve(hitzoneMonstersCache);
  hitzoneMonstersPromise ??= fetchJson<PackedHitzoneMonster[]>("/data/hitzones.json")
    .then((m) => (hitzoneMonstersCache = m.map(unpackHitzoneMonster)))
    .catch((e) => {
      hitzoneMonstersPromise = null; // allow a retry on the next call
      throw e;
    });
  return hitzoneMonstersPromise;
}

/** Every monster with hitzones: null while loading or on error (`error` set). */
export function useHitzoneMonsters(): { monsters: HitzoneMonster[] | null; error: boolean } {
  const [monsters, setMonsters] = useState(hitzoneMonstersCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (hitzoneMonstersCache) return;
    let cancelled = false;
    getHitzoneMonsters().then(
      (m) => !cancelled && setMonsters(m),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return { monsters, error };
}
