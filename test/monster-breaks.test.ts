import assert from "node:assert/strict";
import { test } from "node:test";
import { breakConditions, breakIndex, breakKey, flinchThreshold } from "../src/lib/monster-breaks";

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

test("flinchThreshold gives one value or the range of a row's parts", () => {
  const rathalos = [160, 100, 100, 160, 160, 100, 180, 150, 150];
  assert.equal(flinchThreshold(rathalos, [6]), "180");
  assert.equal(flinchThreshold(rathalos, [1, 2]), "100");
  assert.equal(flinchThreshold(rathalos, [0, 3, 4, 5, 7]), "100–160");
  // Missing parts (null, or past the record) don't count.
  assert.equal(flinchThreshold([130, null], [1, 4]), null);
  assert.equal(flinchThreshold([130, null], [0, 1]), "130");
});
