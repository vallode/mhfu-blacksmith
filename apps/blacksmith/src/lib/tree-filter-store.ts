/**
 * Remembers the weapon tree's view and filters (see tree-filter.ts) for the
 * session, for every weapon type at once. Static export pages remount the
 * tree on every navigation, so the panel reads these on mount instead of
 * keeping React state. A new session starts on the upgrade tree, every
 * element, and the hunter filter chosen on the Options page.
 */
import { readPreferences } from "./preferences";
import {
  isElementFilterId,
  isTreeFilterId,
  isTreeViewId,
  type ElementFilterId,
  type TreeFilterId,
  type TreeViewId,
} from "./tree-filter";

function read<T>(key: string, isValid: (value: unknown) => value is T, fallback: () => T): T {
  if (typeof window === "undefined") return fallback();
  try {
    const value = sessionStorage.getItem(key);
    return isValid(value) ? value : fallback();
  } catch {
    return fallback();
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (e.g. private browsing quota).
  }
}

export function readTreeFilter(): TreeFilterId {
  return read("tree-filter", isTreeFilterId, () =>
    typeof window === "undefined" ? "all" : readPreferences().defaultTreeFilter,
  );
}

export function writeTreeFilter(filter: TreeFilterId): void {
  write("tree-filter", filter);
}

export function readElementFilter(): ElementFilterId {
  return read("tree-element-filter", isElementFilterId, () => "all");
}

export function writeElementFilter(filter: ElementFilterId): void {
  write("tree-element-filter", filter);
}

export function readTreeView(): TreeViewId {
  return read("tree-view", isTreeViewId, () => "tree");
}

export function writeTreeView(view: TreeViewId): void {
  write("tree-view", view);
}
