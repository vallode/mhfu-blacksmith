/**
 * Material icon "type"/"color" presentation metadata (e.g. "Iron Ore" ->
 * `{ type: "ore", color: "gray" }`), keyed by material display name.
 *
 * This is **not derived from the disc**. `itemTable`'s `iconId`/`color`
 * bytes (tables/items.ts) were checked against this exact classification
 * and don't correlate cleanly — e.g. every material the site classifies as
 * `type: "bone"` spans over 20 different raw `iconId` values, and the same
 * raw `color` byte maps to different display colors depending on context.
 * This strongly suggests `type`/`color` here are a hand-curated icon/CSS
 * styling choice from whoever originally built the site's dataset (likely
 * matching a specific icon sprite sheet), not a property the game itself
 * stores per-item.
 *
 * `materials.json` is a one-time snapshot of every `{name, type, color}`
 * combination already present in the committed `data/` directory (armor,
 * weapons, and decoration `create_mats`/`improve_mats`/`alternative_create_mats`),
 * bootstrapped by scanning it once — see the emit layer's README section
 * "Overlay data" for the general pattern this follows. Regenerate it with
 * the same scan if `data/` picks up new materials this table doesn't know
 * about yet (`resolveMaterial()` below falls back to a clearly-marked
 * placeholder rather than guessing).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MATERIALS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "materials.json");

export interface MaterialStyle {
  type: string;
  color: string;
}

let cache: Record<string, MaterialStyle> | null = null;

function load(): Record<string, MaterialStyle> {
  if (!cache) cache = JSON.parse(readFileSync(MATERIALS_PATH, "utf-8"));
  return cache!;
}

/** Placeholder used when a material name has no curated icon styling yet. */
export const UNKNOWN_MATERIAL_STYLE: MaterialStyle = { type: "ukwn", color: "white" };

/**
 * Looks up a material's presentation styling by its display name. Returns
 * `UNKNOWN_MATERIAL_STYLE` (never null/undefined, so emit output always
 * satisfies the schema's required `type`/`color` fields) for names not in
 * the curated catalog, e.g. brand-new items this snapshot predates.
 */
export function resolveMaterialStyle(name: string): MaterialStyle {
  return load()[name] ?? UNKNOWN_MATERIAL_STYLE;
}

/** True if `name` has no curated styling and fell back to the placeholder. */
export function isUnknownMaterial(name: string): boolean {
  return !(name in load());
}
