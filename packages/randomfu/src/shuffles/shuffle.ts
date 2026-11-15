/** Shared pieces of the shuffles. */
import { inScope, tierKey, type Scope, type Tier } from "../game/tiers.js";
import type { Rng } from "../rng.js";

/** `items` by key, in first-seen order of keys and items. */
export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

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
  const members = groupBy(
    slots.map((_, i) => i),
    (i) => group(slots[i]!),
  );
  const out = new Array<V>(slots.length);
  for (const indices of members.values()) {
    const values = rng.shuffle(indices.map((i) => value(slots[i]!)));
    indices.forEach((slotIndex, k) => (out[slotIndex] = values[k]!));
  }
  return out;
}

/**
 * Like `permuteWithinGroups`, but groups are what `scope` allows from each
 * slot's tier, on top of `group` (slots in different groups never trade).
 * Star, rank and any-tier scopes are plain groups. Adjacent ranks overlap
 * (Low trades with High, High with G, but Low not with G), so those slots
 * trade pairwise instead: random swaps, each kept only if both slots may
 * take the other's value.
 */
export function permuteWithinScope<S, V>(
  slots: readonly S[],
  tierOf: (slot: S) => Tier,
  scope: Scope,
  group: (slot: S) => string,
  value: (slot: S) => V,
  rng: Rng,
): V[] {
  if (scope !== "adjacent") {
    return permuteWithinGroups(
      slots,
      (s) =>
        `${group(s)}|${scope === "any" ? "" : scope === "rank" ? tierOf(s).band : tierKey(tierOf(s))}`,
      value,
      rng,
    );
  }
  const out = slots.map(value);
  // `from[k]` is the slot whose value `k` holds now.
  const from = slots.map((_, i) => i);
  for (const indices of groupBy(
    slots.map((_, i) => i),
    (i) => group(slots[i]!),
  ).values()) {
    for (let n = 0; n < indices.length * 12; n++) {
      const a = indices[rng.int(indices.length)]!;
      const b = indices[rng.int(indices.length)]!;
      if (a === b) continue;
      if (
        inScope(scope, tierOf(slots[a]!), tierOf(slots[from[b]!]!)) &&
        inScope(scope, tierOf(slots[b]!), tierOf(slots[from[a]!]!))
      ) {
        [out[a], out[b]] = [out[b]!, out[a]!];
        [from[a], from[b]] = [from[b]!, from[a]!];
      }
    }
  }
  return out;
}

/**
 * Whole numbers for `weights`' proportions that add up to `total`, each at
 * least 1 (largest remainder). Reward chances in one list must total 100.
 */
export function reconcile(weights: readonly number[], total: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (total < n) throw new RangeError(`${n} shares can't each get 1 of ${total}`);
  const w = weights.map((x) => Math.max(1, x));
  const sum = w.reduce((a, b) => a + b, 0);
  const exact = w.map((x) => (x * total) / sum);
  const out = exact.map((x) => Math.max(1, Math.floor(x)));
  let left = total - out.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % n) {
    out[byRemainder[k]!.i]!++;
    left--;
  }
  // Raising a share to 1 can overshoot: take it back from the largest.
  while (left < 0) {
    let big = 0;
    out.forEach((x, i) => {
      if (x > out[big]!) big = i;
    });
    out[big]!--;
    left++;
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
  /** The run log's line for it, when a slot count doesn't fit. */
  summary?: string;
}

/** A report's line in the run log: its summary, or how many slots it changed. */
export function reportLogLine(report: ShuffleReport): string {
  return report.summary ?? `${report.title}: ${report.lines.length} slots`;
}
