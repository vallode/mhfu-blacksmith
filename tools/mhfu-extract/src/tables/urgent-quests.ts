/**
 * Quest IDs of the Urgent Quests, the ones that unlock the next star level.
 * The disc's flag for this isn't decoded, so the list is hand-entered from
 * the Monster Hunter Wiki's "MHFU Urgent Quests" category (22 pages,
 * https://monsterhunterwiki.org/wiki/Category:MHFU_Urgent_Quests), each
 * matched to a quest by title, fee and reward. Two needed more than that:
 *  - `11107` "Secret Request: 2 Monoblos!" is the wiki's "Secret Requests:
 *    2 Monoblos" (same fee, reward, map and client).
 *  - `3009` "Hypno, Hypno!": the wiki gives 13100z, the disc 13200z. Fee and
 *    client match, and every Guild quest's reward is 12x its fee.
 */
export const URGENT_QUESTS: ReadonlySet<number> = new Set([
  // Village, low rank: ★2 The Carnivorous Leader, ★3 Shadow in the Snow,
  // ★4 The Ruler of the Snow, ★5 Absolute Power, ★6 A Troublesome Pair and
  // A State of Crisis!
  10104, 10203, 10302, 10401, 10501, 10509,
  // Village, high rank: ★7 Secret Request: Hypnocatrice, ★8 Secret Request:
  // 2 Monoblos!, ★9 Secret Request: Nargacuga!, Rise to the Summit and
  // Monster Hunter
  11005, 11107, 11201, 11225, 11226,
  // Guild Low Rank: ★4 The Ruler of the Snow, ★5 Absolute Power and
  // The Approaching Gaoren
  1104, 1201, 1218,
  // Guild High Rank: ★7 Lao-Shan Lung Draws Near!, ★8 Land of the Tremors,
  // The Approaching Gaoren and Rise to the Summit
  2120, 2201, 2225, 2226,
  // Guild G Rank: G★1 Hypno, Hypno!, G★2 Ever-Present Shadow, G★3 The
  // Floating Dragon and Absolute Zero
  3009, 3103, 3228, 3233,
]);
