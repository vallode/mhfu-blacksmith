import assert from "node:assert/strict";
import { test } from "node:test";
import { breakConditions, breakIndex, breakKey } from "../src/lib/monster-breaks";

test("breakConditions phrases the flinch count, HP and damage", () => {
  assert.deepEqual(breakConditions({ name: "wing", parts: [1, 2], flinches: 1 }), ["1st flinch"]);
  assert.deepEqual(
    breakConditions({
      name: "horn",
      parts: [0],
      flinches: 2,
      below_hp: 0.6,
      damage: "dragon",
    }),
    ["2nd flinch", "under 60% HP", "dragon damage"],
  );
  assert.deepEqual(breakConditions({ name: "claw", parts: [5, 6], flinches: 2, all_parts: true }), [
    "2nd flinch of each",
  ]);
  assert.deepEqual(breakConditions({ name: "tail", parts: [4], flinches: 1, damage: "cut" }), [
    "1st flinch",
    "cutting damage",
  ]);
  assert.deepEqual(breakConditions({ name: "wing", parts: [7], flinches: 5 }), ["5th flinch"]);
  // Broken on an event, not a flinch count: nothing to say.
  assert.deepEqual(breakConditions({ name: "shell", parts: [2], flinches: null }), []);
});

test("break keys round-trip and don't collide with hitzone part names", () => {
  assert.equal(breakIndex(breakKey(3)), 3);
  assert.equal(breakIndex("head"), null);
  assert.equal(breakIndex("chest-broken"), null);
});
