import assert from "node:assert/strict";
import { test } from "node:test";
import { emitBlademasterWeapons, emitGunnerWeapons } from "../src/emit/weapons.js";
import { EQUIP_CREATE_ENTRY_SIZE, WEAPON_BM_ENTRY_SIZE, WEAPON_GUN_ENTRY_SIZE, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

// head(437) + chest(435) + arm(426) + waist(424) + leg(434) entries, plus the
// hidden `TERM` u16 and one hidden `NullCreate1` entry that precede the
// weapon sections — see readEquipmentCreate() in tables/recipes.ts.
const ARMOR_SECTION_ENTRY_COUNT = 437 + 435 + 426 + 424 + 434;
const greatSwordLongSwordBase =
  tableOffset("equipmentCreate") + ARMOR_SECTION_ENTRY_COUNT * EQUIP_CREATE_ENTRY_SIZE + 2 + EQUIP_CREATE_ENTRY_SIZE;

/**
 * Reproduces the real byte layout for blademaster weapon index 1
 * ("Carbalite Sword", a great sword) against a real decrypted JP EBOOT —
 * see emit/weapons.ts's derivation notes — as a regression fixture.
 */
function buildCarbaliteSwordFixture() {
  // emitBlademasterWeapons() eagerly reads every whole table (weapon class
  // mods, all EquipCreate/EquipUpgrade sections, sharpness, model->type) —
  // the buffer needs to cover the furthest one touched (itemTable's region),
  // not just the couple of entries this fixture actually populates.
  const { buf, reader } = fixtureReader(0x200000);

  // WepClassMod.GreatSword (real value, see tables/weapons.ts)
  buf.writeUInt32LE(480, tableOffset("weaponClassModifiers") + 0);

  // WepBMValues[1] — real "Carbalite Sword" bytes.
  const wOff = tableOffset("weaponsBlademaster") + 1 * WEAPON_BM_ENTRY_SIZE;
  buf.writeUInt16LE(10, wOff + 0); // ModelID
  buf.writeUInt8(5, wOff + 2); // Rarity (raw) -> display rarity 6
  buf.writeUInt32LE(50000, wOff + 4); // Price
  buf.writeUInt8(0, wOff + 8); // SharpnessID
  buf.writeUInt8(2, wOff + 9); // SharpnessAmount
  buf.writeUInt16LE(190, wOff + 10); // Attack (raw) -> 190 * 4.8 = 912
  buf.writeInt8(0, wOff + 13); // Affinity

  // Mod2WepType[10] = 0 ("great-sword", first entry in WEAPON_TYPE_NAMES).
  buf.writeUInt8(0, tableOffset("modelToWeaponType") + 10);

  // EquipmentCreateTable.greatSwordLongSword — real "Carbalite Sword" recipe
  // (equipId=1 identifies the weapon; this entry's own array position
  // doesn't need to match — see groupEquipCreateByEquipId's docs).
  const cOff = greatSwordLongSwordBase + 0 * EQUIP_CREATE_ENTRY_SIZE;
  buf.writeUInt16LE(1, cOff + 2); // EquipID
  buf.writeUInt16LE(206, cOff + 4); // Craft[0].Item = "Carbalite Ore"
  buf.writeUInt16LE(5, cOff + 6); // Craft[0].Quantity

  return reader;
}

test("emitBlademasterWeapons reproduces the real Carbalite Sword entry end-to-end", () => {
  const reader = buildCarbaliteSwordFixture();
  const weapons = emitBlademasterWeapons(reader);
  const sword = weapons.find((w) => w.name === "Carbalite Sword");
  assert.ok(sword, "Carbalite Sword should be emitted");
  assert.equal(sword!.attack, 912); // 190 * (480/100)
  assert.equal(sword!.rarity, 6);
  assert.equal(sword!.type, "great-sword");
  assert.equal(sword!.affinity, "0%");
  assert.equal(sword!.elements, null);
  assert.equal(sword!.create_cost, 25000); // 50000 / 2
  assert.deepEqual(sword!.create_mats, [{ name: "Carbalite Ore", amount: 5, type: "ore", color: "slate" }]);
});

/**
 * Reproduces real `WepGunValue[1]` bytes for "Iron Bow I" with a real bow
 * `shotCoatings` value (66 = bits 1+6, real "Exterminator Bow II" bytes —
 * see `test/weapons.test.ts`'s `decodeBowCoatings` fixtures for the
 * correlation) to confirm `emitGunnerWeapons` routes bow coatings through
 * `decodeBowCoatings()` (fix-plan.md issue #7), not the bowgun-ammo-flag
 * `decodeShotCoat()` — before the fix this same raw value decoded as
 * bowgun ammo flags (semantically meaningless for a bow) instead of
 * `["power", "paint"]`.
 */
function buildBowCoatingsFixture() {
  const { buf, reader } = fixtureReader(0x200000);

  const wOff = tableOffset("weaponsGunner") + 1 * WEAPON_GUN_ENTRY_SIZE;
  buf.writeUInt16LE(20, wOff + 0); // ModelID
  buf.writeUInt32LE(1000, wOff + 4); // Price
  buf.writeUInt16LE(80, wOff + 8); // Attack
  buf.writeUInt32LE(66, wOff + 24); // ShotCoatings: power (bit 1) + paint (bit 6)

  // Mod2WepType[20] = 10 ("bow", last entry in WEAPON_TYPE_NAMES).
  buf.writeUInt8(10, tableOffset("modelToWeaponType") + 20);

  return reader;
}

test("emitGunnerWeapons decodes a real bow's coatings via decodeBowCoatings, not decodeShotCoat", () => {
  const reader = buildBowCoatingsFixture();
  const weapons = emitGunnerWeapons(reader);
  // WepGunID[1] is real, unrelated vendored enum data ("Shooter's Barrel");
  // only its raw shotCoatings/modelId bytes here are the fixture under test.
  const bow = weapons.find((w) => w.name === "Shooter's Barrel");
  assert.ok(bow, "the fixture bow entry should be emitted");
  assert.equal(bow!.type, "bow");
  assert.deepEqual(bow!.coatings, ["power", "paint"]);
});
