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
import { entryKey, type GearRef, type WishlistEntry } from "./wishlist";

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
      (e.from === undefined || e.from === null || typeof e.from === "string")
    );
  }
  return (
    e.kind === "armor" &&
    (ARMOR_SLOTS as readonly string[]).includes(e.slot) &&
    (ARMOR_RANKS as readonly string[]).includes(e.rank)
  );
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

export function writeWishlist(entries: WishlistEntry[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
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
  return [[{ ...ref, addedAt: Date.now() } as WishlistEntry, ...entries], true];
}

export interface Wishlist {
  /** null while prerendering (no storage to read) */
  entries: WishlistEntry[] | null;
  has(ref: GearRef): boolean;
  /** Adds or removes the gear; false if storage refused the write. */
  toggle(ref: GearRef): boolean;
  /** Changes an entry's recipe or starting weapon. */
  update(
    key: string,
    patch: Partial<Pick<WishlistEntry, "recipe">> & { from?: string | null },
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
  const update = useCallback<Wishlist["update"]>((key, patch) => {
    writeWishlist(
      snapshot().map((e) => (entryKey(e) === key ? ({ ...e, ...patch } as WishlistEntry) : e)),
    );
  }, []);
  const remove = useCallback((key: string) => {
    writeWishlist(snapshot().filter((e) => entryKey(e) !== key));
  }, []);
  const clear = useCallback(() => {
    writeWishlist([]);
  }, []);

  return { entries, has, toggle, update, remove, clear };
}
