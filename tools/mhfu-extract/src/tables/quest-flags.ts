/**
 * Where each quest's "cleared" flag sits in a hunter's save (see "Save quest
 * flags" in the README).
 *
 * The flags are a 512-bit field (64 bytes) at offset 0x3f88 of each hunter's
 * block in the decrypted MHP2NDG.BIN, between the item pouch and the play
 * time. Bit `n` is byte `n >> 3`, mask `1 << (n & 7)`. The EU "All quests
 * clear" cheat only sets the first 448; the Training School is after them.
 */

/**
 * Bits pinned by quests cleared on purpose in an unedited save, which the
 * `quest-flags` scan uses to find and check the game's table:
 *  - `10001` Mountain Herb Picking: the only quest Vallode had cleared.
 *  - `1001` Gathering - Snowy Mountains (Guild low rank): cleared next, the
 *    only bit that changed.
 *  - `1004`, `1005`, `1020`: Czaph's three bits once 1001 placed the Guild
 *    block, matching the Guild Card's low rank clear count of 3.
 */
export const QUEST_FLAG_ANCHORS: Readonly<Record<number, number>> = {
  1001: 19,
  1004: 22,
  1005: 23,
  1020: 38,
  10001: 279,
};

/**
 * A run of consecutive quest IDs in the game's table. `slots` IDs, from
 * `firstId`, take one bit each; the first `count` of them are quests on the
 * disc and the rest are reserved IDs no quest uses.
 */
export interface QuestFlagRun {
  firstId: number;
  count: number;
  slots: number;
}

/**
 * The game's table, in bit order: one u16 quest ID per bit at EBOOT
 * 0x19a65c on the EU disc (ULES01213), read by `quest-flags`. Each star level
 * has a fixed number of slots, so the quests on the disc are followed by
 * reserved IDs (2014-2015, 2128-2130, …). The table's 504 entries end with
 * the value 60000.
 *
 * Saves agree with every bit: the anchors above, and a heavily played
 * hunter whose cleared bits are runs exactly as long as each star level,
 * with every Urgent Quest set.
 */
export const QUEST_FLAG_RUNS: readonly QuestFlagRun[] = [
  { firstId: 1, count: 10, slots: 10 },
  { firstId: 101, count: 9, slots: 9 },
  // Guild
  { firstId: 1001, count: 22, slots: 22 },
  { firstId: 1101, count: 26, slots: 26 },
  { firstId: 1201, count: 20, slots: 20 },
  { firstId: 2001, count: 13, slots: 15 },
  { firstId: 2101, count: 27, slots: 30 },
  { firstId: 2201, count: 36, slots: 40 },
  { firstId: 3001, count: 25, slots: 30 },
  { firstId: 3101, count: 27, slots: 30 },
  { firstId: 3201, count: 33, slots: 40 },
  // Treasure Hunting
  { firstId: 4001, count: 7, slots: 7 },
  // Village
  { firstId: 10001, count: 5, slots: 5 },
  { firstId: 10101, count: 18, slots: 18 },
  { firstId: 10201, count: 18, slots: 18 },
  { firstId: 10301, count: 19, slots: 20 },
  { firstId: 10401, count: 18, slots: 20 },
  { firstId: 10501, count: 11, slots: 15 },
  { firstId: 11001, count: 14, slots: 20 },
  { firstId: 11101, count: 19, slots: 25 },
  { firstId: 11201, count: 26, slots: 30 },
  // Training School: Basic Training, Mastery, Exercises
  { firstId: 20001, count: 18, slots: 18 },
  { firstId: 21001, count: 23, slots: 30 },
  { firstId: 22001, count: 6, slots: 6 },
];

/** Bits in the save's field; the table fills the first 504. */
export const QUEST_FLAG_BITS = 512;

/** Each run's first bit, in table order. */
export function runFirstBits(runs: readonly QuestFlagRun[] = QUEST_FLAG_RUNS): number[] {
  const bits: number[] = [];
  let bit = 0;
  for (const run of runs) {
    bits.push(bit);
    bit += run.slots;
  }
  return bits;
}

/** Quest ID -> bit for every quest on the disc (reserved IDs left out). */
export function questFlagBits(
  runs: readonly QuestFlagRun[] = QUEST_FLAG_RUNS,
): Map<number, number> {
  const map = new Map<number, number>();
  const firstBits = runFirstBits(runs);
  runs.forEach((run, i) => {
    for (let k = 0; k < run.count; k++) map.set(run.firstId + k, firstBits[i]! + k);
  });
  return map;
}
