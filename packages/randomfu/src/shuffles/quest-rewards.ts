/**
 * Quest rewards: each `RewardItem` (u16 chance, u16 item, u16 amount) in a
 * quest's `RewardTBL` lists. The item and its amount move between quests of
 * the same tier (rank and star level); the chance stays with the slot, so a
 * quest keeps its reward odds but pays out other things.
 *
 * With a wider pool, slots get random items instead (any item first found
 * at the quest's rank, or any item), in the amount quest rewards usually
 * give of them; `keepItems` first puts each item the tier's slots held
 * back in one of them, as gathering points do.
 */
import type { LoadedQuest } from "../game/load.js";
import { questTier, tierKey, type Tier } from "../game/tiers.js";
import type { Edits } from "../edits.js";
import type { Rng } from "../rng.js";
import { itemName, questLabel } from "../names.js";
import {
  fillFromPool,
  groupBy,
  permuteWithinGroups,
  type PoolContext,
  type ShuffleReport,
} from "./shuffle.js";

const REWARD_ITEM_SIZE = 6;

export interface QuestRewardSlot {
  quest: LoadedQuest;
  tier: Tier;
  /** Offset of the `RewardItem` in the quest's plaintext payload. */
  offset: number;
  chance: number;
  itemId: number;
  amount: number;
}

export function collectQuestRewardSlots(quests: readonly LoadedQuest[]): QuestRewardSlot[] {
  const slots: QuestRewardSlot[] = [];
  for (const quest of quests) {
    const tier = questTier(quest.parsed);
    if (!tier) continue;
    const seen = new Set<number>(); // two tables can share one item list
    for (const table of quest.parsed.rewards) {
      table.items.forEach((item, i) => {
        const offset = table.itemsPtr + i * REWARD_ITEM_SIZE;
        if (seen.has(offset) || item.itemId === 0) return;
        seen.add(offset);
        slots.push({ quest, tier, offset, ...item });
      });
    }
  }
  return slots;
}

export type RewardPool = "rewards" | "rank" | "any";

export interface RewardOptions {
  pool: RewardPool;
  /** With a wider pool, still put every reward item somewhere in its tier. */
  keepItems: boolean;
}

export interface RewardContext extends PoolContext {
  /** How many of an item a slot gives when a wider pool puts it there. */
  usualAmount: (itemId: number) => number;
}

export function shuffleQuestRewards(
  slots: readonly QuestRewardSlot[],
  rng: Rng,
  edits: Edits,
  options: RewardOptions = { pool: "rewards", keepItems: true },
  context?: RewardContext,
): { report: ShuffleReport; after: { itemId: number; tier: Tier }[] } {
  let next: { itemId: number; amount: number }[];
  if (options.pool === "rewards" || !context) {
    next = permuteWithinGroups(
      slots,
      (s) => tierKey(s.tier),
      (s) => ({ itemId: s.itemId, amount: s.amount }),
      rng,
    );
  } else {
    next = slots.map((s) => ({ itemId: s.itemId, amount: s.amount }));
    const groups = groupBy(
      slots.map((_, i) => i),
      (i) => tierKey(slots[i]!.tier),
    );
    for (const indices of groups.values()) {
      const group = indices.map((i) => slots[i]!);
      const filled = fillFromPool(
        group,
        { pool: options.pool, keepItems: options.keepItems },
        context,
        (s) => `${s.quest.index}`,
        rng,
      );
      indices.forEach((slotIndex, k) => {
        const itemId = filled[k]!;
        const slot = slots[slotIndex]!;
        next[slotIndex] = {
          itemId,
          amount: itemId === slot.itemId ? slot.amount : context.usualAmount(itemId),
        };
      });
    }
  }
  const lines = slots.map((slot, i) => {
    const { itemId, amount } = next[i]!;
    const payload = edits.quest(slot.quest);
    payload.writeUInt16LE(itemId, slot.offset + 2);
    payload.writeUInt16LE(amount, slot.offset + 4);
    return {
      where: questLabel(slot.quest),
      text: `${slot.chance}% ${itemName(itemId)} x${amount} (was ${itemName(slot.itemId)} x${slot.amount})`,
    };
  });
  const poolNote: Record<RewardPool, string> = {
    rewards:
      "Items and amounts move between Village and Guild quests of the same rank and star level; each slot keeps its chance.",
    rank: "Reward slots give any item first found at their quest's rank (Low, High or G), in the amount quest rewards usually give of it; each slot keeps its chance.",
    any: "Reward slots give any item in the game, in the amount quest rewards usually give of it; each slot keeps its chance.",
  };
  const pool = context ? options.pool : "rewards";
  return {
    report: {
      title: "Quest rewards",
      notes: [
        poolNote[pool],
        ...(pool !== "rewards"
          ? [
              options.keepItems
                ? "Every item quests rewarded is still a reward at the same point in the game (see Logic)."
                : "Items quests rewarded may now be rewarded nowhere; recipes that need them may not be craftable.",
            ]
          : []),
        "Training School, Treasure Hunting and unused quests are unchanged.",
      ],
      lines,
    },
    after: slots.map((s, i) => ({ itemId: next[i]!.itemId, tier: s.tier })),
  };
}
