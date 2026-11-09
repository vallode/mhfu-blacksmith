/**
 * Quest rewards: each `RewardItem` (u16 chance, u16 item, u16 amount) in a
 * quest's `RewardTBL` lists. The item and its amount move between quests of
 * the same band; the chance stays with the slot, so a quest keeps its
 * reward odds but pays out other things.
 */
import type { LoadedQuest } from "../game/load.js";
import { questBand, type Band } from "../game/bands.js";
import type { Edits } from "../edits.js";
import type { Rng } from "../rng.js";
import { itemName, questLabel } from "../names.js";
import { permuteWithinGroups, type ShuffleReport } from "./shuffle.js";

const REWARD_ITEM_SIZE = 6;

export interface QuestRewardSlot {
  quest: LoadedQuest;
  band: Band;
  /** Offset of the `RewardItem` in the quest's plaintext payload. */
  offset: number;
  chance: number;
  itemId: number;
  amount: number;
}

export function collectQuestRewardSlots(quests: readonly LoadedQuest[]): QuestRewardSlot[] {
  const slots: QuestRewardSlot[] = [];
  for (const quest of quests) {
    const band = questBand(quest.parsed);
    if (!band) continue;
    const seen = new Set<number>(); // two tables can share one item list
    for (const table of quest.parsed.rewards) {
      table.items.forEach((item, i) => {
        const offset = table.itemsPtr + i * REWARD_ITEM_SIZE;
        if (seen.has(offset) || item.itemId === 0) return;
        seen.add(offset);
        slots.push({ quest, band, offset, ...item });
      });
    }
  }
  return slots;
}

export function shuffleQuestRewards(
  slots: readonly QuestRewardSlot[],
  rng: Rng,
  edits: Edits,
): { report: ShuffleReport; after: { itemId: number; band: Band }[] } {
  const next = permuteWithinGroups(
    slots,
    (s) => s.band,
    (s) => ({ itemId: s.itemId, amount: s.amount }),
    rng,
  );
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
  return {
    report: {
      title: "Quest rewards",
      notes: [
        "Items and amounts move between Village and Guild quests of the same rank; each slot keeps its chance.",
        "Training School, Treasure Hunting and unused quests are unchanged.",
      ],
      lines,
    },
    after: slots.map((s, i) => ({ itemId: next[i]!.itemId, band: s.band })),
  };
}
