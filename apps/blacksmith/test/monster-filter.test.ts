import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cycleMonsterFilter,
  filterCount,
  filterCrown,
  matchesMonster,
  monsterFilters,
} from "../src/lib/monster-filter";

const both = { capturable: true, crowns: true };
const plain = { capturable: false, crowns: false };
const crowns = { mini: 80, silver: 115, gold: 120 };
const rec = (largest: number, smallest: number) => ({ kills: 1, captures: 0, largest, smallest });

test("Captured and the crown filters are only on offer where the type has them", () => {
  assert.deepEqual(monsterFilters(both), ["all", "captured", "hunted", "gold-crown", "mini-crown"]);
  assert.deepEqual(monsterFilters(plain), ["all", "hunted"]);
  assert.deepEqual(monsterFilters({ capturable: false, crowns: true }), [
    "all",
    "hunted",
    "gold-crown",
    "mini-crown",
  ]);
});

test("the crown filters take a size record that earns the crown", () => {
  const m = { capturable: false, crowns };
  assert.equal(matchesMonster("gold-crown", m, rec(120, 100)), true);
  assert.equal(matchesMonster("gold-crown", m, rec(119, 100)), false);
  assert.equal(matchesMonster("mini-crown", m, rec(100, 80)), true);
  assert.equal(matchesMonster("mini-crown", m, rec(100, 81)), false);
  // A size of 0 is no record, not a tiny monster.
  assert.equal(matchesMonster("mini-crown", m, rec(0, 0)), false);
  assert.equal(matchesMonster("gold-crown", { capturable: false }, rec(200, 50)), false);
  assert.equal(matchesMonster("gold-crown", m, null), false);
  assert.equal(filterCount("gold-crown", rec(120, 100)), null);
  assert.equal(filterCrown("mini-crown"), "mini");
  assert.equal(filterCrown("hunted"), null);
});

test("the selector steps through the filters on offer, wrapping", () => {
  assert.equal(cycleMonsterFilter("all", 1, both), "captured");
  assert.equal(cycleMonsterFilter("mini-crown", 1, both), "all");
  assert.equal(cycleMonsterFilter("all", -1, both), "mini-crown");
  assert.equal(cycleMonsterFilter("all", 1, plain), "hunted");
  // Captured left over from another type starts from All.
  assert.equal(cycleMonsterFilter("captured", 1, plain), "hunted");
});

test("All takes every monster, with or without a record", () => {
  assert.equal(matchesMonster("all", { capturable: false }, null), true);
  assert.equal(matchesMonster("all", { capturable: true }, rec(0, 0)), true);
});

test("Captured takes capturable monsters with a capture", () => {
  assert.equal(
    matchesMonster(
      "captured",
      { capturable: true },
      { kills: 0, captures: 2, largest: 0, smallest: 0 },
    ),
    true,
  );
  assert.equal(
    matchesMonster(
      "captured",
      { capturable: true },
      { kills: 5, captures: 0, largest: 0, smallest: 0 },
    ),
    false,
  );
  assert.equal(
    matchesMonster(
      "captured",
      { capturable: false },
      { kills: 0, captures: 1, largest: 0, smallest: 0 },
    ),
    false,
  );
  assert.equal(matchesMonster("captured", { capturable: true }, null), false);
});

test("Hunted takes monsters with a kill, capturable or not", () => {
  assert.equal(
    matchesMonster(
      "hunted",
      { capturable: false },
      { kills: 4, captures: 0, largest: 0, smallest: 0 },
    ),
    true,
  );
  assert.equal(
    matchesMonster(
      "hunted",
      { capturable: true },
      { kills: 0, captures: 2, largest: 0, smallest: 0 },
    ),
    false,
  );
  assert.equal(matchesMonster("hunted", { capturable: false }, null), false);
});

test("a row's count follows the filter", () => {
  const record = { kills: 4, captures: 1 };
  assert.equal(filterCount("all", record), null);
  assert.equal(filterCount("captured", record), 1);
  assert.equal(filterCount("hunted", record), 4);
  assert.equal(filterCount("hunted", null), null);
});
