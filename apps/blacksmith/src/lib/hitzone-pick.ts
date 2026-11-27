/**
 * Picking the hitzone a hit lands on from a monster's parts (the damage
 * calculator's hitzone picker). Pure, for client components.
 */
import type { MonsterCategory } from "./constants";
import type { HitzoneWeights, PartHitzones } from "./motion-values";
import { SHOT_ELEMENTS, type ShotHitzones } from "./shots";

/** A monster with hitzones (public/data/hitzones.json), for picking the spot a hit lands on. */
export interface HitzoneMonster {
  category: MonsterCategory;
  slug: string;
  /** English name: a key for the game text. */
  name: string;
  /** Its hitzone rows, in the table's order: part name (English) and its values. */
  parts: ({ part: string } & PartValues)[];
}

/** A part's hitzones: cut and impact for melee hits, shot and the elements for shots. */
export type PartValues = PartHitzones & ShotHitzones;

/** A monster's part picked as the hitzone, with its values. */
export type HitzoneSpot = { slug: string; part: string } & PartValues;

/** The monsters' data keys for the element columns. */
const ELEMENT_KEYS = { fire: "fir", water: "wtr", thunder: "thn", ice: "ice", dragon: "drg" };

/** A part's values (0 where it has none), from a monster's `hitzones`. */
export function partHitzones(values: Record<string, string>): PartValues {
  const n = (key: string) => Number(values[key] ?? 0) || 0;
  return {
    cut: n("cut"),
    bash: n("bash"),
    shot: n("shot"),
    ...(Object.fromEntries(SHOT_ELEMENTS.map((e) => [e, n(ELEMENT_KEYS[e])])) as Record<
      (typeof SHOT_ELEMENTS)[number],
      number
    >),
  };
}

/** A part's columns in hitzones.json, after its name. */
const PART_COLUMNS = ["cut", "bash", "shot", ...SHOT_ELEMENTS] as const;

/** hitzones.json's form of a monster: each part `[name, ...PART_COLUMNS values]`, to keep it small. */
export type PackedHitzoneMonster = Omit<HitzoneMonster, "parts"> & {
  parts: [string, ...number[]][];
};

export const packHitzoneMonster = ({ parts, ...m }: HitzoneMonster): PackedHitzoneMonster => ({
  ...m,
  parts: parts.map((p) => [p.part, ...PART_COLUMNS.map((c) => p[c])]),
});

export const unpackHitzoneMonster = ({ parts, ...m }: PackedHitzoneMonster): HitzoneMonster => ({
  ...m,
  parts: parts.map(([part, ...values]) => ({
    part,
    ...(Object.fromEntries(PART_COLUMNS.map((c, i) => [c, values[i] ?? 0])) as Record<
      (typeof PART_COLUMNS)[number],
      number
    >),
  })),
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
