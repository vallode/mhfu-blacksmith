import { test } from "node:test";
import assert from "node:assert/strict";
import { FACE_MASK as GAME_FACE_MASK, FACE_PART } from "mhfu-extract/src/models/face.js";
import { ARMOR_JOINT_MAPS, HUNTER_ARMOR } from "mhfu-extract/src/models/hunter.js";
import {
  FACE_MASK,
  FACE_PARTS,
  faceMask,
  HUNTER_SLOTS,
  SLOT_ROOT,
  transferSkin,
} from "../src/lib/hunter-armor";
import { armorModelFile } from "../src/lib/models";

// The viewer reads files `export-site` writes; these copies must match it.

test("slots are in the order the hunter's pieces are composed", () => {
  assert.deepEqual(HUNTER_SLOTS, Object.keys(HUNTER_ARMOR));
});

test("each slot's piece hangs from its skeleton's first mapped joint", () => {
  for (const slot of HUNTER_SLOTS) assert.equal(SLOT_ROOT[slot], ARMOR_JOINT_MAPS[slot][1], slot);
});

test("the face's parts and mask bits are the export's", () => {
  assert.deepEqual(FACE_PARTS, [FACE_PART, FACE_PART + 1]);
  assert.equal(FACE_PART, HUNTER_SLOTS.length);
  assert.deepEqual(FACE_MASK, GAME_FACE_MASK);
});

test("a helmet's face mask is looked up by its model ID", () => {
  const masks = { "3": FACE_MASK.ALL, "5": FACE_MASK.MATERIAL_0 };
  assert.equal(faceMask(masks, 3), FACE_MASK.ALL);
  assert.equal(faceMask(masks, 5), FACE_MASK.MATERIAL_0);
  assert.equal(faceMask(masks, 33), 0);
  assert.equal(faceMask(undefined, 3), 0);
});

test("an armor model's slot, sex and ID come from its URL", () => {
  assert.deepEqual(armorModelFile("/models/armor/m_hair003.glb"), {
    slot: "helmet",
    sex: "m",
    id: 3,
  });
  assert.deepEqual(armorModelFile("/models/armor/f_reg120.glb"), {
    slot: "leggings",
    sex: "f",
    id: 120,
  });
  assert.equal(armorModelFile("/models/weapons/we001.glb"), undefined);
  assert.equal(armorModelFile("/models/armor/m_face000.glb"), undefined);
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
