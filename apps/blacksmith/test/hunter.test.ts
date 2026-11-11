import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYER_GROUP_SLOTS } from "mhfu-extract/src/models/animation.js";
import { JOINT as PLAYER_JOINT } from "mhfu-extract/src/models/hunter.js";
import { SHEATHED_TARGET as EXPORTED_TARGET } from "mhfu-extract/src/models/weapon-pose.js";
import { WEAPON_TYPE_NAMES } from "mhfu-extract/src/tables/weapons.js";
import {
  GROUP_SLOTS,
  JOINT,
  SHEATHED_TARGET,
  WEAPON_CLASS,
  WEAPON_MOUNTS,
} from "../src/lib/hunter";

// The viewer reads files `export-site` writes; these copies must match it.

test("hunter joints are the player skeleton's", () => {
  assert.equal(JOINT.CHEST, PLAYER_JOINT.CHEST);
  assert.equal(JOINT.LEFT_HAND, PLAYER_JOINT.LEFT_HAND);
  assert.equal(JOINT.RIGHT_HAND, PLAYER_JOINT.RIGHT_HAND);
});

test("weapon classes follow the game's weapon type order", () => {
  assert.deepEqual(
    Object.entries(WEAPON_CLASS).sort((a, b) => a[1] - b[1]),
    WEAPON_TYPE_NAMES.map((name, index) => [name, index]),
  );
  assert.deepEqual(Object.keys(WEAPON_MOUNTS).sort(), [...WEAPON_TYPE_NAMES].sort());
});

test("motion slots and the sheathed target are named as the export writes them", () => {
  assert.equal(GROUP_SLOTS, PLAYER_GROUP_SLOTS);
  assert.equal(SHEATHED_TARGET, EXPORTED_TARGET);
});
