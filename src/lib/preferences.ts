/**
 * The user's site preferences (Options page), kept in localStorage. Pure
 * read/write helpers, so code that runs before React state exists (the tree
 * filter's initial value) can read them too; components use
 * PreferencesContext.
 */
import { isTreeFilterId, type TreeFilterId } from "./tree-filter";

export interface Preferences {
  /** Show the true (raw) attack and element values in brackets next to the displayed ones. */
  showRawValues: boolean;
  /** Pulse the green hover and selection highlights (off: a steady highlight). */
  animateHighlights: boolean;
  /** Gold names for equipment in the loaded hunter's equipment box. */
  markOwned: boolean;
  /** Material squares and the craftable highlight on weapon tree rows. */
  showCraftProgress: boolean;
  /** "owned/required" material amounts in recipes. */
  showMaterialCounts: boolean;
  /** Count a recipe's zenny cost when deciding whether a weapon can be made. */
  checkZenny: boolean;
  /** The weapon tree filter a new visit starts on. */
  defaultTreeFilter: TreeFilterId;
}

export const DEFAULT_PREFERENCES: Preferences = {
  showRawValues: true,
  animateHighlights: true,
  markOwned: true,
  showCraftProgress: true,
  showMaterialCounts: true,
  checkZenny: true,
  defaultTreeFilter: "all",
};

export const PREFERENCES_KEY = "mhfu_prefs";

/** Keeps only stored values of the right type, so an old or hand-edited entry can't break the site. */
export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFERENCES;
  }
  if (!stored || typeof stored !== "object") return DEFAULT_PREFERENCES;
  const record = stored as Record<string, unknown>;
  const prefs = { ...DEFAULT_PREFERENCES };
  for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]) {
    const value = record[key];
    if (key === "defaultTreeFilter") {
      if (isTreeFilterId(value)) prefs.defaultTreeFilter = value;
    } else if (typeof value === "boolean") {
      prefs[key] = value;
    }
  }
  return prefs;
}

export function readPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    return parsePreferences(localStorage.getItem(PREFERENCES_KEY));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors (e.g. private browsing quota); the choice lasts until reload.
  }
}
