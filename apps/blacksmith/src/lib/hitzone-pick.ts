/**
 * Picking the hitzone a hit lands on from a monster's parts (the damage
 * calculator's hitzone picker). Pure, for client components.
 */
import type { MonsterCategory } from "./constants";
import type { HitzoneWeights, PartHitzones } from "./motion-values";

/** A monster with hitzones (public/data/hitzones.json), for picking the spot a hit lands on. */
export interface HitzoneMonster {
  category: MonsterCategory;
  slug: string;
  /** English name: a key for the game text. */
  name: string;
  /** Its hitzone rows, in the table's order: part name (English) and its cut and impact values. */
  parts: ({ part: string } & PartHitzones)[];
}

/** A monster's part picked as the hitzone, with its cut and impact values. */
export interface HitzoneSpot extends PartHitzones {
  slug: string;
  part: string;
}

/** A part's cut and impact values (0 where it has none). */
export const partHitzones = (values: Record<string, string>): PartHitzones => ({
  cut: Number(values.cut ?? 0) || 0,
  bash: Number(values.bash ?? 0) || 0,
});

/**
 * A part's hitzone as a hand-set value would give it: the weighted hitzone
 * over the weapon's larger weight. A hand-set value stands for both columns,
 * so it's weighed by that larger weight; a part whose winning column has a
 * smaller weight (the Lance's impact) shows less than its raw value.
 */
export const spotValue = (zone: PartHitzones, w: HitzoneWeights) =>
  Math.max(zone.cut * w.cut, zone.bash * w.impact) / Math.max(w.cut, w.impact);

/**
 * A hitzone value's colour, from hard to weak: blue under 25, grey to 40,
 * yellow to 55, orange to 70, red from 70.
 */
export function hitzoneHeat(value: number): string {
  if (value < 25) return "var(--color-sharpness-5)";
  if (value < 40) return "var(--color-muted)";
  if (value < 55) return "var(--color-stat)";
  if (value < 70) return "var(--color-warm)";
  return "var(--color-negative)";
}
