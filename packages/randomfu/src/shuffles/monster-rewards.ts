/**
 * Monster carves, capture rewards and break rewards, from `game_sub.ovl`
 * (laid out in mhfu-extract's `monsters/rewards.ts`). Monsters point at
 * shared lists through index and pointer tables; this collects each list
 * once, with every monster and rank slot that uses it.
 *
 * Item IDs move between lists of the same tier. A list's tier is its rank
 * slot and the lowest star level at which any monster using it appears in
 * a quest. Chances and amounts stay with the slot, and no list changes
 * length, so the overlay keeps its size.
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
  REWARD_RANKS,
  locateRewardTables,
  readRewardList,
  type RewardEntry,
  type RewardRank,
  type TablePair,
} from "mhfu-extract/src/monsters/rewards.js";
import { monsterKey, rewardRankBand, tierKey, tierLabel, type Tier } from "../game/tiers.js";
import type { LoadedOverlay } from "../game/load.js";
import type { Edits } from "../edits.js";
import type { Rng } from "../rng.js";
import { itemName, monsterName } from "../names.js";
import { permuteWithinGroups, type ShuffleReport } from "./shuffle.js";

const NONE = 0xffff;

export interface RewardRef {
  emId: number;
  /** "body", "tail", "shiny", "capture" or "break N". */
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

/** Every reward list reachable from the carve and cap/break index tables. */
export function collectRewardLists(ovl: OvlFile): RewardList[] {
  const location = locateRewardTables(ovl);
  if (!location) throw new Error("game_sub.ovl: carve and cap/break tables not found");
  const lists = new Map<string, RewardList>();
  const r = ovl.reader;

  const add = (
    table: TablePair,
    pointerCount: number,
    indexOffset: number,
    withAmount: boolean,
    ref: RewardRef,
  ): void => {
    const index = r.u16(indexOffset);
    if (index === NONE || index >= pointerCount) return;
    const vaddr = r.u32(table.pointers + index * 4);
    const entries = readRewardList(ovl, vaddr, withAmount);
    if (!entries) return;
    const offset = ovl.vaddrToOffset(vaddr);
    const stride = withAmount ? 6 : 4;
    const key = `${stride}:${offset}`;
    const list = lists.get(key);
    if (list) list.refs.push(ref);
    else lists.set(key, { offset, stride, entries, refs: [ref] });
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

function listLabel(list: RewardList): string {
  const users = [...new Set(list.refs.map((ref) => `${monsterName(ref.emId)} ${ref.source}`))];
  return users.join(", ");
}

export function shuffleMonsterRewards(
  slots: readonly MonsterRewardSlot[],
  rng: Rng,
  edits: Edits,
  gameSub: LoadedOverlay,
): { report: ShuffleReport; after: { itemId: number; tier: Tier }[] } {
  const next = permuteWithinGroups(
    slots,
    (s) => tierKey(s.tier),
    (s) => s.itemId,
    rng,
  );
  const buf = edits.overlay(gameSub);
  const lines = slots.map((slot, i) => {
    const itemId = next[i]!;
    buf.writeUInt16LE(itemId, slot.offset + 2);
    const amount = slot.amount === undefined ? "" : ` x${slot.amount}`;
    return {
      where: `${listLabel(slot.list)} (${tierLabel(slot.tier)})`,
      text: `${slot.chance}% ${itemName(itemId)}${amount} (was ${itemName(slot.itemId)})`,
    };
  });
  return {
    report: {
      title: "Monster carves, captures and breaks",
      notes: [
        "Items move between lists of the same rank and star level (the earliest quest the monster is in); chances and amounts stay with each slot.",
        "Lists shared across ranks, treasure and training lists, and lists of monsters no quest uses at that rank are unchanged.",
      ],
      lines,
    },
    after: slots.map((s, i) => ({ itemId: next[i]!, tier: s.tier })),
  };
}
