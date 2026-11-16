import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cycleMonsterFilter,
  filterCount,
  matchesMonster,
  monsterFilters,
} from "../src/lib/monster-filter";

test("Captured is only on offer for a type with a monster to capture", () => {
  assert.deepEqual(monsterFilters(true), ["all", "captured", "hunted"]);
  assert.deepEqual(monsterFilters(false), ["all", "hunted"]);
});

test("the selector steps through the filters on offer, wrapping", () => {
  assert.equal(cycleMonsterFilter("all", 1, true), "captured");
  assert.equal(cycleMonsterFilter("hunted", 1, true), "all");
  assert.equal(cycleMonsterFilter("all", -1, true), "hunted");
  assert.equal(cycleMonsterFilter("all", 1, false), "hunted");
  // Captured left over from another type starts from All.
  assert.equal(cycleMonsterFilter("captured", 1, false), "hunted");
});

test("All takes every monster, with or without a record", () => {
  assert.equal(matchesMonster("all", false, null), true);
  assert.equal(matchesMonster("all", true, { kills: 0, captures: 3 }), true);
});

test("Captured takes capturable monsters with a capture", () => {
  assert.equal(matchesMonster("captured", true, { kills: 0, captures: 2 }), true);
  assert.equal(matchesMonster("captured", true, { kills: 5, captures: 0 }), false);
  assert.equal(matchesMonster("captured", false, { kills: 0, captures: 1 }), false);
  assert.equal(matchesMonster("captured", true, null), false);
});

test("Hunted takes monsters with a kill, capturable or not", () => {
  assert.equal(matchesMonster("hunted", false, { kills: 4, captures: 0 }), true);
  assert.equal(matchesMonster("hunted", true, { kills: 0, captures: 2 }), false);
  assert.equal(matchesMonster("hunted", false, null), false);
});

test("a row's count follows the filter", () => {
  const record = { kills: 4, captures: 1 };
  assert.equal(filterCount("all", record), null);
  assert.equal(filterCount("captured", record), 1);
  assert.equal(filterCount("hunted", record), 4);
  assert.equal(filterCount("hunted", null), null);
});
