/** Shared pieces of the shuffles. */
import type { LoadedQuest } from "../game/load.js";
import { questTier, type Band, type Tier } from "../game/tiers.js";
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

/** `map`'s value at `key`, after setting it to `make()` if there was none. */
export function getOrInsert<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
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

export interface PoolContext {
  /** Each item's earliest rank, for the same-rank pool. */
  bands: ReadonlyMap<number, Band>;
  /** Every item in the game, for the any-item pool. */
  allItems: readonly number[];
}

export interface PoolOptions {
  /** Any item first found at the quest's rank, or any item at all. */
  pool: "rank" | "any";
  /** Put every item the slots held back in one random slot first. */
  keepItems: boolean;
}

/**
 * New items for a group of a quest's item slots (one tier) from a wider
 * pool. With `keepItems`, each item the group's slots held is put back in
 * one random slot first, so it's still found at that point in the game;
 * the other slots get random pool items, avoiding repeats within one list
 * (`listKey`).
 */
export function fillFromPool<S extends { quest: LoadedQuest; tier: Tier; itemId: number }>(
  slots: readonly S[],
  options: PoolOptions,
  context: PoolContext,
  listKey: (slot: S) => string,
  rng: Rng,
): number[] {
  const out = slots.map((s) => s.itemId);
  const order = rng.shuffle(slots.map((_, i) => i));
  const required = options.keepItems
    ? [...new Set(slots.map((s) => s.itemId))].sort((a, b) => a - b)
    : [];
  required.forEach((item, k) => (out[order[k]!] = item));

  const pools = new Map<Band | "any", number[]>();
  const poolFor = (slot: S): number[] => {
    const band =
      options.pool === "rank" ? (questTier(slot.quest.parsed)?.band ?? slot.tier.band) : "any";
    let pool = pools.get(band);
    if (!pool) {
      pool =
        band === "any"
          ? [...context.allItems]
          : [...context.bands]
              .filter(([, b]) => b === band)
              .map(([item]) => item)
              .sort((a, b) => a - b);
      if (pool.length === 0) pool = [...context.allItems];
      pools.set(band, pool);
    }
    return pool;
  };
  const inList = new Map<string, Set<number>>();
  for (const k of order.slice(0, required.length)) {
    const key = listKey(slots[k]!);
    inList.set(key, (inList.get(key) ?? new Set()).add(out[k]!));
  }
  for (const k of order.slice(required.length)) {
    const slot = slots[k]!;
    const pool = poolFor(slot);
    const seen = inList.get(listKey(slot)) ?? new Set<number>();
    let pick = pool[rng.int(pool.length)]!;
    for (let tries = 0; tries < 8 && seen.has(pick); tries++) pick = pool[rng.int(pool.length)]!;
    out[k] = pick;
    inList.set(listKey(slot), seen.add(pick));
  }
  return out;
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
