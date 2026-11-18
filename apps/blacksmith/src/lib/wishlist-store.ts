"use client";

/**
 * The wishlist, kept in localStorage: a list of `WishlistEntry` (wishlist.ts),
 * newest first. `useWishlist` reads it through useSyncExternalStore, so the
 * buttons on the detail pages, the wishlist page and other tabs all see each
 * change at once.
 *
 * Reads never throw (blocked storage reads as an empty list); a write that
 * fails (storage full or blocked) returns false.
 */
import { useCallback, useSyncExternalStore } from "react";
import { ARMOR_RANKS, ARMOR_SLOTS, WEAPON_TYPES } from "./constants";
import {
  addEntries,
  entryKey,
  hasAll,
  MAX_DECORATION_COUNT,
  type GearRef,
  type GearWant,
  type WishlistEntry,
} from "./wishlist";

const KEY = "wishlist";
/** Sent on this window when the list changes here (other tabs get `storage`). */
const CHANGE = "wishlist-change";

const RECIPES = new Set(["create", "alt", "improve"]);

function isEntry(x: unknown): x is WishlistEntry {
  const e = x as WishlistEntry;
  if (typeof e !== "object" || e === null || typeof e.slug !== "string") return false;
  if (typeof e.addedAt !== "number") return false;
  if (e.recipe !== undefined && !RECIPES.has(e.recipe)) return false;
  if (e.kind === "weapon") {
    return (
      (WEAPON_TYPES as readonly string[]).includes(e.type) &&
      (e.from === undefined || e.from === null || typeof e.from === "string") &&
      (e.made === undefined || typeof e.made === "string")
    );
  }
  if (e.kind === "decoration") return e.count === undefined || isCount(e.count);
  return (
    e.kind === "armor" &&
    (ARMOR_SLOTS as readonly string[]).includes(e.slot) &&
    (ARMOR_RANKS as readonly string[]).includes(e.rank)
  );
}

/** A decoration entry's count: a whole number from 1 to MAX_DECORATION_COUNT. */
export function isCount(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_DECORATION_COUNT;
}

/** The stored list, without anything malformed or listed twice. */
export function parseWishlist(raw: string | null): WishlistEntry[] {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((e): e is WishlistEntry => {
      if (!isEntry(e)) return false;
      const key = entryKey(e);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * The stored entries this build can't read, such as a newer build's kinds of
 * gear. Writes keep them, so an older tab doesn't delete what a newer one added.
 */
export function unreadableEntries(raw: string | null): unknown[] {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => typeof e === "object" && e !== null && !isEntry(e));
  } catch {
    return [];
  }
}

/** Saves the list, after it the stored entries this build can't read unless `keepUnreadable` is false. */
export function writeWishlist(entries: WishlistEntry[], keepUnreadable = true): boolean {
  try {
    const kept = keepUnreadable ? unreadableEntries(localStorage.getItem(KEY)) : [];
    localStorage.setItem(KEY, JSON.stringify([...entries, ...kept]));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(CHANGE));
  return true;
}

// The snapshot is cached by the stored string, so it only changes identity
// when the list does (useSyncExternalStore needs a stable value).
let cachedRaw: string | null | undefined;
let cached: WishlistEntry[] = [];
const EMPTY: WishlistEntry[] = [];

function snapshot(): WishlistEntry[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseWishlist(raw);
  }
  return cached;
}

function subscribe(onChange: () => void): () => void {
  // A null key is localStorage.clear().
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && onChange();
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Adds the gear (first in the list), or removes it if it's there. Returns whether it's now listed. */
export function toggleEntry(entries: WishlistEntry[], ref: GearRef): [WishlistEntry[], boolean] {
  const key = entryKey(ref);
  if (entries.some((e) => entryKey(e) === key)) {
    return [entries.filter((e) => entryKey(e) !== key), false];
  }
  return [addEntries(entries, [ref])[0], true];
}

export interface Wishlist {
  /** null while prerendering (no storage to read) */
  entries: WishlistEntry[] | null;
  has(ref: GearRef): boolean;
  /** Adds or removes the gear; false if storage refused the write. */
  toggle(ref: GearRef): boolean;
  /** Whether every wanted gear is listed, each decoration at least as many times. */
  hasAll(wants: readonly GearWant[]): boolean;
  /**
   * Adds every wanted gear not listed and raises listed decorations to the
   * count wanted (see `addEntries`). How many entries changed, or null if
   * storage refused the write.
   */
  addAll(wants: readonly GearWant[]): number | null;
  /**
   * Changes an entry's recipe, starting weapon, (decorations) count, or the
   * furthest weapon made along its path (`made: undefined` clears it).
   */
  update(
    key: string,
    patch: Partial<Pick<WishlistEntry, "recipe">> & {
      from?: string | null;
      count?: number;
      made?: string;
    },
  ): void;
  remove(key: string): void;
  clear(): void;
}

export function useWishlist(): Wishlist {
  const entries = useSyncExternalStore(subscribe, snapshot, () => null);
  const list = entries ?? EMPTY;

  const has = useCallback(
    (ref: GearRef) => list.some((e) => entryKey(e) === entryKey(ref)),
    [list],
  );
  const toggle = useCallback((ref: GearRef) => writeWishlist(toggleEntry(snapshot(), ref)[0]), []);
  const hasAllOf = useCallback((wants: readonly GearWant[]) => hasAll(list, wants), [list]);
  const addAll = useCallback((wants: readonly GearWant[]) => {
    const [next, changed] = addEntries(snapshot(), wants);
    if (changed === 0) return 0;
    return writeWishlist(next) ? changed : null;
  }, []);
  const update = useCallback<Wishlist["update"]>((key, patch) => {
    // A count the list wouldn't read back would drop the whole entry.
    if (patch.count !== undefined && !isCount(patch.count)) return;
    writeWishlist(
      snapshot().map((e) => (entryKey(e) === key ? ({ ...e, ...patch } as WishlistEntry) : e)),
    );
  }, []);
  const remove = useCallback((key: string) => {
    writeWishlist(snapshot().filter((e) => entryKey(e) !== key));
  }, []);
  const clear = useCallback(() => {
    writeWishlist([], false);
  }, []);

  return { entries, has, toggle, hasAll: hasAllOf, addAll, update, remove, clear };
}
