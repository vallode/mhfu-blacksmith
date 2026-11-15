/**
 * Quest rewards: each `RewardItem` (u16 chance, u16 item, u16 amount) in a
 * quest's `RewardTBL` lists. A list's chances add up to 100.
 *
 * Shuffle moves whole slots (item, amount and chance) between quests, as
 * far as the scope allows, and each quest keeps its number of slots. The
 * chances then no longer add up in the lists that got other slots, so each
 * list is scaled back to its own total.
 *
 * Randomize rolls everything: how many slots a main list has (up to the
 * most any list of its kind has on the disc, and as many as the quest's
 * sectors hold), which item each slot gives (any item first found within
 * the scope), its amount and its chance.
 */
import { classifyRewardTable } from "mhfu-extract/src/emit/quests.js";
import { parseQuest } from "mhfu-extract/src/quests/parser.js";
import { isQuestItem } from "../game/quest-fields.js";
import type { LoadedQuest } from "../game/load.js";
import { questTier, tierKey, type Scope, type Tier } from "../game/tiers.js";
import type { Edits } from "../edits.js";
import type { Rng } from "../rng.js";
import { itemName, questLabel } from "../names.js";
import {
  permuteWithinScope,
  reconcile,
  rollChances,
  scopedPool,
  type ChanceRange,
  type ShuffleReport,
} from "./shuffle.js";

const REWARD_ITEM_SIZE = 6;
const REWARD_TABLE_SIZE = 8;
const LIST_END = 0xffff;

export type RewardKind = "main" | "extra" | "conditional";

/** One `RewardItem[]` in a quest, which one or more reward tables point at. */
export interface QuestRewardList {
  quest: LoadedQuest;
  tier: Tier;
  kind: RewardKind;
  /** Offset of the first `RewardItem` in the quest's plaintext payload. */
  itemsPtr: number;
  /** Indexes of the quest's reward tables that use this list. */
  tables: number[];
  /** True if the list has empty (item 0) entries, which are left alone. */
  hasEmpty: boolean;
  slots: QuestRewardSlot[];
}

export interface QuestRewardSlot {
  quest: LoadedQuest;
  tier: Tier;
  list: QuestRewardList;
  /** Offset of the `RewardItem` in the quest's plaintext payload. */
  offset: number;
  chance: number;
  itemId: number;
  amount: number;
}

/**
 * Every used reward slot in quests a player can take. With `payloadOf`, the
 * lists are read from that payload instead of the quest as it was on the
 * disc (the quest as shuffles left it).
 */
export function collectQuestRewardSlots(
  quests: readonly LoadedQuest[],
  payloadOf?: (quest: LoadedQuest) => Buffer,
): QuestRewardSlot[] {
  const slots: QuestRewardSlot[] = [];
  for (const quest of quests) {
    const tier = questTier(quest.parsed);
    if (!tier) continue;
    const parsed = payloadOf ? parseQuest(payloadOf(quest)) : quest.parsed;
    const lists = new Map<number, QuestRewardList>(); // two tables can share one item list
    parsed.rewards.forEach((table, index) => {
      const known = lists.get(table.itemsPtr);
      if (known) {
        known.tables.push(index);
        return;
      }
      const list: QuestRewardList = {
        quest,
        tier,
        kind: classifyRewardTable(table).kind,
        itemsPtr: table.itemsPtr,
        tables: [index],
        hasEmpty: false,
        slots: [],
      };
      lists.set(table.itemsPtr, list);
      table.items.forEach((item, i) => {
        if (item.itemId === 0) {
          list.hasEmpty = true;
          return;
        }
        const slot = { quest, tier, list, offset: table.itemsPtr + i * REWARD_ITEM_SIZE, ...item };
        list.slots.push(slot);
        slots.push(slot);
      });
    });
  }
  return slots;
}

/** The lists `slots` belong to, once each, in order. */
function listsOf(slots: readonly QuestRewardSlot[]): QuestRewardList[] {
  return [...new Set(slots.map((s) => s.list))];
}

function writeSlot(
  payload: Buffer,
  offset: number,
  slot: { chance: number; itemId: number; amount: number },
): void {
  payload.writeUInt16LE(slot.chance, offset);
  payload.writeUInt16LE(slot.itemId, offset + 2);
  payload.writeUInt16LE(slot.amount, offset + 4);
}

const NOTE_UNCHANGED = "Training School, Treasure Hunting and unused quests are unchanged.";

export function shuffleQuestRewards(
  slots: readonly QuestRewardSlot[],
  scope: Scope,
  rng: Rng,
  edits: Edits,
): { report: ShuffleReport; after: { itemId: number; tier: Tier }[] } {
  const next = permuteWithinScope(
    slots,
    (s) => s.tier,
    scope,
    (s) => s.list.kind,
    (s) => ({ itemId: s.itemId, amount: s.amount, chance: s.chance }),
    rng,
  );
  const index = new Map(slots.map((s, i) => [s, i]));
  const lines: { where: string; text: string }[] = [];
  for (const list of listsOf(slots)) {
    // Slots from other lists bring their own chances: scale them back to this list's total.
    const total = list.slots.reduce((sum, s) => sum + s.chance, 0);
    const moved = list.slots.map((s) => next[index.get(s)!]!);
    const chances =
      total >= moved.length
        ? reconcile(
            moved.map((m) => m.chance),
            total,
          )
        : moved.map((m) => m.chance);
    const payload = edits.quest(list.quest);
    list.slots.forEach((slot, k) => {
      const value = { ...moved[k]!, chance: chances[k]! };
      writeSlot(payload, slot.offset, value);
      lines.push({
        where: questLabel(slot.quest),
        text: `${value.chance}% ${itemName(value.itemId)} x${value.amount} (was ${slot.chance}% ${itemName(slot.itemId)} x${slot.amount})`,
      });
    });
  }
  return {
    report: {
      title: "Quest rewards",
      notes: [
        `Reward slots (item, amount and chance) move between ${scopeNote(scope)}. Each quest keeps its number of slots.`,
        "A list's chances always add up to 100, so slots that came from another list are scaled to fit.",
        NOTE_UNCHANGED,
      ],
      lines,
    },
    after: slots.map((s, i) => ({ itemId: next[i]!.itemId, tier: s.tier })),
  };
}

function scopeNote(scope: Scope): string {
  switch (scope) {
    case "star":
      return "Village and Guild quests of the same rank and star level";
    case "rank":
      return "Village and Guild quests of the same rank";
    case "adjacent":
      return "Village and Guild quests of the same or the next rank";
    case "any":
      return "any Village and Guild quests";
  }
}

export interface RandomizeRewardsOptions {
  scope: Scope;
  /** How far a main list's slot count can move, as a fraction of its own. */
  slotSpread: number;
  /**
   * Rarity: each slot keeps a chance the list had. Reasonable: each is
   * scaled by 0.5 to 2. Any: 1 to 100. Always scaled back to the list's total.
   */
  chances: ChanceRange;
  /** Still put every item the star level's lists held somewhere in it. */
  keepItems: boolean;
}

export interface RewardContext {
  /** Each item's earliest tier, for what a scope allows. */
  tiers: ReadonlyMap<number, Tier>;
  /** Every item in the game. */
  allItems: readonly number[];
  /** The amounts quests give of an item, from rewards and supplies. */
  amounts: (itemId: number) => readonly number[];
  /** The largest quest on the disc, in bytes: no quest grows past it. */
  largestQuest: number;
}

export function randomizeQuestRewards(
  slots: readonly QuestRewardSlot[],
  options: RandomizeRewardsOptions,
  context: RewardContext,
  rng: Rng,
  edits: Edits,
): { report: ShuffleReport; after: { itemId: number; tier: Tier }[] } {
  const lists = listsOf(slots);
  // Sizes the game is known to handle: the longest list of each kind.
  const largest: Record<RewardKind, number> = { main: 1, extra: 1, conditional: 1 };
  for (const list of lists) largest[list.kind] = Math.max(largest[list.kind], list.slots.length);

  const everything = context.allItems.filter((i) => !isQuestItem(i));
  const poolFor = scopedPool(everything, context.tiers, options.scope);

  const lines: { where: string; text: string }[] = [];
  // Every item a quest can give once rolled, for the recipe check.
  const after: { itemId: number; tier: Tier }[] = [];
  let changedLists = 0;
  let relocated = 0;
  let capped = 0;

  // Pass 1: how many slots each list gets.
  interface Plan {
    list: QuestRewardList;
    n: number;
    m: number;
  }
  const plans: Plan[] = [];
  const appended = new Map<LoadedQuest, number>(); // bytes the lists moved to a quest's end take
  for (const list of lists) {
    if (list.hasEmpty) {
      after.push(...list.slots.map((s) => ({ itemId: s.itemId, tier: s.tier })));
      continue;
    }
    const n = list.slots.length;
    let m = n;
    if (list.kind === "main") {
      const low = Math.max(1, Math.round(n * (1 - options.slotSpread)));
      const high = Math.min(largest.main, Math.round(n * (1 + options.slotSpread)));
      m = high >= low ? low + rng.int(high - low + 1) : n;
    }
    if (m > n) {
      const at = ((edits.questNow(list.quest).length + 3) & ~3) + (appended.get(list.quest) ?? 0);
      const limit = Math.min(list.quest.file.capacity, context.largestQuest);
      const fits = Math.floor((limit - at - 2) / REWARD_ITEM_SIZE);
      if (fits < m) capped++;
      m = fits > n ? Math.min(m, fits) : n;
      if (m > n) {
        appended.set(
          list.quest,
          (appended.get(list.quest) ?? 0) + ((m * REWARD_ITEM_SIZE + 2 + 3) & ~3),
        );
      }
    }
    plans.push({ list, n, m });
  }

  // Pass 2: which item each new slot gives. With keepItems, each item a star level's lists
  // held is first put back in one random slot of that star level, so it's still a reward at
  // the same point in the game; the other slots draw from the pool (no repeats in a list).
  const items = new Map<QuestRewardList, number[]>(plans.map((p) => [p.list, []]));
  const groups = new Map<string, { list: QuestRewardList; k: number }[]>();
  for (const { list, m } of plans) {
    const key = tierKey(list.tier);
    const group = groups.get(key) ?? [];
    groups.set(key, group);
    for (let k = 0; k < m; k++) group.push({ list, k });
  }
  for (const group of groups.values()) {
    const order = rng.shuffle([...group]);
    const required = options.keepItems
      ? [
          ...new Set(
            group.flatMap(({ list, k }) => (k === 0 ? list.slots.map((s) => s.itemId) : [])),
          ),
        ].sort((a, b) => a - b)
      : [];
    const chosen = new Map<{ list: QuestRewardList; k: number }, number>();
    const held = new Map<QuestRewardList, Set<number>>();
    const note = (list: QuestRewardList, item: number) =>
      held.set(list, (held.get(list) ?? new Set()).add(item));
    required.slice(0, order.length).forEach((item, k) => {
      chosen.set(order[k]!, item);
      note(order[k]!.list, item);
    });
    for (const position of order.slice(required.length)) {
      const pool = poolFor(position.list.tier, 1);
      const have = held.get(position.list) ?? new Set<number>();
      let pick = pool[rng.int(pool.length)]!;
      for (let tries = 0; tries < 16 && have.has(pick); tries++) pick = pool[rng.int(pool.length)]!;
      chosen.set(position, pick);
      note(position.list, pick);
    }
    for (const position of group) items.get(position.list)![position.k] = chosen.get(position)!;
  }

  // Pass 3: chances and amounts, and the writes.
  for (const { list, n, m } of plans) {
    const chances = rollChances(
      list.slots.map((x) => x.chance),
      m,
      options.chances,
      rng,
    );
    const entries = items.get(list)!.map((itemId, k) => {
      const amounts = context.amounts(itemId);
      return {
        chance: chances[k]!,
        itemId,
        amount: amounts.length > 0 ? amounts[rng.int(amounts.length)]! : 1,
      };
    });

    let payload = edits.quest(list.quest);
    let offset = list.itemsPtr;
    if (m > n) {
      const block = Buffer.alloc(m * REWARD_ITEM_SIZE + 2);
      block.writeUInt16LE(LIST_END, m * REWARD_ITEM_SIZE);
      offset = edits.appendToQuest(list.quest, block);
      payload = edits.quest(list.quest);
      for (const table of list.tables) {
        payload.writeUInt32LE(
          offset,
          list.quest.parsed.header.rewardsPtr + table * REWARD_TABLE_SIZE + 4,
        );
      }
      relocated++;
    } else {
      payload.writeUInt16LE(LIST_END, offset + m * REWARD_ITEM_SIZE);
    }
    entries.forEach((entry, k) => writeSlot(payload, offset + k * REWARD_ITEM_SIZE, entry));

    changedLists++;
    const where = questLabel(list.quest);
    if (m !== n) lines.push({ where, text: `${list.kind} reward list: ${n} slots -> ${m}` });
    entries.forEach((entry, k) => {
      const was = list.slots[k];
      lines.push({
        where,
        text: `${entry.chance}% ${itemName(entry.itemId)} x${entry.amount}${was ? ` (was ${was.chance}% ${itemName(was.itemId)} x${was.amount})` : ""}`,
      });
    });
    after.push(...entries.map((e) => ({ itemId: e.itemId, tier: list.tier })));
  }

  return {
    report: {
      title: "Quest rewards",
      notes: [
        `Each Village and Guild quest's main reward list gets a new number of slots (up to ±${Math.round(options.slotSpread * 100)}%, never more than the ${largest.main} the longest list on the disc has or the quest's sectors hold), and every slot a new item first found ${scopeFound(options.scope)}, a new amount and a new chance.`,
        options.chances === "rarity"
          ? "Chances are the ones the list had, dealt to the new slots."
          : options.chances === "reasonable"
            ? "Chances are the list's own, scaled by 0.5 to 2."
            : "Chances are rolled from 1 to 100.",
        "A list's chances always add up to 100: after the roll they're scaled to fit.",
        options.keepItems
          ? "Every item quests rewarded is still a reward at the same star level, where the new slots leave room."
          : "Items quests rewarded may now be rewarded nowhere; recipes that need them may not be craftable.",
        "Other reward lists (extras and conditional ones) keep their number of slots.",
        NOTE_UNCHANGED,
        `${changedLists} lists rolled; ${relocated} moved to the end of their quest for more slots; ${capped} wanted more room than they had.`,
      ],
      lines,
    },
    after,
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
