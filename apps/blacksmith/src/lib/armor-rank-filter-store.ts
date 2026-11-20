/**
 * The armor sidebar's rank filter for the session. The sidebar is always the
 * versions tree (every piece with its versions under it, see
 * lib/armor-versions); a rank filter keeps the pieces made at that rank, with
 * their versions at other ranks faded.
 *
 * A rank's own list page (/armorsmith/<slot>/<rank>/) shows, and saves, that
 * rank unless All is chosen. A piece's page shows the chosen filter, or All in
 * a new session.
 */
import { useEffect, useSyncExternalStore } from "react";
import { ARMOR_RANKS, type ArmorRank } from "./constants";

export type ArmorRankFilter = "all" | ArmorRank;
export const ARMOR_RANK_FILTERS: ArmorRankFilter[] = ["all", ...ARMOR_RANKS];

const KEY = "armor-rank-filter";
const listeners = new Set<() => void>();

function read(): ArmorRankFilter | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return ARMOR_RANK_FILTERS.includes(value as ArmorRankFilter)
      ? (value as ArmorRankFilter)
      : null;
  } catch {
    return null;
  }
}

export function writeArmorRankFilter(filter: ArmorRankFilter): void {
  try {
    sessionStorage.setItem(KEY, filter);
  } catch {
    // Ignore storage errors (e.g. private browsing).
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The filter on the page at `rank` (a piece's page when `slug` is set). */
export function useArmorRankFilter(rank: ArmorRank, slug?: string): ArmorRankFilter {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  // A list page's rank becomes the filter, so opening one of its pieces keeps
  // it. Read storage here rather than `stored`, which is still the server's
  // null on the first (hydrating) render.
  useEffect(() => {
    if (slug) return;
    const current = read();
    if (current !== "all" && current !== rank) writeArmorRankFilter(rank);
  }, [rank, slug]);
  if (stored === "all") return "all";
  if (!slug) return rank;
  return stored ?? "all";
}
