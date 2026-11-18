import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cycleDecorationFilter,
  decorationFilters,
  matchesDecoration,
  skillName,
} from "../src/lib/decoration-filter";
import type { RowStatus } from "../src/lib/tree-filter";

const fierce = { name: "Fierce Jewel", slots: 2, skills: ["Attack +3", "Defense -1"] };
const status = (owned: boolean, craft: RowStatus["craft"] = null): RowStatus => ({
  href: "/decorations/fierce-jewel/",
  external: false,
  owned,
  craft,
});

test("the hunter filters are only on offer with a hunter loaded", () => {
  assert.deepEqual(
    decorationFilters(false).map((f) => f.label),
    ["All", "1 slot", "2 slots", "3 slots"],
  );
  assert.equal(decorationFilters(true).length, 8);
});

test("the selector steps through the filters on offer, wrapping", () => {
  assert.equal(cycleDecorationFilter("all", 1, false), "slots-1");
  assert.equal(cycleDecorationFilter("slots-3", 1, false), "all");
  assert.equal(cycleDecorationFilter("slots-3", 1, true), "owned");
  assert.equal(cycleDecorationFilter("all", -1, true), "within-one");
  // A hunter filter left over after the save is cleared starts from All.
  assert.equal(cycleDecorationFilter("owned", 1, false), "slots-1");
});

test("skillName drops the points", () => {
  assert.equal(skillName("Attack +3"), "Attack");
  assert.equal(skillName("Health Rec Spd -2"), "Health Rec Spd");
});

test("matchesDecoration filters by slots, then name or skill", () => {
  assert.ok(matchesDecoration(fierce, "all", "", null));
  assert.ok(matchesDecoration(fierce, "slots-2", "", null));
  assert.ok(!matchesDecoration(fierce, "slots-1", "", null));
  assert.ok(matchesDecoration(fierce, "all", "fierce", null));
  assert.ok(matchesDecoration(fierce, "all", "  DEFENSE ", null));
  assert.ok(!matchesDecoration(fierce, "all", "+3", null), "points aren't searched");
  assert.ok(!matchesDecoration(fierce, "slots-1", "attack", null));
});

test("matchesDecoration's hunter filters use the jewel's row status", () => {
  assert.ok(matchesDecoration(fierce, "owned", "", status(true)));
  assert.ok(!matchesDecoration(fierce, "owned", "", status(false)));
  assert.ok(matchesDecoration(fierce, "not-owned", "", status(false)));
  assert.ok(!matchesDecoration(fierce, "owned", "", null), "no hunter, no match");
  const short: RowStatus["craft"] = {
    status: "short",
    via: "create",
    cost: 0,
    materials: [],
    missing: 1,
  };
  assert.ok(!matchesDecoration(fierce, "craftable", "", status(true, short)));
  assert.ok(matchesDecoration(fierce, "within-one", "attack", status(true, short)));
});
