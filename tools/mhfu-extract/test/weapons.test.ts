import assert from "node:assert/strict";
import { test } from "node:test";
import { tableOffset, TABLE_COUNTS, WEAPON_BM_ENTRY_SIZE, WEAPON_GUN_ENTRY_SIZE } from "../src/tables/offsets.js";
import {
  decodeBowCoatings,
  decodeShotCoat,
  readBlademasterWeapons,
  readGunnerWeapons,
  readModelToWeaponType,
  readWeaponClassModifiers,
  WEAPON_TYPE_NAMES,
} from "../src/tables/weapons.js";
import { fixtureReader } from "./helpers.js";

test("readWeaponClassModifiers reads eleven u32s in declared order", () => {
  const base = tableOffset("weaponClassModifiers");
  const { buf, reader } = fixtureReader(base + 44);
  const values = [480, 120, 520, 230, 140, 120, 140, 480, 520, 230, 120];
  values.forEach((v, i) => buf.writeUInt32LE(v, base + i * 4));

  const mods = readWeaponClassModifiers(reader);
  assert.deepEqual(mods, {
    greatSword: 480,
    heavyBowgun: 120,
    hammer: 520,
    lance: 230,
    swordAndShield: 140,
    lightBowgun: 120,
    dualBlades: 140,
    longSword: 480,
    huntingHorn: 520,
    gunLance: 230,
    bow: 120,
  });
});

test("readBlademasterWeapons decodes fields at the documented byte offsets", () => {
  const base = tableOffset("weaponsBlademaster");
  const { buf, reader } = fixtureReader(base + TABLE_COUNTS.weaponsBlademaster * WEAPON_BM_ENTRY_SIZE);

  const off = base + 1 * WEAPON_BM_ENTRY_SIZE;
  buf.writeUInt16LE(10, off + 0); // modelId
  buf.writeUInt8(5, off + 2); // rarity
  buf.writeUInt8(0, off + 3); // unkn1
  buf.writeUInt32LE(50000, off + 4); // price
  buf.writeUInt8(3, off + 8); // sharpnessId
  buf.writeUInt8(2, off + 9); // sharpnessAmount
  buf.writeUInt16LE(190, off + 10); // attack
  buf.writeUInt8(0, off + 12); // defense
  buf.writeInt8(-15, off + 13); // affinity
  buf.writeUInt8(0, off + 14); // eleType
  buf.writeUInt8(0, off + 15); // eleValue
  buf.writeUInt8(0, off + 16); // statusType
  buf.writeUInt8(0, off + 17); // statusValue
  buf.writeUInt8(1, off + 18); // slots
  buf.writeUInt8(0, off + 19); // noteGlType
  buf.writeUInt8(0, off + 20); // unkn2
  buf.writeUInt16LE(65, off + 21); // sortOrder
  buf.writeUInt8(0, off + 23); // unkn3

  const weapons = readBlademasterWeapons(reader);
  assert.equal(weapons.length, TABLE_COUNTS.weaponsBlademaster);
  assert.deepEqual(weapons[1], {
    index: 1,
    modelId: 10,
    rarity: 5,
    unkn1: 0,
    price: 50000,
    sharpnessId: 3,
    sharpnessAmount: 2,
    attack: 190,
    defense: 0,
    affinity: -15,
    eleType: 0,
    eleValue: 0,
    statusType: 0,
    statusValue: 0,
    slots: 1,
    noteGlType: 0,
    unkn2: 0,
    sortOrder: 65,
    unkn3: 0,
  });
});

test("readGunnerWeapons decodes fields including the trailing ShotCoat bitfield", () => {
  const base = tableOffset("weaponsGunner");
  const { buf, reader } = fixtureReader(base + TABLE_COUNTS.weaponsGunner * WEAPON_GUN_ENTRY_SIZE);

  const off = base;
  buf.writeUInt16LE(115, off + 0); // modelId
  buf.writeUInt8(0, off + 2); // rarity
  buf.writeUInt8(0, off + 3); // rangedPhysxTbl
  buf.writeUInt32LE(900, off + 4); // price
  buf.writeUInt16LE(80, off + 8); // attack
  buf.writeUInt8(0, off + 10); // defense
  buf.writeUInt8(2, off + 11); // recoilCharge
  buf.writeUInt8(3, off + 12); // slots
  buf.writeInt8(0, off + 13); // affinity
  buf.writeUInt16LE(1, off + 14); // sortOrder
  buf.writeUInt8(3, off + 16); // bulletCharge
  buf.writeUInt8(0, off + 17); // eleType
  buf.writeUInt8(0, off + 18); // eleValue
  buf.writeUInt8(2, off + 19); // reload
  buf.writeUInt32LE(0, off + 20); // unkn1
  buf.writeUInt32LE(0b11, off + 24); // shotCoatings: Norm1 + Norm2

  const weapons = readGunnerWeapons(reader);
  assert.equal(weapons[0]!.modelId, 115);
  assert.equal(weapons[0]!.slots, 3);
  assert.equal(weapons[0]!.shotCoatings, 0b11);

  const flags = decodeShotCoat(weapons[0]!.shotCoatings);
  assert.equal(flags.norm1, true);
  assert.equal(flags.norm2, true);
  assert.equal(flags.norm3, false);
  assert.equal(flags.armor, false);
});

test("decodeShotCoat maps every declared bit independently", () => {
  const allSet = decodeShotCoat(0xffffffff);
  for (const field of Object.values(allSet)) assert.equal(field, true);

  const noneSet = decodeShotCoat(0);
  for (const field of Object.values(noneSet)) assert.equal(field, false);
});

/**
 * Real `shotCoatings` values from real bows in a decrypted JP EBOOT
 * (vallode/mhfu-blacksmith#38) — pinned as regression fixtures. `Glorious
 * Victory II` (raw 64 = only bit 6 set) confirms the `paint` bit in
 * isolation; `Exterminator Bow II` (raw 66 = bits 1+6) confirms `power` and
 * `paint` combine correctly and every other flag stays false, matching
 * their real committed `data/weapons/bow.json` coating lists exactly.
 */
test("decodeBowCoatings decodes real single-coating bow bytes (paint only)", () => {
  const flags = decodeBowCoatings(64);
  assert.equal(flags.paint, true);
  assert.equal(flags.closerng, false);
  assert.equal(flags.paralysis, false);
  assert.equal(flags.poison, false);
  assert.equal(flags.sleep, false);
  assert.equal(flags.power, false);
});

test("decodeBowCoatings decodes real multi-coating bow bytes (power + paint)", () => {
  const flags = decodeBowCoatings(66);
  assert.equal(flags.power, true);
  assert.equal(flags.paint, true);
  assert.equal(flags.closerng, false);
  assert.equal(flags.paralysis, false);
  assert.equal(flags.poison, false);
  assert.equal(flags.sleep, false);
});

test("decodeBowCoatings never sets a flag for the bowgun-ammo-flag bit range it doesn't use", () => {
  // Every real bow observed has bits 7-31 (the bowgun ammo-flag territory
  // decodeShotCoat covers) always zero — a value using only those high bits
  // should decode to all 6 named coatings false.
  const flags = decodeBowCoatings(0b1111111 << 7);
  for (const enabled of Object.values(flags)) assert.equal(enabled, false);
});

test("readModelToWeaponType maps raw bytes to WEAPON_TYPE_NAMES", () => {
  const base = tableOffset("modelToWeaponType");
  const { buf, reader } = fixtureReader(base + TABLE_COUNTS.modelToWeaponType);
  buf.writeUInt8(0, base + 0); // great-sword
  buf.writeUInt8(10, base + 1); // bow
  buf.writeUInt8(200, base + 2); // out of enum range

  const types = readModelToWeaponType(reader);
  assert.equal(types[0], "great-sword");
  assert.equal(types[1], WEAPON_TYPE_NAMES[10]);
  assert.equal(types[2], null);
  assert.equal(types.length, TABLE_COUNTS.modelToWeaponType);
});
