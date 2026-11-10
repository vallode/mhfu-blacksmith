/**
 * The set builder's "My sets": armor sets the player named and kept, in
 * localStorage. Each set is stored as its share code (set-codec.ts), so it
 * holds game IDs and survives the search data being regenerated.
 *
 * Reads never throw (blocked storage reads as no sets). Writes return false
 * when storage is full or blocked, so the page can say the set wasn't kept.
 */

const KEY = "set-builder-sets";
/** The set open in the editor, for reloads and client-side navigation. */
const DRAFT_KEY = "set-builder-draft";

export interface SavedSet {
  id: string;
  name: string;
  /** Share code (set-codec.ts). */
  code: string;
  savedAt: number;
}

export interface Draft {
  code: string;
  /** The saved set it was opened from, if any. */
  savedId?: string;
  /** Where it came from ("result", "link"), for the editor's title. */
  origin?: "new" | "result" | "link";
}

function isSavedSet(x: unknown): x is SavedSet {
  const s = x as SavedSet;
  return (
    typeof s === "object" &&
    s !== null &&
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.code === "string" &&
    typeof s.savedAt === "number"
  );
}

export function readSavedSets(): SavedSet[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSavedSet) : [];
  } catch {
    return [];
  }
}

export function writeSavedSets(sets: SavedSet[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(sets));
    return true;
  } catch {
    return false;
  }
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** A new set, first in the list. */
export function addSet(sets: SavedSet[], name: string, code: string): [SavedSet[], SavedSet] {
  const set: SavedSet = { id: newId(), name, code, savedAt: Date.now() };
  return [[set, ...sets], set];
}

export function updateSet(
  sets: SavedSet[],
  id: string,
  patch: Partial<Pick<SavedSet, "name" | "code">>,
): SavedSet[] {
  return sets.map((s) => (s.id === id ? { ...s, ...patch, savedAt: Date.now() } : s));
}

/** A copy of a set, just after it, named "<name> (copy)" (or `copyName(name)`). */
export function duplicateSet(
  sets: SavedSet[],
  id: string,
  copyName: (name: string) => string = (name) => `${name} (copy)`,
): SavedSet[] {
  const i = sets.findIndex((s) => s.id === id);
  if (i < 0) return sets;
  const copy: SavedSet = {
    ...sets[i],
    id: newId(),
    name: copyName(sets[i].name),
    savedAt: Date.now(),
  };
  return [...sets.slice(0, i + 1), copy, ...sets.slice(i + 1)];
}

export function deleteSet(sets: SavedSet[], id: string): SavedSet[] {
  return sets.filter((s) => s.id !== id);
}

/** A name for a new set that no saved set has yet ("Set 3", or `name(3)`). */
export function nextSetName(
  sets: SavedSet[],
  name: (n: number) => string = (n) => `Set ${n}`,
): string {
  const names = new Set(sets.map((s) => s.name));
  let n = sets.length + 1;
  while (names.has(name(n))) n++;
  return name(n);
}

export function readDraft(): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
    return d && typeof d.code === "string" ? d : null;
  } catch {
    return null;
  }
}

export function writeDraft(draft: Draft | null): void {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage blocked: the draft only lasts until the page is left.
  }
}
