/**
 * Monster carves, capture rewards and break rewards, from `game_sub.ovl`
 * (laid out in mhfu-extract's `monsters/rewards.ts`). Monsters point at
 * shared lists through index and pointer tables, and code picks a few more
 * (`CODE_CARVES`: the elder dragons' carves, live carves, Congalala's
 * tail-stagger drops); this collects each list once, with every monster and
 * rank slot that uses it.
 *
 * A list's tier is its rank slot and the lowest star level at which any
 * monster using it appears in a quest. No list changes length, so the
 * overlay keeps its size.
 *
 * Shuffle moves whole slots (item, chance and amount) between lists within
 * a scope; a list's chances are then scaled back to its own total. Randomize
 * rolls a new item (first found within the scope), chance and amount for
 * every slot.
 */
import type { OvlFile } from "mhfu-extract/src/container/ovl.js";
import {
  CAP_BREAK_ENTRY_SIZE,
  CAP_BREAK_POINTER_COUNT,
  CAPTURE_TYPE,
  CARVE_INDEX_COUNT,
  CARVE_INDEX_SIZE,
  CARVE_KINDS,
  CARVE_POINTER_COUNT,
  CODE_CARVES,
  REWARD_RANKS,
  locateRewardTables,
  readRewardList,
  type RewardEntry,
  type RewardRank,
  type TablePair,
} from "mhfu-extract/src/monsters/rewards.js";
import { isQuestItem } from "../game/quest-fields.js";
import { monsterKey, rewardRankBand, tierLabel, type Scope, type Tier } from "../game/tiers.js";
import type { LoadedOverlay } from "../game/load.js";
import type { Edits } from "../edits.js";
import type { Rng } from "../rng.js";
import { itemName, type MonsterNames } from "../names.js";
import {
  permuteWithinScope,
  reconcile,
  rollChances,
  scopedPool,
  type ChanceRange,
  type ShuffleReport,
} from "./shuffle.js";

const NONE = 0xffff;

export interface RewardRef {
  emId: number;
  /** "body", "tail", "shiny", "capture", "break N", or a code-picked carve's (`CODE_CARVES`). */
  source: string;
  rank: RewardRank;
}

export interface RewardList {
  /** File offset of the list in the overlay. */
  offset: number;
  /** 4 for carves (chance, item), 6 for capture and break lists (chance, item, amount). */
  stride: 4 | 6;
  entries: RewardEntry[];
  refs: RewardRef[];
}

/**
 * Every reward list reachable from the carve and cap/break index tables,
 * and the carve lists code picks (`CODE_CARVES`), each with every rank slot
 * that reads it.
 */
export function collectRewardLists(ovl: OvlFile): RewardList[] {
  const location = locateRewardTables(ovl);
  if (!location) throw new Error("game_sub.ovl: carve and cap/break tables not found");
  const lists = new Map<string, RewardList>();
  const r = ovl.reader;

  const addPointer = (
    table: TablePair,
    pointerCount: number,
    pointer: number,
    withAmount: boolean,
    ref: RewardRef,
    skipEmpty = false,
  ): void => {
    if (pointer >= pointerCount) return;
    const vaddr = r.u32(table.pointers + pointer * 4);
    const entries = readRewardList(ovl, vaddr, withAmount);
    if (!entries || (skipEmpty && entries.length === 0)) return;
    const offset = ovl.vaddrToOffset(vaddr);
    const stride = withAmount ? 6 : 4;
    const key = `${stride}:${offset}`;
    const list = lists.get(key);
    if (list) list.refs.push(ref);
    else lists.set(key, { offset, stride, entries, refs: [ref] });
  };
  const add = (
    table: TablePair,
    pointerCount: number,
    indexOffset: number,
    withAmount: boolean,
    ref: RewardRef,
  ): void => {
    const index = r.u16(indexOffset);
    if (index !== NONE) addPointer(table, pointerCount, index, withAmount, ref);
  };

  for (let i = 0; i < CARVE_INDEX_COUNT; i++) {
    const base = location.carves.index + i * CARVE_INDEX_SIZE;
    CARVE_KINDS.forEach((kind, k) => {
      REWARD_RANKS.forEach((rank, ri) => {
        add(location.carves, CARVE_POINTER_COUNT, base + k * 14 + ri * 2, false, {
          emId: i + 1,
          source: kind,
          rank,
        });
      });
    });
  }

  for (let at = location.capBreak.index; at + CAP_BREAK_ENTRY_SIZE <= r.length;) {
    const emId = r.u8(at);
    if (emId === 0xff) break;
    const type = r.u8(at + 1);
    const source = type === CAPTURE_TYPE ? "capture" : `break ${type}`;
    for (let ri = 0; ri < 6; ri++) {
      add(location.capBreak, CAP_BREAK_POINTER_COUNT, at + 2 + ri * 2, true, {
        emId,
        source,
        rank: REWARD_RANKS[ri]!,
      });
    }
    at += CAP_BREAK_ENTRY_SIZE;
  }

  for (const { emId, source, pointers } of CODE_CARVES) {
    pointers.forEach((pointer, ri) => {
      // A disc without these lists (a test fixture) leaves them empty.
      addPointer(
        location.carves,
        CARVE_POINTER_COUNT,
        pointer,
        false,
        { emId, source, rank: REWARD_RANKS[ri]! },
        true,
      );
    });
  }

  return [...lists.values()].sort((a, b) => a.offset - b.offset);
}

export interface MonsterRewardSlot {
  list: RewardList;
  tier: Tier;
  /** File offset of the entry in the overlay. */
  offset: number;
  chance: number;
  itemId: number;
  amount: number | undefined;
}

/**
 * The slots to shuffle: entries of lists used in exactly one band, by a
 * monster that appears in a quest the player can take at that band.
 * `stars` is `monsterStars()`.
 */
export function collectMonsterRewardSlots(
  lists: readonly RewardList[],
  stars: ReadonlyMap<string, number>,
): MonsterRewardSlot[] {
  const slots: MonsterRewardSlot[] = [];
  for (const list of lists) {
    const bands = new Set(list.refs.map((ref) => rewardRankBand(ref.rank)));
    if (bands.size !== 1) continue;
    const [band] = bands;
    if (!band) continue;
    const appears = list.refs
      .map((ref) => stars.get(monsterKey(ref.emId, band)))
      .filter((s): s is number => s !== undefined);
    if (appears.length === 0) continue;
    const tier: Tier = { band, stars: Math.min(...appears) };
    list.entries.forEach((entry, i) => {
      if (entry.itemId === 0) return;
      slots.push({
        list,
        tier,
        offset: list.offset + i * list.stride,
        chance: entry.chance,
        itemId: entry.itemId,
        amount: entry.amount,
      });
    });
  }
  return slots;
}

function listLabel(list: RewardList, monsterName: MonsterNames): string {
  const users = [...new Set(list.refs.map((ref) => `${monsterName(ref.emId)} ${ref.source}`))];
  return users.join(", ");
}

/** Writes one slot of a list in the overlay. */
function writeSlot(
  buf: Buffer,
  slot: MonsterRewardSlot,
  value: { chance: number; itemId: number; amount: number | undefined },
): void {
  buf.writeUInt16LE(value.chance, slot.offset);
  buf.writeUInt16LE(value.itemId, slot.offset + 2);
  if (slot.list.stride === 6) buf.writeUInt16LE(value.amount ?? 1, slot.offset + 4);
}

function slotText(
  value: { chance: number; itemId: number; amount: number | undefined },
  was: MonsterRewardSlot,
): string {
  const amount = (a: number | undefined) => (a === undefined ? "" : ` x${a}`);
  return `${value.chance}% ${itemName(value.itemId)}${amount(value.amount)} (was ${was.chance}% ${itemName(was.itemId)}${amount(was.amount)})`;
}

/** The slots grouped by list, in order. */
function byList(slots: readonly MonsterRewardSlot[]): Map<RewardList, MonsterRewardSlot[]> {
  const out = new Map<RewardList, MonsterRewardSlot[]>();
  for (const slot of slots) {
    const list = out.get(slot.list);
    if (list) list.push(slot);
    else out.set(slot.list, [slot]);
  }
  return out;
}

const NOTE_UNCHANGED =
  "Lists shared across ranks, treasure and training lists, and lists of monsters no quest uses at that rank are unchanged.";

export function shuffleMonsterRewards(
  slots: readonly MonsterRewardSlot[],
  scope: Scope,
  rng: Rng,
  edits: Edits,
  gameSub: LoadedOverlay,
  /** Names monsters in the report (`names.ts` `monsterNames`). */
  monsterName: MonsterNames,
): { report: ShuffleReport; after: { itemId: number; tier: Tier }[] } {
  // Carves have no amount, so they only trade with carves.
  const next = permuteWithinScope(
    slots,
    (s) => s.tier,
    scope,
    (s) => String(s.list.stride),
    (s) => ({ itemId: s.itemId, chance: s.chance, amount: s.amount }),
    rng,
  );
  const index = new Map(slots.map((s, i) => [s, i]));
  const buf = edits.overlay(gameSub);
  const lines: { where: string; text: string }[] = [];
  for (const [list, own] of byList(slots)) {
    // Slots from other lists bring their own chances: scale them back to this list's total.
    const total = own.reduce((sum, s) => sum + s.chance, 0);
    const moved = own.map((s) => next[index.get(s)!]!);
    const chances =
      total >= moved.length
        ? reconcile(
            moved.map((m) => m.chance),
            total,
          )
        : moved.map((m) => m.chance);
    own.forEach((slot, k) => {
      const value = { ...moved[k]!, chance: chances[k]! };
      writeSlot(buf, slot, value);
      lines.push({
        where: `${listLabel(list, monsterName)} (${tierLabel(slot.tier)})`,
        text: slotText(value, slot),
      });
    });
  }
  return {
    report: {
      title: "Monster carves, captures and breaks",
      notes: [
        `Reward slots (item, chance and amount) move between lists ${scopeNote(scope)}. No list changes length.`,
        "A list's chances always add up to what they did, so slots that came from another list are scaled to fit.",
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
      return "of the same rank and star level (the earliest quest the monster is in)";
    case "rank":
      return "of the same rank";
    case "adjacent":
      return "of the same or the next rank";
    case "any":
      return "of any rank";
  }
}

export interface RandomizeMonsterRewardsOptions {
  scope: Scope;
  chances: ChanceRange;
}

export interface MonsterRewardContext {
  /** Each item's earliest tier, for what a scope allows. */
  tiers: ReadonlyMap<number, Tier>;
  /** Every item in the game. */
  allItems: readonly number[];
  /** The amounts quests give of an item, from rewards and supplies. */
  amounts: (itemId: number) => readonly number[];
}

export function randomizeMonsterRewards(
  slots: readonly MonsterRewardSlot[],
  options: RandomizeMonsterRewardsOptions,
  context: MonsterRewardContext,
  rng: Rng,
  edits: Edits,
  gameSub: LoadedOverlay,
  /** Names monsters in the report (`names.ts` `monsterNames`). */
  monsterName: MonsterNames,
): { report: ShuffleReport; after: { itemId: number; tier: Tier }[] } {
  const poolFor = scopedPool(
    context.allItems.filter((i) => !isQuestItem(i)),
    context.tiers,
    options.scope,
  );
  const buf = edits.overlay(gameSub);
  const lines: { where: string; text: string }[] = [];
  const after: { itemId: number; tier: Tier }[] = [];
  for (const [list, own] of byList(slots)) {
    const tier = own[0]!.tier;
    const pool = poolFor(tier, own.length);
    const items: number[] = [];
    while (items.length < own.length) {
      const pick = pool[rng.int(pool.length)]!;
      if (!items.includes(pick)) items.push(pick);
    }
    const chances = rollChances(
      own.map((s) => s.chance),
      own.length,
      options.chances,
      rng,
    );
    own.forEach((slot, k) => {
      const itemId = items[k]!;
      const amounts = context.amounts(itemId);
      const amount =
        slot.amount === undefined
          ? undefined
          : amounts.length > 0
            ? amounts[rng.int(amounts.length)]!
            : slot.amount;
      const value = { chance: chances[k]!, itemId, amount };
      writeSlot(buf, slot, value);
      lines.push({
        where: `${listLabel(list, monsterName)} (${tierLabel(slot.tier)})`,
        text: slotText(value, slot),
      });
      after.push({ itemId, tier: slot.tier });
    });
  }
  return {
    report: {
      title: "Monster carves, captures and breaks",
      notes: [
        `Every slot gets a new item first found ${scopeFound(options.scope)}, a new chance (${options.chances === "rarity" ? "the list's own, dealt out again" : options.chances === "reasonable" ? "the list's own, scaled by 0.5 to 2" : "rolled from 1 to 100"}) and, for captures and breaks, a new amount. No list changes length, and its chances add up to what they did.`,
        NOTE_UNCHANGED,
      ],
      lines,
    },
    after,
  };
}

function scopeFound(scope: Scope): string {
  switch (scope) {
    case "star":
      return "at the list's rank and star level";
    case "rank":
      return "at the list's rank";
    case "adjacent":
      return "at the list's rank or the next";
    case "any":
      return "anywhere";
  }
}
