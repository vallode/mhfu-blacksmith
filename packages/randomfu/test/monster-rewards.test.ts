import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOvl } from "mhfu-extract/src/container/ovl.js";
import { monsterKey } from "../src/game/tiers.js";
import { collectMonsterRewardSlots, collectRewardLists } from "../src/shuffles/monster-rewards.js";
import { buildGameSub } from "./fixtures.js";

// The EU disc's lists at the Fatalis entries of CODE_CARVES: 1007 in high
// rank (and the unranked, treasure and misc slots), 1055 in G.
const FATALIS_HIGH = [
  { chance: 42, itemId: 778 },
  { chance: 50, itemId: 780 },
  { chance: 8, itemId: 776 },
];
const FATALIS_G = [
  { chance: 38, itemId: 779 },
  { chance: 44, itemId: 781 },
  { chance: 10, itemId: 780 },
  { chance: 8, itemId: 777 },
];

function lists() {
  const sub = buildGameSub(
    [{ emId: 1, kind: 0, rank: 1, entries: [{ chance: 100, itemId: 520 }] }],
    [],
    [
      { pointer: 1007, entries: FATALIS_HIGH },
      { pointer: 1055, entries: FATALIS_G },
    ],
  );
  return collectRewardLists(parseOvl(sub));
}

test("collectRewardLists adds the carve lists code picks, with the rank slots that pick them", () => {
  const all = lists();
  const high = all.find((l) => l.entries[0]!.itemId === 778)!;
  assert.deepEqual(high.entries, FATALIS_HIGH);
  assert.deepEqual(
    high.refs.map((r) => `${r.emId} ${r.source} ${r.rank}`),
    ["2 body unranked", "2 body high", "2 body treasure", "2 body misc"],
  );
  const g = all.find((l) => l.entries[0]!.itemId === 779)!;
  assert.deepEqual(
    g.refs.map((r) => `${r.emId} ${r.source} ${r.rank}`),
    ["2 body g"],
  );
  // The code's other lists (empty in this overlay) are left out.
  assert.equal(all.length, 3);
});

test("code-picked lists read in one band shuffle like the rest; lists read in several don't", () => {
  const stars = new Map([
    [monsterKey(2, "high"), 6],
    [monsterKey(2, "g"), 3],
  ]);
  const slots = collectMonsterRewardSlots(lists(), stars);
  assert.deepEqual(
    slots.map((s) => [s.itemId, s.tier.band, s.tier.stars]),
    FATALIS_G.map((e) => [e.itemId, "g", 3]),
  );
});
