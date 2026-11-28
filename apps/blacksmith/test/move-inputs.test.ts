import assert from "node:assert/strict";
import { test } from "node:test";
import { readData } from "game-data";
import type { MotionValuesFile } from "../src/lib/motion-values";
import { MOVE_INPUTS, parseInput } from "../src/lib/move-inputs";
import { DATA_DIR, GAME } from "../src/lib/paths";

const file = readData<MotionValuesFile>(DATA_DIR, GAME, "motion-values.json");

test("inputs read as steps of buttons pressed together", () => {
  assert.deepEqual(parseInput("△"), [{ buttons: ["triangle"] }]);
  assert.deepEqual(parseInput("R+△ › ○"), [
    { buttons: ["r", "triangle"] },
    { buttons: ["circle"] },
  ]);
  assert.deepEqual(parseInput("hold △+○"), [{ buttons: ["triangle", "circle"], hold: true }]);
  assert.deepEqual(parseInput("↑+×"), [{ buttons: ["stick", "cross"] }]);
  assert.throws(() => parseInput("△ + ○"));
});

test("every move has an input, and every input a move", () => {
  for (const [type, moves] of Object.entries(file.weapons)) {
    const inputs = MOVE_INPUTS[type as keyof typeof MOVE_INPUTS] ?? {};
    const keys = moves.map((m) => m.move);
    assert.deepEqual(Object.keys(inputs).sort(), [...keys].sort(), type);
    for (const text of Object.values(inputs)) parseInput(text);
  }
});
