/** Shared pieces of the shuffles. */
import type { Rng } from "../rng.js";

/**
 * Permutes `values` within each group: returns, for each slot, the value it
 * gets. Groups are visited in first-seen order, so the result depends only on
 * the slot order and the RNG.
 */
export function permuteWithinGroups<S, V>(
  slots: readonly S[],
  group: (slot: S) => string,
  value: (slot: S) => V,
  rng: Rng,
): V[] {
  const members = new Map<string, number[]>();
  slots.forEach((slot, i) => {
    const key = group(slot);
    const list = members.get(key);
    if (list) list.push(i);
    else members.set(key, [i]);
  });
  const out = new Array<V>(slots.length);
  for (const indices of members.values()) {
    const values = rng.shuffle(indices.map((i) => value(slots[i]!)));
    indices.forEach((slotIndex, k) => (out[slotIndex] = values[k]!));
  }
  return out;
}

/**
 * The median of a non-empty list. With an even count, "mean" averages the
 * two middle values; "lower" takes the smaller one, so the result is always
 * a value from the list.
 */
export function median(values: readonly number[], even: "mean" | "lower" = "mean"): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2) return sorted[mid]!;
  return even === "lower" ? sorted[mid - 1]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** One changed slot, for the spoiler log. */
export interface SpoilerLine {
  /** Heading the line is listed under, e.g. a quest or a monster. */
  where: string;
  /** What changed, e.g. "Rathian Scale x1 (was Pin Tuna x2)". */
  text: string;
}

export interface ShuffleReport {
  title: string;
  /** Short notes on what was and wasn't shuffled. */
  notes: string[];
  lines: SpoilerLine[];
}
