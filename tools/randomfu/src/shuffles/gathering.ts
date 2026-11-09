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
import { questTier, tierKey, type Tier } from "../game/tiers.js";
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

export function shuffleGathering(
  slots: readonly GatheringSlotRef[],
  rng: Rng,
  edits: Edits,
): { report: ShuffleReport; after: { itemId: number; tier: Tier }[] } {
  const next = permuteWithinGroups(
    slots,
    (s) => tierKey(s.tier),
    (s) => s.itemId,
    rng,
  );
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
  return {
    report: {
      title: "Gathering points",
      notes: [
        "Items move between the gathering points of Village and Guild quests of the same rank and star level; each slot keeps its value (how likely it is).",
        "Only item tables a mining, gathering or bug catching node uses take part. Training School, Treasure Hunting and unused quests are unchanged.",
        `${changed} of ${slots.length} slots changed.`,
      ],
      lines,
    },
    after: slots.map((s, i) => ({ itemId: next[i]!, tier: s.tier })),
  };
}
