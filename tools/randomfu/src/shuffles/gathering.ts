/**
 * Gathering points: the items a quest's mining, gathering and bug catching
 * nodes can give, from the item tables `game/gathering.ts` reads (only
 * tables some node uses, each pair once).
 *
 * Item IDs move between those pairs across Village and Guild quests of the
 * same tier; each pair keeps its value (the item's weight), so a node keeps
 * its odds and gives other things. Tables keep their length, so every quest
 * keeps its size. Gathering points are item sources for the tier logic,
 * and a permutation within each tier keeps every item at the tier it was
 * first found at.
 */
import type { LoadedQuest } from "../game/load.js";
import { readGatheringItems } from "../game/gathering.js";
import { questTier, tierKey, type Band, type Tier } from "../game/tiers.js";
import type { Edits } from "../edits.js";
import { itemName, questLabel } from "../names.js";
import type { Rng } from "../rng.js";
import { permuteWithinGroups, type ShuffleReport } from "./shuffle.js";

export interface GatheringSlotRef {
  quest: LoadedQuest;
  tier: Tier;
  /** The item table's index in the quest. */
  table: number;
  /** Payload offset of the `{ u16 value, u16 item }` pair. */
  offset: number;
  value: number;
  itemId: number;
}

export interface GatheringSlots {
  slots: GatheringSlotRef[];
  /** Quests with at least one gathering item. */
  quests: number;
  /** Quests whose gathering points couldn't be read, and why. */
  problems: string[];
}

/** Every used gathering pair in quests a player can take (see `questTier`). */
export function collectGatheringSlots(quests: readonly LoadedQuest[]): GatheringSlots {
  const slots: GatheringSlotRef[] = [];
  const problems: string[] = [];
  let count = 0;
  for (const quest of quests) {
    const tier = questTier(quest.parsed);
    if (!tier) continue;
    const result = readGatheringItems(quest.file.payload, quest.parsed);
    if (result.problem) problems.push(`${quest.path}: ${result.problem}`);
    if (result.items.length > 0) count++;
    for (const slot of result.slots) slots.push({ quest, tier, ...slot });
  }
  return { slots, quests: count, problems };
}

export type GatheringPool = "gathered" | "rank" | "any";

export interface GatheringOptions {
  /** Where items come from: what you could gather, any item of the quest's rank, or any item. */
  pool: GatheringPool;
  /** With a wider pool, still put every item you could gather somewhere in its tier. */
  keepItems: boolean;
}

export interface GatheringContext {
  /** Each item's earliest rank, for the same-rank pool. */
  bands: ReadonlyMap<number, Band>;
  /** Every item in the game, for the any-item pool. */
  allItems: readonly number[];
}

/**
 * New items for a group of slots (one tier) from a wider pool. With
 * `keepItems`, each item the group's slots held is put back in one random
 * slot first, so it's still found at that point in the game; the other
 * slots get random pool items, avoiding repeats within one table.
 */
function fillFromPool(
  slots: readonly GatheringSlotRef[],
  options: GatheringOptions,
  context: GatheringContext,
  rng: Rng,
): number[] {
  const out = slots.map((s) => s.itemId);
  const order = rng.shuffle(slots.map((_, i) => i));
  const required = options.keepItems
    ? [...new Set(slots.map((s) => s.itemId))].sort((a, b) => a - b)
    : [];
  required.forEach((item, k) => (out[order[k]!] = item));

  const pools = new Map<Band | "any", number[]>();
  const poolFor = (slot: GatheringSlotRef): number[] => {
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
  const tableKey = (s: GatheringSlotRef) => `${s.quest.index}:${s.table}`;
  const inTable = new Map<string, Set<number>>();
  for (const k of order.slice(0, required.length)) {
    const key = tableKey(slots[k]!);
    inTable.set(key, (inTable.get(key) ?? new Set()).add(out[k]!));
  }
  for (const k of order.slice(required.length)) {
    const slot = slots[k]!;
    const pool = poolFor(slot);
    const seen = inTable.get(tableKey(slot)) ?? new Set<number>();
    let pick = pool[rng.int(pool.length)]!;
    for (let tries = 0; tries < 8 && seen.has(pick); tries++) pick = pool[rng.int(pool.length)]!;
    out[k] = pick;
    inTable.set(tableKey(slot), seen.add(pick));
  }
  return out;
}

export function shuffleGathering(
  slots: readonly GatheringSlotRef[],
  options: GatheringOptions,
  context: GatheringContext,
  rng: Rng,
  edits: Edits,
): { report: ShuffleReport; after: { itemId: number; tier: Tier }[] } {
  let next: number[];
  if (options.pool === "gathered") {
    next = permuteWithinGroups(
      slots,
      (s) => tierKey(s.tier),
      (s) => s.itemId,
      rng,
    );
  } else {
    next = slots.map((s) => s.itemId);
    const groups = new Map<string, number[]>();
    slots.forEach((s, i) => {
      const key = tierKey(s.tier);
      groups.set(key, [...(groups.get(key) ?? []), i]);
    });
    for (const indices of groups.values()) {
      const filled = fillFromPool(
        indices.map((i) => slots[i]!),
        options,
        context,
        rng,
      );
      indices.forEach((slotIndex, k) => (next[slotIndex] = filled[k]!));
    }
  }
  let changed = 0;
  const lines = slots.map((slot, i) => {
    const itemId = next[i]!;
    edits.quest(slot.quest).writeUInt16LE(itemId, slot.offset + 2);
    if (itemId !== slot.itemId) changed++;
    return {
      where: questLabel(slot.quest),
      text: `Table ${slot.table}, value ${slot.value}: ${itemName(itemId)} (was ${itemName(slot.itemId)})`,
    };
  });
  const poolNote: Record<GatheringPool, string> = {
    gathered:
      "Items move between the gathering points of Village and Guild quests of the same rank and star level; each slot keeps its value (how likely it is).",
    rank: "Gathering points give any item first found at their quest's rank (Low, High or G); each slot keeps its value (how likely it is).",
    any: "Gathering points give any item in the game; each slot keeps its value (how likely it is).",
  };
  return {
    report: {
      title: "Gathering points",
      notes: [
        poolNote[options.pool],
        ...(options.pool !== "gathered"
          ? [
              options.keepItems
                ? "Every item you could gather is still at one or more spots at the same point in the game (see Logic)."
                : "Items you could gather may now be found nowhere; recipes that need them may not be craftable.",
            ]
          : []),
        "Only item tables a mining, gathering or bug catching node uses take part. Training School, Treasure Hunting and unused quests are unchanged.",
        `${changed} of ${slots.length} slots changed.`,
      ],
      lines,
    },
    after: slots.map((s, i) => ({ itemId: next[i]!, tier: s.tier })),
  };
}
