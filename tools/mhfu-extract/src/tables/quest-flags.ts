/**
 * Where each quest's "cleared" flag sits in a hunter's save, as far as it is
 * known from real saves (see `quest-flags` in the README). The `quest-flags`
 * command searches the disc for the game's own table and checks it against
 * these.
 *
 * The flags are a 448-bit field (14 little-endian u32 words) at offset 0x3f88
 * of each hunter's block in the decrypted MHP2NDG.BIN, right after the item
 * pouch. Bit `n` is byte `n >> 3`, mask `1 << (n & 7)`.
 */

/**
 * Bits pinned by quests cleared on purpose in an unedited save:
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

/** A run of consecutive quest IDs whose flags are consecutive bits. */
export interface QuestFlagGroup {
  firstId: number;
  count: number;
  firstBit: number;
}

/**
 * The full layout as read from saves. Only the anchors above are certain.
 * The rest is fitted to a heavily played (and possibly edited) hunter, whose
 * cleared bits form runs exactly as long as each star level, with unused
 * bits between them; every Urgent Quest lands on a set bit. Bits 0-18 are
 * assumed to be the disc's quests 1-10 and 101-109 in ID order.
 */
export const SAVE_DERIVED_GROUPS: readonly QuestFlagGroup[] = [
  { firstId: 1, count: 10, firstBit: 0 },
  { firstId: 101, count: 9, firstBit: 10 },
  // Guild: low rank and high rank ★6 are contiguous.
  { firstId: 1001, count: 22, firstBit: 19 },
  { firstId: 1101, count: 26, firstBit: 41 },
  { firstId: 1201, count: 20, firstBit: 67 },
  { firstId: 2001, count: 13, firstBit: 87 },
  { firstId: 2101, count: 27, firstBit: 102 },
  { firstId: 2201, count: 36, firstBit: 132 },
  { firstId: 3001, count: 25, firstBit: 172 },
  { firstId: 3101, count: 27, firstBit: 202 },
  { firstId: 3201, count: 33, firstBit: 232 },
  // Village: ★1-★3 are contiguous.
  { firstId: 10001, count: 5, firstBit: 279 },
  { firstId: 10101, count: 18, firstBit: 284 },
  { firstId: 10201, count: 18, firstBit: 302 },
  { firstId: 10301, count: 19, firstBit: 320 },
  { firstId: 10401, count: 18, firstBit: 340 },
  { firstId: 10501, count: 11, firstBit: 360 },
  { firstId: 11001, count: 14, firstBit: 375 },
  { firstId: 11101, count: 19, firstBit: 395 },
  { firstId: 11201, count: 26, firstBit: 420 },
];

export const QUEST_FLAG_BITS = 448;

/** Quest ID -> bit for every quest in `groups`. */
export function groupsToBitMap(groups: readonly QuestFlagGroup[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const { firstId, count, firstBit } of groups) {
    for (let k = 0; k < count; k++) map.set(firstId + k, firstBit + k);
  }
  return map;
}
