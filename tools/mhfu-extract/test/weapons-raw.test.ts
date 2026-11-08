import assert from "node:assert/strict";
import { test } from "node:test";
import { dumpWeaponsRaw } from "../src/emit/weapons-raw.js";
import { WEAPON_BM_ENTRY_SIZE, WEAPON_GUN_ENTRY_SIZE, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

test("dumpWeaponsRaw writes every struct byte plus decoded fields, names and types", () => {
  const { buf, reader } = fixtureReader(0x200000);
  const bm = tableOffset("weaponsBlademaster") + 1 * WEAPON_BM_ENTRY_SIZE;
  buf.writeUInt16LE(10, bm + 0); // ModelID
  buf.writeInt8(-10, bm + 13); // Affinity
  buf.writeUInt8(7, bm + 23); // Unkn3
  buf.writeUInt8(0, tableOffset("modelToWeaponType") + 10); // great sword
  const gun = tableOffset("weaponsGunner") + 2 * WEAPON_GUN_ENTRY_SIZE;
  buf.writeInt8(15, gun + 13); // Affinity

  const dump = dumpWeaponsRaw(reader);
  const sword = dump.weapons.find((w) => w.table === "bm" && w.index === 1)!;
  assert.equal(sword.name, "Carbalite Sword");
  assert.equal(sword.type, "great-sword");
  assert.equal(sword.bytes.length, WEAPON_BM_ENTRY_SIZE);
  assert.equal(sword.bytes[13], 0xf6);
  assert.equal(sword.bytes[23], 7);
  assert.equal(sword.fields.affinity, -10);
  assert.equal(sword.fields.unkn3, 7);
  assert.ok(!("index" in sword.fields));

  const bowgun = dump.weapons.find((w) => w.table === "gun" && w.index === 2)!;
  assert.equal(bowgun.bytes.length, WEAPON_GUN_ENTRY_SIZE);
  assert.equal(bowgun.fields.affinity, 15);
  assert.equal(dump.weapons.filter((w) => w.table === "bm").length, 1150);
  assert.equal(dump.weapons.filter((w) => w.table === "gun").length, 354);
});
