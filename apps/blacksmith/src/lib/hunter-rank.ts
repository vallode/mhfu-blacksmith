/**
 * Hunter Rank isn't stored in the save: the game works it out from the
 * urgent quests cleared (EU EBOOT 0x0884fcb0 returns 0-8 and its callers add
 * 1). HR is 2 + the index of the last quest here that is cleared, or 1 if
 * none is. The save worker (public/javascript/save-worker.js,
 * HR_URGENT_QUESTS) keeps the same list.
 */
export const HR_URGENT_QUESTS = [1104, 1201, 1218, 2120, 2201, 3009, 3103, 3228];

/** The hunter's HR, 1-9, from the IDs of the quests they have cleared. */
export function hunterRankFrom(clearedQuests: Iterable<number>): number {
  const cleared = new Set(clearedQuests);
  for (let i = HR_URGENT_QUESTS.length - 1; i >= 0; i--) {
    if (cleared.has(HR_URGENT_QUESTS[i])) return i + 2;
  }
  return 1;
}
