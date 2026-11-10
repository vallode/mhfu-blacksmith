import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOWGUN_MOD_LEVEL_SIZE,
  BOWGUN_MOD_LEVELS,
  BOWGUN_SHOT_ENTRY_SIZE,
  BOW_CHARGE_ENTRY_SIZE,
  RAPID_FIRE_END,
  RAPID_FIRE_TABLE_OFFSET,
  readBowChargeTable,
  readBowgunModTable,
  readBowgunShotTable,
  readRapidFireTable,
} from "../src/tables/gunner.js";
import { JP_BASE_ADDRESS, tableOffset } from "../src/tables/offsets.js";
import { SHARPNESS_POINTER_COUNT, SHARPNESS_POINTERS_OFFSET } from "../src/tables/sharpness.js";
import { fixtureReader } from "./helpers.js";

// Real EU values: BGShotTable row 8 (Chain Blitz) and BowChargeTable row 29
// (Queen Blaster I: Sctr 2, Sctr 2, Sctr 3, Rapd 3).
const SHOT_ROW_8 = [
  3, 6, 9, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 3, 3, 3, 1, 3, 1, 3, 1, 2, 2, 1, 1,
];

test("readBowgunShotTable and readBowChargeTable read whole rows", () => {
  const { buf, reader } = fixtureReader(0x200000);
  Buffer.from(SHOT_ROW_8).copy(buf, tableOffset("bowgunShotTable") + 8 * BOWGUN_SHOT_ENTRY_SIZE);
  Buffer.from([6, 6, 7, 2]).copy(buf, tableOffset("bowChargeTable") + 29 * BOW_CHARGE_ENTRY_SIZE);

  const shots = readBowgunShotTable(reader);
  assert.equal(shots.length, 58);
  assert.deepEqual(shots[8], SHOT_ROW_8);
  const charges = readBowChargeTable(reader);
  assert.equal(charges.length, 117);
  assert.deepEqual(charges[29], [6, 6, 7, 2]);
});

test("readBowgunModTable follows four pointers to five levels each", () => {
  const { buf, reader } = fixtureReader(0x200000);
  const modTable = tableOffset("bowgunModTable");
  // The level pool starts right after SharpnessTable.PTR[11], as on disc.
  const pool =
    tableOffset("sharpnessTable") + SHARPNESS_POINTERS_OFFSET + SHARPNESS_POINTER_COUNT * 4;
  const typeSize = BOWGUN_MOD_LEVELS * BOWGUN_MOD_LEVEL_SIZE;
  for (let t = 0; t < 4; t++) {
    buf.writeUInt32LE(JP_BASE_ADDRESS + pool + t * typeSize, modTable + t * 4);
  }
  // Type 1, last level: real values (Attack_Inc 50, speed 0.85).
  const last = pool + typeSize + 4 * BOWGUN_MOD_LEVEL_SIZE;
  buf.writeUInt32LE(50, last);
  buf.writeFloatLE(0.85, last + 4);

  const mods = readBowgunModTable(reader);
  assert.equal(mods.length, 4);
  assert.equal(mods[1]!.length, 5);
  assert.equal(mods[1]![4]!.attackIncrease, 50);
  assert.ok(Math.abs(mods[1]![4]!.speed - 0.85) < 1e-6);
  assert.equal(mods[0]![4]!.attackIncrease, 0);
});

test("readRapidFireTable reads weapon/flag pairs up to the 999 terminator", () => {
  const { buf, reader } = fixtureReader(0x200000);
  let off = tableOffset("bowgunModTable") + RAPID_FIRE_TABLE_OFFSET;
  // Real EU entries: Chain Blitz (Normal S Lv1), Shotgun (White) (Pellet S Lv1).
  for (const [weapon, flags] of [
    [2, 0x1],
    [3, 0x100],
    [RAPID_FIRE_END, 0],
    [9, 0x4],
  ]) {
    buf.writeUInt32LE(weapon!, off);
    buf.writeUInt32LE(flags!, off + 4);
    off += 8;
  }
  assert.deepEqual(
    [...readRapidFireTable(reader)],
    [
      [2, 0x1],
      [3, 0x100],
    ],
  );
});
