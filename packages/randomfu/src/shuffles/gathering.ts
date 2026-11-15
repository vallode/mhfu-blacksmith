/**
 * Gathering points: the items a quest's mining, gathering and bug catching
 * nodes can give, from the item tables `game/gathering.ts` reads (only
 * tables some node uses, each pair once).
 *
 * Shuffle moves whole pairs (item and value) between Village and Guild
 * quests, within a scope, and a table's values are then scaled back to the
 * total they had. Randomize gives every pair a new item (first found within
 * the scope) and a new value. Tables keep their length, so every quest keeps
 * its size. Gathering points are item sources for the tier logic.
 */
import type { LoadedQuest } from "../game/load.js";
import { readGatheringItems } from "mhfu-extract/src/quests/gathering.js";
import { questTier, tierKey, type Scope, type Tier } from "../game/tiers.js";
import type { Edits } from "../edits.js";
import { itemName, questLabel } from "../names.js";
import type { Rng } from "../rng.js";
import {
  permuteWithinScope,
  reconcile,
  rollChances,
  scopedPool,
  type ChanceRange,
  type ShuffleReport,
} from "./shuffle.js";

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

function tableKey(s: GatheringSlotRef): string {
  return `${s.quest.index}:${s.table}`;
}

/** The slots grouped by table, in order. */
function byTable(slots: readonly GatheringSlotRef[]): Map<string, GatheringSlotRef[]> {
  const out = new Map<string, GatheringSlotRef[]>();
  for (const slot of slots) {
    const list = out.get(tableKey(slot));
    if (list) list.push(slot);
    else out.set(tableKey(slot), [slot]);
  }
  return out;
}

function writeSlot(
  edits: Edits,
  slot: GatheringSlotRef,
  value: { value: number; itemId: number },
): void {
  const payload = edits.quest(slot.quest);
  payload.writeUInt16LE(value.value, slot.offset);
  payload.writeUInt16LE(value.itemId, slot.offset + 2);
}

function lineFor(slot: GatheringSlotRef, value: { value: number; itemId: number }) {
  return {
    where: questLabel(slot.quest),
    text: `Table ${slot.table}, value ${value.value}: ${itemName(value.itemId)} (was value ${slot.value}: ${itemName(slot.itemId)})`,
  };
}

const NOTE_ONLY =
  "Only item tables a mining, gathering or bug catching node uses take part. Training School, Treasure Hunting and unused quests are unchanged.";

function scopeNote(scope: Scope): string {
  switch (scope) {
    case "star":
      return "of the same rank and star level";
    case "rank":
      return "of the same rank";
    case "adjacent":
      return "of the same or the next rank";
    case "any":
      return "of any rank";
  }
}

export function shuffleGathering(
  slots: readonly GatheringSlotRef[],
  scope: Scope,
  rng: Rng,
  edits: Edits,
): { report: ShuffleReport; after: { itemId: number; tier: Tier }[] } {
  const next = permuteWithinScope(
    slots,
    (s) => s.tier,
    scope,
    () => "",
    (s) => ({ itemId: s.itemId, value: s.value }),
    rng,
  );
  const index = new Map(slots.map((s, i) => [s, i]));
  const lines: { where: string; text: string }[] = [];
  for (const own of byTable(slots).values()) {
    // Pairs from other tables bring their own values: scale them back to this table's total.
    const total = own.reduce((sum, s) => sum + s.value, 0);
    const moved = own.map((s) => next[index.get(s)!]!);
    const values =
      total >= moved.length
        ? reconcile(
            moved.map((m) => m.value),
            total,
          )
        : moved.map((m) => m.value);
    own.forEach((slot, k) => {
      const value = { ...moved[k]!, value: values[k]! };
      writeSlot(edits, slot, value);
      lines.push(lineFor(slot, value));
    });
  }
  return {
    report: {
      title: "Gathering points",
      notes: [
        `Pairs (item and value, how likely it is) move between the gathering points of Village and Guild quests ${scopeNote(scope)}. Each table keeps its length.`,
        "A table's values always add up to what they did, so pairs that came from another table are scaled to fit.",
        NOTE_ONLY,
      ],
      lines,
    },
    after: slots.map((s, i) => ({ itemId: next[i]!.itemId, tier: s.tier })),
  };
}

export interface RandomizeGatheringOptions {
  scope: Scope;
  chances: ChanceRange;
  /** Still put every item you could gather somewhere in its star level. */
  keepItems: boolean;
}

export interface GatheringContext {
  /** Each item's earliest tier, for what a scope allows. */
  tiers: ReadonlyMap<number, Tier>;
  /** Every item in the game. */
  allItems: readonly number[];
}

export function randomizeGathering(
  slots: readonly GatheringSlotRef[],
  options: RandomizeGatheringOptions,
  context: GatheringContext,
  rng: Rng,
  edits: Edits,
): { report: ShuffleReport; after: { itemId: number; tier: Tier }[] } {
  const poolFor = scopedPool(context.allItems, context.tiers, options.scope);
  const items = new Map<GatheringSlotRef, number>();

  // With keepItems, each item a star level's spots give is put back in one random spot of it
  // first, so it's still found at that point in the game; the other spots draw from the pool.
  const groups = new Map<string, GatheringSlotRef[]>();
  for (const slot of slots) {
    const key = tierKey(slot.tier);
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  const inTable = new Map<string, Set<number>>();
  const seen = (slot: GatheringSlotRef) => {
    let set = inTable.get(tableKey(slot));
    if (!set) inTable.set(tableKey(slot), (set = new Set()));
    return set;
  };
  for (const group of groups.values()) {
    const order = rng.shuffle([...group]);
    const required = options.keepItems
      ? [...new Set(group.map((s) => s.itemId))].sort((a, b) => a - b)
      : [];
    required.forEach((item, k) => {
      items.set(order[k]!, item);
      seen(order[k]!).add(item);
    });
    for (const slot of order.slice(required.length)) {
      const pool = poolFor(slot.tier, 1);
      const used = seen(slot);
      let pick = pool[rng.int(pool.length)]!;
      for (let tries = 0; tries < 8 && used.has(pick); tries++) pick = pool[rng.int(pool.length)]!;
      items.set(slot, pick);
      used.add(pick);
    }
  }

  const lines: { where: string; text: string }[] = [];
  let changed = 0;
  for (const own of byTable(slots).values()) {
    const values = rollChances(
      own.map((s) => s.value),
      own.length,
      options.chances,
      rng,
    );
    own.forEach((slot, k) => {
      const value = { itemId: items.get(slot)!, value: values[k]! };
      writeSlot(edits, slot, value);
      if (value.itemId !== slot.itemId) changed++;
      lines.push(lineFor(slot, value));
    });
  }
  return {
    report: {
      title: "Gathering points",
      notes: [
        `Every pair gets a new item first found ${scopeFound(options.scope)} and a new value (${options.chances === "rarity" ? "the table's own, dealt out again" : options.chances === "reasonable" ? "the table's own, scaled by 0.5 to 2" : "rolled from 1 to 100"}), scaled so a table's values add up to what they did. Each table keeps its length.`,
        options.keepItems
          ? "Every item you could gather is still at one or more spots at the same star level (see Logic)."
          : "Items you could gather may now be found nowhere; recipes that need them may not be craftable.",
        NOTE_ONLY,
        `${changed} of ${slots.length} slots changed item.`,
      ],
      lines,
    },
    after: slots.map((s) => ({ itemId: items.get(s)!, tier: s.tier })),
  };
}

function scopeFound(scope: Scope): string {
  switch (scope) {
    case "star":
      return "at the quest's rank and star level";
    case "rank":
      return "at the quest's rank";
    case "adjacent":
      return "at the quest's rank or the next";
    case "any":
      return "anywhere";
  }
}
