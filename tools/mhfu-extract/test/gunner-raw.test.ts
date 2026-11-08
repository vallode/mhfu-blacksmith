import assert from "node:assert/strict";
import { test } from "node:test";
import { dumpGunnerRaw } from "../src/emit/gunner-raw.js";
import { BOWGUN_SHOT_ENTRY_SIZE, BOW_CHARGE_ENTRY_SIZE } from "../src/tables/gunner.js";
import { WEAPON_GUN_ENTRY_SIZE, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

test("dumpGunnerRaw writes the gunner tables, per-weapon fields and probe hits", () => {
  const { buf, reader } = fixtureReader(0x200000);
  buf.writeUInt8(9, tableOffset("bowgunShotTable") + 3 * BOWGUN_SHOT_ENTRY_SIZE + 2);
  buf.writeUInt8(12, tableOffset("bowChargeTable") + 5 * BOW_CHARGE_ENTRY_SIZE + 3);
  const gun = tableOffset("weaponsGunner") + 4 * WEAPON_GUN_ENTRY_SIZE;
  buf.writeUInt8(7, gun + 16); // BulletCharge
  [145, 146, 147].forEach((v, k) => buf.writeUInt16LE(v, 0x1000 + k * 6));

  const dump = dumpGunnerRaw(reader);
  assert.equal(dump.shotTable.length, 58);
  assert.equal(dump.shotTable[3]![2], 9);
  assert.equal(dump.bowCharges.length, 117);
  assert.equal(dump.bowCharges[5]![3], 12);
  assert.equal(dump.bowgunMods.length, 4);
  assert.equal(dump.bowgunMods[0]!.length, 5);
  assert.equal(dump.weapons.length, 354);
  assert.equal(dump.weapons[4]!.bulletCharge, 7);
  assert.ok(dump.probes.coatingBonusBows!.some((h) => h.offset === 0x1000 && h.stride === 6));
  assert.equal(dump.window.u8.length > 4000, true);
});
