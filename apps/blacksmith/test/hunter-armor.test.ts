import { test } from "node:test";
import assert from "node:assert/strict";
import { ARMOR_JOINT_MAPS, HUNTER_ARMOR } from "mhfu-extract/src/models/hunter.js";
import { HUNTER_SLOTS, SLOT_ROOT, transferSkin } from "../src/lib/hunter-armor";

// The viewer reads files `export-site` writes; these copies must match it.

test("slots are in the order the hunter's pieces are composed", () => {
  assert.deepEqual(HUNTER_SLOTS, Object.keys(HUNTER_ARMOR));
});

test("each slot's piece hangs from its skeleton's first mapped joint", () => {
  for (const slot of HUNTER_SLOTS) assert.equal(SLOT_ROOT[slot], ARMOR_JOINT_MAPS[slot][1], slot);
});

test("skin weights come from the nearest source vertices", () => {
  const source = {
    // One vertex on joint 3, one on joint 7, 10 apart along X.
    positions: [0, 0, 0, 10, 0, 0],
    joints: [3, 0, 0, 0, 7, 0, 0, 0],
    weights: [1, 0, 0, 0, 1, 0, 0, 0],
  };
  const { joints, weights } = transferSkin([0, 0, 0, 5, 0, 0, 9, 0, 0], source);
  // On a source vertex: its weights outright.
  assert.equal(joints[0], 3);
  assert.ok(weights[0]! > 0.999);
  // Halfway: both, evenly.
  assert.deepEqual([joints[4], joints[5]].sort(), [3, 7]);
  assert.ok(Math.abs(weights[4]! - 0.5) < 1e-6);
  // Nearer the second: mostly its joint, normalized.
  assert.equal(joints[8], 7);
  assert.ok(weights[8]! > 0.9);
  assert.ok(Math.abs(weights[8]! + weights[9]! - 1) < 1e-6);
});
