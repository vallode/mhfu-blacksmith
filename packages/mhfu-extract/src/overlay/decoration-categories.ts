/**
 * Decoration "category" presentation grouping (e.g. "Attack Jewel" ->
 * `"Attack up"`), keyed by decoration display name.
 *
 * Not derivable from the disc: a decoration's category is assigned to the
 * *decoration as a whole*, not to either of its 1-2 skill effects — e.g.
 * both "Attack Jewel" (Attack+1) and "Fierce Jewel" (Attack+3/Defense-1) are
 * categorized under "Attack up", while other decorations granting the exact
 * same "Attack" skill land in "Evade Distance Up" instead (grouped by their
 * *other* skill). There's no clean function from raw skill IDs to category,
 * so — like materials.ts — this is a one-time snapshot of the categories
 * already present in the committed `data/decorations.json`, not extracted.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CATEGORIES_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "decoration-categories.json",
);

let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (!cache) cache = JSON.parse(readFileSync(CATEGORIES_PATH, "utf-8"));
  return cache!;
}

/** Fallback category for decorations not in the curated catalog (e.g. new ones this snapshot predates). */
export const UNKNOWN_CATEGORY = "Uncategorized";

export function resolveDecorationCategory(name: string): string {
  return load()[name] ?? UNKNOWN_CATEGORY;
}
