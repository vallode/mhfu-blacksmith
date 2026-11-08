/**
 * Remembers the weapon tree filter (see tree-filter.ts) for the session, for
 * every weapon type at once. Static export pages remount the tree on every
 * navigation, so the bar reads this on mount instead of keeping React state.
 * A new session starts on the filter chosen on the Options page.
 */
import { readPreferences } from "./preferences";
import { isTreeFilterId, type TreeFilterId } from "./tree-filter";

const KEY = "tree-filter";

export function readTreeFilter(): TreeFilterId {
  if (typeof window === "undefined") return "all";
  try {
    const value = sessionStorage.getItem(KEY);
    return isTreeFilterId(value) ? value : readPreferences().defaultTreeFilter;
  } catch {
    return readPreferences().defaultTreeFilter;
  }
}

export function writeTreeFilter(filter: TreeFilterId): void {
  try {
    sessionStorage.setItem(KEY, filter);
  } catch {
    // Ignore storage errors (e.g. private browsing quota).
  }
}
