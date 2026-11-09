/**
 * Quest ID -> the quest that must be cleared before it appears on its board.
 * The disc doesn't hold this (no header field or decoded script names
 * another quest), so it is hand-entered from the Monster Hunter Wiki's quest
 * pages, matched on fee, reward, locale and client:
 *  - `108` "Eliminate the Rathalos!": "Complete Shadow in the Snow"
 *    https://monsterhunterwiki.org/wiki/Eliminate_the_Rathalos!_(Low_Rank)_(MHFU_Quest)
 *  - `109` "Attack of the Rathian": "Complete Shadow in the Snow"
 *    https://monsterhunterwiki.org/wiki/Attack_of_the_Rathian_(Low_Rank)_(MHFU_Quest)
 *
 * Both are Guild ★2 quests; `10203` is the Village's ★3 "Shadow in the Snow"
 * (Khezu), the only quest of that title on the disc. Quests without an entry
 * have no prerequisite or one we haven't found; `101` and `102` are listed
 * with "Requirements: None".
 */
export const QUEST_PREREQUISITES: Readonly<Record<number, number>> = {
  108: 10203,
  109: 10203,
};
