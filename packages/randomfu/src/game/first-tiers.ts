/**
 * Where items are first found, for the shuffles that rebuild quests
 * (`randomize.ts`'s `reshapeQuests`). A map move swaps a quest's gathering
 * points and small monsters for another map's, and a species swap changes
 * which small monsters it has, so either can take away the earliest source
 * of an item: a gathering point, or a monster whose carves have it at that
 * rank. `lostSources` finds the quests to blame, to put back as they were.
 */
import { collectGatheringSlots } from "../shuffles/gathering.js";
import { collectMonsterRewardSlots, type RewardList } from "../shuffles/monster-rewards.js";
import { collectQuestRewardSlots } from "../shuffles/quest-rewards.js";
import { getOrInsert } from "../shuffles/shuffle.js";
import type { LoadedQuest } from "./load.js";
import {
  coarsen,
  itemTiers,
  monsterStars,
  questTier,
  rewardRankBand,
  tierKey,
  tierOrder,
  type Band,
  type Tier,
  type TierMode,
} from "./tiers.js";

export interface ItemSources {
  /** Each item's earliest tier: quest rewards, monster rewards and gathering. */
  tiers: Map<number, Tier>;
  /** The items at each quest's gathering points, by quest index. */
  gathered: Map<number, Set<number>>;
  /** The monsters (large and small) in each quest, by quest index. */
  monsters: Map<number, Set<number>>;
}

export function itemSources(
  quests: readonly LoadedQuest[],
  lists: readonly RewardList[],
): ItemSources {
  const gathering = collectGatheringSlots(quests).slots;
  const tiers = itemTiers([
    ...collectQuestRewardSlots(quests),
    ...collectMonsterRewardSlots(lists, monsterStars(quests.map((q) => q.parsed))),
    ...gathering,
  ]);
  const gathered = new Map<number, Set<number>>();
  for (const { quest, itemId } of gathering) {
    getOrInsert(gathered, quest.index, () => new Set()).add(itemId);
  }
  const monsters = new Map(
    quests.map((q) => [
      q.index,
      new Set([
        ...q.parsed.largeMonsters.map((m) => m.monsterId),
        ...q.parsed.smallMonsters.flatMap((t) => t.monsters.map((m) => m.monsterId)),
      ]),
    ]),
  );
  return { tiers, gathered, monsters };
}

/** The monsters whose reward lists have each item, with the rank of the list. */
function carriers(lists: readonly RewardList[]): Map<number, { emId: number; band: Band }[]> {
  const out = new Map<number, { emId: number; band: Band }[]>();
  for (const list of lists) {
    for (const { itemId } of list.entries) {
      if (itemId === 0) continue;
      for (const ref of list.refs) {
        const band = rewardRankBand(ref.rank);
        if (band) getOrInsert(out, itemId, () => []).push({ emId: ref.emId, band });
      }
    }
  }
  return out;
}

/**
 * Items that `after` has later than `before` (at `mode`'s tiers), and the
 * quests among `changed` (indices) that took the earliest source of one
 * away: a quest of the item's first tier that gathered it and no longer
 * does, or that had a monster carrying it and no longer has. Putting any
 * one of those back brings the item back, so each item blames one (none if
 * another item already blamed one of them). Items found later with no
 * quest to blame are in `lost`.
 */
export function lostSources(
  quests: readonly LoadedQuest[],
  before: ItemSources,
  after: ItemSources,
  changed: ReadonlySet<number>,
  lists: readonly RewardList[],
  mode: TierMode,
): { blame: Set<number>; lost: number[] } {
  const blame = new Set<number>();
  const lost: number[] = [];
  if (mode === "none") return { blame, lost };
  const carry = carriers(lists);
  // Each changed quest's tier, and its key at `mode`, worked out once.
  const suspects = quests.flatMap((q) => {
    const tier = changed.has(q.index) ? questTier(q.parsed) : null;
    return tier ? [{ index: q.index, tier, key: tierKey(coarsen(tier, mode)) }] : [];
  });
  /** Whether quest `index` had `id` in `field` before and hasn't now. */
  const dropped = (field: "gathered" | "monsters", index: number, id: number) =>
    before[field].get(index)?.has(id) === true && after[field].get(index)?.has(id) !== true;
  for (const [item, first] of before.tiers) {
    const now = after.tiers.get(item);
    const was = coarsen(first, mode);
    if (now && tierOrder(coarsen(now, mode)) <= tierOrder(was)) continue;
    const wasKey = tierKey(was);
    const found = suspects.filter((q) => {
      if (q.key !== wasKey) return false;
      if (dropped("gathered", q.index, item)) return true;
      return (carry.get(item) ?? []).some(
        (c) => c.band === q.tier.band && dropped("monsters", q.index, c.emId),
      );
    });
    if (found.length === 0) lost.push(item);
    else if (!found.some((q) => blame.has(q.index))) blame.add(found[0]!.index);
  }
  return { blame, lost };
}
