import assert from "node:assert/strict";
import { test } from "node:test";
import {
  JP_BASE_ADDRESS,
  JP_TABLE_ADDRESSES,
  TABLE_COUNTS,
  WEAPON_BM_ENTRY_SIZE,
  jpVaddrToOffset,
  tableOffset,
  verifyOffsets,
} from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

test("tableOffset and jpVaddrToOffset agree and rebase off JP_BASE_ADDRESS", () => {
  assert.equal(
    tableOffset("weaponsBlademaster"),
    JP_TABLE_ADDRESSES.weaponsBlademaster - JP_BASE_ADDRESS,
  );
  assert.equal(jpVaddrToOffset(JP_TABLE_ADDRESSES.itemTable), tableOffset("itemTable"));
});

test("verifyOffsets passes on a fixture with plausible weapon class modifiers", () => {
  const wepBmEnd =
    tableOffset("weaponsBlademaster") + TABLE_COUNTS.weaponsBlademaster * WEAPON_BM_ENTRY_SIZE;
  const classModEnd = tableOffset("weaponClassModifiers") + 11 * 4;
  const { buf, reader } = fixtureReader(Math.max(wepBmEnd, classModEnd));

  const classModBase = tableOffset("weaponClassModifiers");
  for (let i = 0; i < 11; i++) buf.writeUInt32LE(100 + i, classModBase + i * 4);
  // All-zero blademaster entries give SharpnessID=0, which is < 40, so no
  // further setup is needed for the sharpness-range check.

  const result = verifyOffsets(reader);
  assert.ok(
    result.ok,
    `expected all checks to pass, got: ${JSON.stringify(result.checks.filter((c) => !c.ok))}`,
  );
});

test("verifyOffsets fails when a weapon class modifier is zero", () => {
  const wepBmEnd =
    tableOffset("weaponsBlademaster") + TABLE_COUNTS.weaponsBlademaster * WEAPON_BM_ENTRY_SIZE;
  const { reader } = fixtureReader(
    Math.max(wepBmEnd, tableOffset("weaponClassModifiers") + 11 * 4),
  );
  const result = verifyOffsets(reader);
  assert.equal(result.ok, false);
  const classModCheck = result.checks.find(
    (c) => c.name === "weapon class modifiers are plausible",
  );
  assert.equal(classModCheck?.ok, false);
});

test("verifyOffsets fails when a blademaster weapon has an out-of-range SharpnessID", () => {
  const wepBmBase = tableOffset("weaponsBlademaster");
  const classModBase = tableOffset("weaponClassModifiers");
  const { buf, reader } = fixtureReader(
    Math.max(wepBmBase + TABLE_COUNTS.weaponsBlademaster * WEAPON_BM_ENTRY_SIZE, classModBase + 44),
  );
  for (let i = 0; i < 11; i++) buf.writeUInt32LE(100, classModBase + i * 4);
  buf.writeUInt8(99, wepBmBase + 8); // weapon 0's SharpnessID, out of the 40-entry table

  const result = verifyOffsets(reader);
  assert.equal(result.ok, false);
  const sharpnessCheck = result.checks.find(
    (c) => c.name === "all blademaster SharpnessID values < 40",
  );
  assert.equal(sharpnessCheck?.ok, false);
});
