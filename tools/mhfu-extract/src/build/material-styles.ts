/**
 * One icon style (`type`/`color`) per item, applied by `build-data` to every
 * material it writes.
 *
 * Material styles are site presentation data, not disc data. The committed
 * files give the same item different styles, mostly because "bone"/"white"
 * was a placeholder in the original scrape: 210 items carry it in armor
 * recipes while weapon/decoration recipes agree on a real style
 * ("FireWyvern Claw" bone/white in armor, claw/red in weapons). Per item ID,
 * the style is, in order:
 *
 * 1. `overlay/material-styles.json`: hand-picked styles for items whose only
 *    committed style is the placeholder (tickets, potions, herbs, ...), and
 *    for the Lobstershells, which the committed data splits between claw
 *    and shell.
 * 2. The most common style in weapon/decoration recipes, ignoring
 *    bone/white whenever the item has any other style.
 * 3. The same in armor recipes.
 * 4. bone/white, for items it's the only style of (real bones).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { MaterialContext } from "../overlay/item-name-corrections.js";
import type { SiteIndex } from "./ids.js";

export interface Style {
  type: string;
  color: string;
}

const OVERRIDES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "overlay", "material-styles.json");

export function loadStyleOverrides(file = OVERRIDES_PATH): Map<number, Style> {
  const json = JSON.parse(readFileSync(file, "utf-8")) as { styles: Record<string, Style & { name: string }> };
  return new Map(Object.entries(json.styles).map(([id, s]) => [Number(id), { type: s.type, color: s.color }]));
}

const PLACEHOLDER = "bone\u0000white";
const MATERIAL_FIELDS = ["create_mats", "improve_mats", "alternative_create_mats"];

interface Material {
  name: string;
  type: string;
  color: string;
}

function majority(counts: Map<string, number> | undefined, skipPlaceholder: boolean): Style | undefined {
  if (!counts) return undefined;
  const entries = [...counts].filter(([key]) => !(skipPlaceholder && key === PLACEHOLDER));
  if (entries.length === 0) return undefined;
  const [key] = entries.sort((a, b) => b[1] - a[1])[0]!;
  const [type, color] = key.split("\u0000") as [string, string];
  return { type, color };
}

/** Item ID -> its style, built from committed items grouped by recipe context. */
export function buildStyleIndex(
  byContext: Map<MaterialContext, Record<string, unknown>[]>,
  site: SiteIndex,
  overrides: Map<number, Style>
): (itemId: number) => Style | undefined {
  const armor = new Map<number, Map<string, number>>();
  const other = new Map<number, Map<string, number>>();
  const any = new Map<number, Set<string>>();
  for (const [context, items] of byContext) {
    const target = context === "armor" ? armor : other;
    for (const item of items) {
      for (const field of MATERIAL_FIELDS) {
        for (const m of (item[field] as Material[] | null | undefined) ?? []) {
          const id = site.itemIdOf(m.name);
          if (id === null) continue;
          const key = `${m.type}\u0000${m.color}`;
          const counts = target.get(id) ?? new Map<string, number>();
          counts.set(key, (counts.get(key) ?? 0) + 1);
          target.set(id, counts);
          any.set(id, (any.get(id) ?? new Set()).add(key));
        }
      }
    }
  }
  return (itemId) => {
    const override = overrides.get(itemId);
    if (override) return override;
    const skip = [...(any.get(itemId) ?? [])].some((k) => k !== PLACEHOLDER);
    return majority(other.get(itemId), skip) ?? majority(armor.get(itemId), skip) ?? majority(other.get(itemId), false) ?? majority(armor.get(itemId), false);
  };
}

/**
 * Returns `item` with every material restyled through `styleOf`, or the
 * same object when nothing changes. Calls `onChange` for each restyle.
 */
export function restyleItem(
  item: Record<string, unknown>,
  site: SiteIndex,
  styleOf: (itemId: number) => Style | undefined,
  onChange: (material: Material, after: Style) => void
): Record<string, unknown> {
  let out = item;
  for (const field of MATERIAL_FIELDS) {
    const mats = item[field] as Material[] | null | undefined;
    if (!mats) continue;
    let changed = false;
    const next = mats.map((m) => {
      const id = site.itemIdOf(m.name);
      const style = id === null ? undefined : styleOf(id);
      if (!style || (style.type === m.type && style.color === m.color)) return m;
      changed = true;
      onChange(m, style);
      return { ...m, type: style.type, color: style.color };
    });
    if (changed) out = { ...out, [field]: next };
  }
  return out;
}
