/**
 * Supply boxes: the `{ u16 item, u16 amount }` list each quest hands out
 * (`readSupplySlots`). The shuffles rewrite entries in place, so every list
 * keeps its length, its end marker and the quest its size.
 *
 * Adding stacks (`addSupplies`) needs a longer list. The list is followed
 * straight away by the gathering tables, so the box is copied, with the new
 * stacks and the same end marker, to the end of the quest, and
 * `SuppliesPTR` points there; the old list stays, unread. The quest grows
 * into its DATA.BIN entry's sector padding, so DATA.BIN keeps its layout.
 * It never grows past the largest quest on the disc, and no box gets more
 * stacks than the largest box on the disc: both are sizes the game already
 * handles.
 *
 * Guild quests list a stack once per hunter (four Maps, four First-Aid
 * Meds), so runs of identical entries move as one: a run gets one new item
 * and amount, written into each of its entries.
 *
 * Supply items aren't counted as item sources: whether the game takes back
 * what a hunter didn't use isn't known, so the tier logic doesn't lean on
 * them, and the wider pools stay within the quest's rank.
 */
import type { LoadedQuest } from "../game/load.js";
import { isQuestItem, readSupplySlots, SUPPLIES_PTR } from "../game/quest-fields.js";
import { questTier, tierKey, type Band, type Tier } from "../game/tiers.js";
import type { Edits } from "../edits.js";
import { itemName, questLabel } from "../names.js";
import type { Rng } from "../rng.js";
import { permuteWithinGroups, type ShuffleReport } from "./shuffle.js";

export interface SupplyRun {
  quest: LoadedQuest;
  tier: Tier;
  /** Payload offsets of the run's entries. */
  offsets: number[];
  itemId: number;
  amount: number;
}

export type SupplyPool = "supplies" | "rank" | "add";

export interface SupplyOptions {
  pool: SupplyPool;
  /** Keep quest-only items (Map, Paw Pass Ticket, ballista ammo, ...) where they are. */
  keepEssentials: boolean;
}

export interface SupplyContext {
  /** Each item's earliest rank, for the same-rank pool. */
  bands: ReadonlyMap<number, Band>;
  /** Every item in the game, for added stacks. */
  allItems: readonly number[];
  /** How many of an item a slot gets when it comes from a wider pool, or is added. */
  usualAmount: (itemId: number) => number;
  /**
   * The item a delivery quest asks for, which its box must never hold (or
   * the quest is done on opening it). Undefined for other quests.
   */
  deliveryItem: (quest: LoadedQuest) => number | undefined;
}

/**
 * Every run of identical supply entries in quests a player can take (see
 * `questTier`), except those `keep` says stay: they're neither moved nor
 * handed to other quests.
 */
export function collectSupplyRuns(
  quests: readonly LoadedQuest[],
  keep: (quest: LoadedQuest, itemId: number) => boolean,
): SupplyRun[] {
  const runs: SupplyRun[] = [];
  for (const quest of quests) {
    const tier = questTier(quest.parsed);
    if (!tier) continue;
    let run: SupplyRun | null = null;
    for (const slot of readSupplySlots(quest.file.payload)) {
      if (run && run.itemId === slot.itemId && run.amount === slot.amount) {
        run.offsets.push(slot.offset);
        continue;
      }
      run = keep(quest, slot.itemId)
        ? null
        : { quest, tier, offsets: [slot.offset], itemId: slot.itemId, amount: slot.amount };
      if (run) runs.push(run);
    }
  }
  return runs;
}

/** Random items from the quest's rank, no item twice in one quest where it can be helped. */
function drawFromRank(
  runs: readonly SupplyRun[],
  context: SupplyContext,
  rng: Rng,
): { itemId: number; amount: number }[] {
  const supplyItems = [...new Set(runs.map((r) => r.itemId))].filter((i) => !isQuestItem(i));
  const pools = new Map<string, number[]>();
  const poolFor = (run: SupplyRun): number[] => {
    // The quest's own rank: `run.tier` may be coarsened by `logic.tiers`.
    const key = questTier(run.quest.parsed)?.band ?? run.tier.band;
    let items = pools.get(key);
    if (!items) {
      const wide = [...context.bands].filter(([, band]) => band === key).map(([item]) => item);
      items = [...new Set([...supplyItems, ...wide])]
        .filter((i) => !isQuestItem(i))
        .sort((a, b) => a - b);
      pools.set(key, items);
    }
    return items;
  };
  const inQuest = new Map<number, Set<number>>();
  return runs.map((run) => {
    const target = context.deliveryItem(run.quest);
    const pool = poolFor(run);
    const items = target === undefined ? pool : pool.filter((i) => i !== target);
    const seen = inQuest.get(run.quest.index) ?? new Set<number>();
    let pick = items[rng.int(items.length)]!;
    for (let tries = 0; tries < 8 && seen.has(pick); tries++) pick = items[rng.int(items.length)]!;
    inQuest.set(run.quest.index, seen.add(pick));
    return { itemId: pick, amount: context.usualAmount(pick) };
  });
}

export function shuffleSupplies(
  runs: readonly SupplyRun[],
  options: SupplyOptions & { pool: "supplies" | "rank" },
  context: SupplyContext,
  rng: Rng,
  edits: Edits,
): ShuffleReport {
  const next =
    options.pool === "supplies"
      ? permuteWithinGroups(
          runs,
          (r) => tierKey(r.tier),
          (r) => ({ itemId: r.itemId, amount: r.amount }),
          rng,
        )
      : drawFromRank(runs, context, rng);
  if (options.pool === "supplies") keepDeliveriesOut(runs, next, context);
  let changed = 0;
  const lines = runs.map((run, i) => {
    const { itemId, amount } = next[i]!;
    const payload = edits.quest(run.quest);
    for (const offset of run.offsets) {
      payload.writeUInt16LE(itemId, offset);
      payload.writeUInt16LE(amount, offset + 2);
    }
    if (itemId !== run.itemId || amount !== run.amount) changed++;
    const stacks = run.offsets.length > 1 ? `${run.offsets.length} stacks of ` : "";
    return {
      where: questLabel(run.quest),
      text: `${stacks}${itemName(itemId)} x${amount} (was ${itemName(run.itemId)} x${run.amount})`,
    };
  });
  const poolNote = {
    supplies:
      "Items and amounts move between the supply boxes of Village and Guild quests of the same rank and star level.",
    rank: "Supply boxes hold any item first found at their quest's rank (Low, High or G) or found in any supply box, in its usual amount.",
  };
  return {
    title: "Supply boxes",
    notes: [
      poolNote[options.pool],
      "Each supply box keeps its length; stacks listed once per hunter move together.",
      options.keepEssentials
        ? "Maps, Paw Pass Tickets, ballista and cannon ammo and the other quest-only items stay where they are."
        : "Maps and the other quest-only supplies move too (wider pools never add them).",
      "A delivery quest's own item (the Paw Pass Ticket) always stays, and no delivery quest's box gets the item it asks for. Training School, Treasure Hunting and unused quests are unchanged.",
      `${changed} of ${runs.length} stacks changed.`,
    ],
    lines,
  };
}

/**
 * Moves a delivery quest's own item out of its box, after a permutation put
 * it there, by swapping with another run of the same tier that can take it.
 * The tier's multiset of stacks stays the same.
 */
function keepDeliveriesOut(
  runs: readonly SupplyRun[],
  next: { itemId: number; amount: number }[],
  context: SupplyContext,
): void {
  const allowed = (i: number, itemId: number) => context.deliveryItem(runs[i]!.quest) !== itemId;
  runs.forEach((run, i) => {
    if (allowed(i, next[i]!.itemId)) return;
    const key = tierKey(run.tier);
    const j = runs.findIndex(
      (other, k) =>
        tierKey(other.tier) === key && allowed(i, next[k]!.itemId) && allowed(k, next[i]!.itemId),
    );
    if (j !== -1) [next[i], next[j]] = [next[j]!, next[i]!];
  });
}

/** Stacks added to each box, room allowing. */
export const ADDED_STACKS = 4;

/**
 * Keeps every Village and Guild quest's supply box and adds up to
 * `ADDED_STACKS` stacks of random items (any item but quest-only ones and
 * what the box already has), in their usual amount.
 */
export function addSupplies(
  quests: readonly LoadedQuest[],
  context: SupplyContext,
  rng: Rng,
  edits: Edits,
): ShuffleReport {
  // Sizes the game is known to handle: the largest quest and the largest box.
  const largestQuest = Math.max(...quests.map((q) => q.file.payload.length));
  const largestBox = Math.max(...quests.map((q) => readSupplySlots(q.file.payload).length));
  const items = context.allItems.filter((i) => !isQuestItem(i));
  const lines: { where: string; text: string }[] = [];
  let added = 0;
  let full = 0;
  for (const quest of quests) {
    if (!questTier(quest.parsed)) continue;
    const now = edits.questNow(quest);
    const box = readSupplySlots(now);
    const end = now.readUInt32LE(SUPPLIES_PTR) + box.length * 4;
    const at = (now.length + 3) & ~3;
    const limit = Math.min(quest.file.capacity, largestQuest);
    const fits = Math.floor((limit - at) / 4) - box.length - 1;
    const count = Math.min(ADDED_STACKS, largestBox - box.length, fits);
    if (count <= 0) {
      full++;
      lines.push({ where: questLabel(quest), text: "no room for more stacks" });
      continue;
    }
    const have = new Set(box.map((s) => s.itemId));
    const target = context.deliveryItem(quest);
    if (target !== undefined) have.add(target);
    const picks: number[] = [];
    while (picks.length < count) {
      const pick = items[rng.int(items.length)]!;
      if (have.has(pick)) continue;
      have.add(pick);
      picks.push(pick);
    }
    const list = Buffer.alloc((box.length + count + 1) * 4);
    box.forEach((s, i) => {
      list.writeUInt16LE(s.itemId, i * 4);
      list.writeUInt16LE(s.amount, i * 4 + 2);
    });
    picks.forEach((item, k) => {
      const amount = context.usualAmount(item);
      list.writeUInt16LE(item, (box.length + k) * 4);
      list.writeUInt16LE(amount, (box.length + k) * 4 + 2);
      lines.push({ where: questLabel(quest), text: `+ ${itemName(item)} x${amount}` });
    });
    // The same end marker: item 0, then the quest's own ID.
    now.copy(list, (box.length + count) * 4, end, end + 4);
    const offset = edits.appendToQuest(quest, list);
    edits.quest(quest).writeUInt32LE(offset, SUPPLIES_PTR);
    added += count;
  }
  return {
    title: "Supply boxes",
    notes: [
      `Every Village and Guild quest's supply box keeps what it had and gets up to ${ADDED_STACKS} more stacks of random items (any item but quest-only ones), in their usual amount.`,
      `The box moves to the end of the quest, into its sector padding. No quest grows past ${largestQuest} bytes and no box past ${largestBox} stacks (the largest on the disc), so some boxes get fewer.`,
      "No delivery quest's box gets the item it asks for. Training School, Treasure Hunting and unused quests are unchanged.",
      `${added} stacks added; ${full} boxes had no room.`,
    ],
    lines,
  };
}
