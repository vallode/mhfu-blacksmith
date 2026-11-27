/**
 * Supply boxes: the `{ u16 item, u16 amount }` list each quest hands out
 * (`readSupplySlots`).
 *
 * Shuffle rewrites entries in place, moving whole stacks (item and amount)
 * between boxes within a scope, so every list keeps its length, its end
 * marker and the quest its size.
 *
 * Randomize gives each box a new number of stacks, each with a new item
 * (first found within the scope, or held by a supply box within it) and a
 * new amount. A longer list is copied, with the same end marker, to the end
 * of the quest, and `SuppliesPTR` points there (the gathering tables follow
 * the old list straight away); the old list stays, unread. The quest grows
 * into its DATA.BIN entry's sector padding, so DATA.BIN keeps its layout.
 * It never grows past the largest quest on the disc, and no box gets more
 * entries than the largest box on the disc: both are sizes the game already
 * handles.
 *
 * Guild quests list a stack once per hunter (four Maps, four First-Aid
 * Meds), so runs of identical entries move as one: a run gets one item and
 * amount, written into each of its entries.
 *
 * Supply items aren't counted as item sources: whether the game takes back
 * what a hunter didn't use isn't known, so the tier logic doesn't lean on
 * them.
 */
import type { LoadedQuest } from "whetstone/src/game/load.js";
import { largestQuest } from "../game/rebuild.js";
import {
  isNeverDrawn,
  isQuestItem,
  readSupplySlots,
  SUPPLIES_PTR,
} from "whetstone/src/game/quest-fields.js";
import { inScope, questTier, tierKey, type Scope, type Tier } from "whetstone/src/game/tiers.js";
import type { Edits } from "whetstone/src/edits.js";
import { itemName, questLabel } from "whetstone/src/names.js";
import type { Rng } from "../rng.js";
import { permuteWithinScope, scopedPool } from "./shuffle.js";
import type { Report } from "whetstone/src/report.js";

export interface SupplyRun {
  quest: LoadedQuest;
  tier: Tier;
  /** Payload offsets of the run's entries. */
  offsets: number[];
  itemId: number;
  amount: number;
}

export interface SupplyContext {
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

const NOTE_ALWAYS =
  "A delivery quest's own item (the Paw Pass Ticket) always stays, and no delivery quest's box gets the item it asks for. Training School, Treasure Hunting and unused quests are unchanged.";

export function shuffleSupplies(
  runs: readonly SupplyRun[],
  options: { scope: Scope; keepEssentials: boolean },
  context: SupplyContext,
  rng: Rng,
  edits: Edits,
): Report {
  const next = permuteWithinScope(
    runs,
    (r) => r.tier,
    options.scope,
    () => "",
    (r) => ({ itemId: r.itemId, amount: r.amount, from: r.tier }),
    rng,
  );
  keepDeliveriesOut(runs, next, options.scope, context);
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
  return {
    title: "Supply boxes",
    notes: [
      `Items and amounts move between the supply boxes of Village and Guild quests ${scopeNote(options.scope)}.`,
      "Each supply box keeps its length; stacks listed once per hunter move together.",
      options.keepEssentials
        ? "Maps, Paw Pass Tickets, ballista and cannon ammo and the other quest-only items stay where they are."
        : "Maps and the other quest-only supplies move too.",
      NOTE_ALWAYS,
      `${changed} of ${runs.length} stacks changed.`,
    ],
    lines,
  };
}

/**
 * Moves a delivery quest's own item out of its box, after a permutation put
 * it there, by swapping with another run that can take it and whose stack
 * the first run's scope reaches. The multiset of stacks stays the same.
 */
function keepDeliveriesOut(
  runs: readonly SupplyRun[],
  next: { itemId: number; amount: number; from: Tier }[],
  scope: Scope,
  context: SupplyContext,
): void {
  const allowed = (i: number, itemId: number) => context.deliveryItem(runs[i]!.quest) !== itemId;
  runs.forEach((run, i) => {
    if (allowed(i, next[i]!.itemId)) return;
    const j = runs.findIndex(
      (other, k) =>
        allowed(i, next[k]!.itemId) &&
        allowed(k, next[i]!.itemId) &&
        inScope(scope, run.tier, next[k]!.from) &&
        inScope(scope, other.tier, next[i]!.from),
    );
    if (j !== -1) [next[i], next[j]] = [next[j]!, next[i]!];
  });
}

export interface RandomizeSuppliesOptions {
  scope: Scope;
  /** How far a box's number of stacks can move, as a fraction of its own. */
  slotSpread: number;
  /** Keep quest-only items (Map, Paw Pass Ticket, ballista ammo, ...) where they are. */
  keepEssentials: boolean;
}

export interface RandomizeSuppliesContext extends SupplyContext {
  /** Each item's earliest tier, for what a scope allows. */
  tiers: ReadonlyMap<number, Tier>;
  /** Every item in the game. */
  allItems: readonly number[];
  /** The amounts quests give of an item, from rewards and supplies. */
  amounts: (itemId: number) => readonly number[];
}

interface BoxRun {
  itemId: number;
  amount: number;
  width: number;
  kept: boolean;
}

/** A box's runs of identical entries, in order. */
function boxRuns(payload: Buffer, keep: (itemId: number) => boolean): BoxRun[] {
  const out: BoxRun[] = [];
  for (const slot of readSupplySlots(payload)) {
    const last = out[out.length - 1];
    if (last && last.itemId === slot.itemId && last.amount === slot.amount) last.width++;
    else out.push({ itemId: slot.itemId, amount: slot.amount, width: 1, kept: keep(slot.itemId) });
  }
  return out;
}

export function randomizeSupplies(
  quests: readonly LoadedQuest[],
  options: RandomizeSuppliesOptions,
  context: RandomizeSuppliesContext,
  rng: Rng,
  edits: Edits,
): Report {
  // Sizes the game is known to handle: the largest quest and the largest box.
  const largest = largestQuest(quests);
  const largestBox = Math.max(...quests.map((q) => readSupplySlots(q.file.disc).length));
  const everything = context.allItems.filter((i) => !isNeverDrawn(i));
  const scoped = scopedPool(everything, context.tiers, options.scope);
  // Items the supply boxes of quests within a scope hold, which aren't item sources.
  const boxItems = new Map<string, Set<number>>();
  const heldBy = (tier: Tier): Set<number> => {
    const key = options.scope === "any" ? "any" : tierKey(tier);
    let items = boxItems.get(key);
    if (!items) {
      items = new Set();
      for (const q of quests) {
        const other = questTier(q.parsed);
        if (!other || !inScope(options.scope, tier, other)) continue;
        for (const slot of readSupplySlots(q.file.disc)) {
          if (!isNeverDrawn(slot.itemId)) items.add(slot.itemId);
        }
      }
      boxItems.set(key, items);
    }
    return items;
  };
  const pools = new Map<string, number[]>();
  const poolFor = (tier: Tier): number[] => {
    const key = options.scope === "any" ? "any" : tierKey(tier);
    let pool = pools.get(key);
    if (!pool) {
      pool = [...new Set([...scoped(tier, 1), ...heldBy(tier)])].sort((a, b) => a - b);
      pools.set(key, pool);
    }
    return pool;
  };

  const lines: { where: string; text: string }[] = [];
  let boxes = 0;
  let grown = 0;
  let capped = 0;
  for (const quest of quests) {
    const tier = questTier(quest.parsed);
    if (!tier) continue;
    const now = edits.questNow(quest);
    const target = context.deliveryItem(quest);
    const runs = boxRuns(
      now,
      (itemId) => (options.keepEssentials && isQuestItem(itemId)) || target === itemId,
    );
    const free = runs.filter((r) => !r.kept);
    if (free.length === 0) continue;

    const entries = runs.reduce((sum, r) => sum + r.width, 0);
    const keptEntries = runs.filter((r) => r.kept).reduce((sum, r) => sum + r.width, 0);
    const widths = free.map((r) => r.width);
    const widthOf = (t: number) => (t < free.length ? widths[t]! : widths[rng.int(widths.length)]!);
    const r = free.length;
    const low = Math.max(1, Math.round(r * (1 - options.slotSpread)));
    const high = Math.max(low, Math.round(r * (1 + options.slotSpread)));
    let count = low + rng.int(high - low + 1);
    const newWidths: number[] = [];
    for (let t = 0; t < count; t++) newWidths.push(widthOf(t));
    const total = () => keptEntries + newWidths.reduce((a, b) => a + b, 0);
    const at = (now.length + 3) & ~3;
    const limit = Math.min(quest.file.capacity, largest);
    const room = Math.min(largestBox, Math.floor((limit - at) / 4) - 1);
    if (total() > Math.max(entries, room)) capped++;
    while (count > 1 && total() > Math.max(entries, room)) newWidths.length = --count;
    if (total() > Math.max(entries, room)) {
      // Even one stack too many for this box: keep it as long as it was.
      newWidths.length = 0;
      widths.forEach((w) => newWidths.push(w));
      count = r;
    }

    // New stacks: an item from the pool, never twice in a box or the delivery target.
    const have = new Set(runs.filter((x) => x.kept).map((x) => x.itemId));
    if (target !== undefined) have.add(target);
    const pool = poolFor(tier).filter((i) => i !== target);
    const fresh: BoxRun[] = newWidths.map((width) => {
      let pick = pool[rng.int(pool.length)]!;
      for (let tries = 0; tries < 16 && have.has(pick); tries++) pick = pool[rng.int(pool.length)]!;
      have.add(pick);
      const amounts = context.amounts(pick);
      return {
        itemId: pick,
        amount: amounts.length > 0 ? amounts[rng.int(amounts.length)]! : 1,
        width,
        kept: false,
      };
    });

    // Kept runs stay where they are; new stacks fill the others in order, extras last.
    const out: BoxRun[] = [];
    let t = 0;
    for (const run of runs) {
      if (run.kept) out.push(run);
      else if (t < fresh.length) out.push(fresh[t++]!);
    }
    while (t < fresh.length) out.push(fresh[t++]!);
    const list = out.flatMap((run) => Array.from({ length: run.width }, () => run));

    const ptr = now.readUInt32LE(SUPPLIES_PTR);
    const end = ptr + entries * 4;
    const marker = Buffer.from(now.subarray(end, end + 4));
    let payload = edits.quest(quest);
    let offset = ptr;
    if (list.length > entries) {
      const block = Buffer.alloc((list.length + 1) * 4);
      offset = edits.appendToQuest(quest, block);
      payload = edits.quest(quest);
      payload.writeUInt32LE(offset, SUPPLIES_PTR);
      grown++;
    }
    list.forEach((run, i) => {
      payload.writeUInt16LE(run.itemId, offset + i * 4);
      payload.writeUInt16LE(run.amount, offset + i * 4 + 2);
    });
    marker.copy(payload, offset + list.length * 4);

    boxes++;
    const where = questLabel(quest);
    if (list.length !== entries) {
      lines.push({ where, text: `box: ${entries} entries -> ${list.length}` });
    }
    fresh.forEach((run, k) => {
      const was = free[k];
      const stacks = run.width > 1 ? `${run.width} stacks of ` : "";
      lines.push({
        where,
        text: `${stacks}${itemName(run.itemId)} x${run.amount}${was ? ` (was ${itemName(was.itemId)} x${was.amount})` : ""}`,
      });
    });
  }
  return {
    title: "Supply boxes",
    notes: [
      `Each Village and Guild quest's supply box gets a new number of stacks (up to ±${Math.round(options.slotSpread * 100)}%, never more entries than the ${largestBox} the largest box on the disc has or the quest's sectors hold), and every stack a new item first found ${scopeNote(options.scope)} or held by a supply box there, in an amount quests give of it.`,
      "Stacks listed once per hunter keep their width; the new stacks take a width the box already had.",
      options.keepEssentials
        ? "Maps, Paw Pass Tickets, ballista and cannon ammo and the other quest-only items stay where they are, and new stacks are never quest-only items."
        : "Maps and the other quest-only supplies are rolled like the rest (new stacks are never quest-only items).",
      NOTE_ALWAYS,
      `${boxes} boxes rolled; ${grown} moved to the end of their quest for more stacks; ${capped} wanted more room than they had.`,
    ],
    lines,
  };
}
