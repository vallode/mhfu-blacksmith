import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attachHornMelodies,
  blademasterAffinity,
  defenseBonus,
  emitBlademasterWeapons,
  emitGunnerWeapons,
  emitMelodies,
  gunlanceShelling,
} from "../src/emit/weapons.js";
import { BinaryReader } from "../src/binary/reader.js";
import { readMelodyTable } from "../src/tables/horn.js";
import { SHARPNESS_POINTER_COUNT, SHARPNESS_POINTERS_OFFSET } from "../src/tables/sharpness.js";
import {
  EQUIP_CREATE_ENTRY_SIZE,
  JP_BASE_ADDRESS,
  SHARPNESS_ENTRY_SIZE,
  WEAPON_BM_ENTRY_SIZE,
  WEAPON_GUN_ENTRY_SIZE,
  tableOffset,
} from "../src/tables/offsets.js";
import { NOTE_SET_BYTES, fixtureReader, melodyTableBytes } from "./helpers.js";

// head(437) + chest(435) + arm(426) + waist(424) + leg(434) entries, plus the
// hidden `TERM` u16 and one hidden `NullCreate1` entry that precede the
// weapon sections — see readEquipmentCreate() in tables/recipes.ts.
const ARMOR_SECTION_ENTRY_COUNT = 437 + 435 + 426 + 424 + 434;
const greatSwordLongSwordBase =
  tableOffset("equipmentCreate") +
  ARMOR_SECTION_ENTRY_COUNT * EQUIP_CREATE_ENTRY_SIZE +
  2 +
  EQUIP_CREATE_ENTRY_SIZE;

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
  assert.deepEqual(sword!.create_mats, [
    { name: "Carbalite Ore", amount: 5, type: "ore", color: "slate" },
  ]);
});

test("blademasterAffinity adds the sharpness bonus to positive affinity only", () => {
  assert.equal(blademasterAffinity(10, 3), 10);
  assert.equal(blademasterAffinity(5, 4), 10); // Igneous Blade: 5% raw, shows 10%
  assert.equal(blademasterAffinity(10, 5), 20); // Igneous Sword: 10% raw, shows 20%
  assert.equal(blademasterAffinity(40, 6), 50); // Darkness Darkblade
  assert.equal(blademasterAffinity(0, 6), 0);
  assert.equal(blademasterAffinity(-20, 6), -20);
});

test("emitBlademasterWeapons writes affinity with the sharpness bonus", () => {
  const reader = buildCarbaliteSwordFixture();
  const wOff = tableOffset("weaponsBlademaster") + 1 * WEAPON_BM_ENTRY_SIZE;
  reader.buf.writeUInt8(5, wOff + 9); // SharpnessAmount
  reader.buf.writeInt8(10, wOff + 13); // Affinity (raw)
  const sword = emitBlademasterWeapons(reader).find((w) => w.name === "Carbalite Sword");
  assert.equal(sword!.affinity, "20%");
});

/**
 * Reproduces real `WepGunValue[1]` bytes for "Iron Bow I" with a real bow
 * `shotCoatings` value (66 = bits 1+6, real "Exterminator Bow II" bytes —
 * see `test/weapons.test.ts`'s `decodeBowCoatings` fixtures for the
 * correlation) to confirm `emitGunnerWeapons` routes bow coatings through
 * `decodeBowCoatings()` (vallode/mhfu-blacksmith#38), not the bowgun-ammo-flag
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

/**
 * A hammer reads its curve from `SharpnessTable.PTR[2]`, not from entry
 * `sharpnessId` of the whole table (vallode/mhfu-blacksmith#31). The two
 * curves are real EU table entries 1 and 9 (hammer's run starts at 8).
 */
test("emitBlademasterWeapons reads a hammer's sharpness through its class pointer", () => {
  const { buf, reader } = fixtureReader(0x200000);
  const table = tableOffset("sharpnessTable");
  const writeEntry = (index: number, values: number[]) =>
    values.forEach((v, c) => buf.writeUInt16LE(v, table + index * SHARPNESS_ENTRY_SIZE + c * 2));
  writeEntry(1, [90, 130, 240, 310, 370, 410, 450]);
  writeEntry(9, [50, 90, 230, 330, 370, 430, 450]);
  const pointers = table + SHARPNESS_POINTERS_OFFSET;
  for (let type = 0; type < SHARPNESS_POINTER_COUNT; type++) {
    const entry = type === 2 ? 8 : 0;
    buf.writeUInt32LE(table + entry * SHARPNESS_ENTRY_SIZE + JP_BASE_ADDRESS, pointers + type * 4);
  }

  const wOff = tableOffset("weaponsBlademaster") + 1 * WEAPON_BM_ENTRY_SIZE;
  buf.writeUInt16LE(30, wOff + 0); // ModelID
  buf.writeUInt8(1, wOff + 8); // SharpnessID
  buf.writeUInt8(0, wOff + 9); // SharpnessAmount -> 150 raw units
  buf.writeUInt8(2, tableOffset("modelToWeaponType") + 30); // hammer

  const weapon = emitBlademasterWeapons(reader).find((w) => w.name === "Carbalite Sword");
  assert.ok(weapon);
  assert.equal(weapon!.type, "hammer");
  assert.deepEqual(weapon!.sharpness, [5, 4, 6]); // entry 9, not entry 1's [9, 4, 2]
  assert.deepEqual(weapon!.sharpness_plus, [5, 4, 11]);
});

test("emitGunnerWeapons adds bow coating bonuses to elements and no bowgun coatings", () => {
  const reader = buildBowCoatingsFixture();
  const wOff = tableOffset("weaponsGunner") + 1 * WEAPON_GUN_ENTRY_SIZE;
  // Queen Blaster's real ShotCoatings: poison, power, paint + the poison bonus (bit 7).
  reader.buf.writeUInt32LE(198, wOff + 24);
  const bow = emitGunnerWeapons(reader).find((w) => w.name === "Shooter's Barrel")!;
  assert.deepEqual(bow.coatings, ["poison", "power", "paint"]);
  assert.deepEqual(bow.elements, [{ name: "Poison", attack: "Add" }]);

  // The same weapon as a light bowgun: ammo lists, no coatings.
  reader.buf.writeUInt8(5, tableOffset("modelToWeaponType") + 20);
  const gun = emitGunnerWeapons(reader).find((w) => w.name === "Shooter's Barrel")!;
  assert.equal(gun.type, "light-bowgun");
  assert.ok(!("coatings" in gun));
  assert.equal((gun.ammo as unknown[]).length, 5);
  assert.equal(gun.elements, null);
});

/**
 * Snow Venom (WepBMID 867), a dual-element dual blade: its own struct has no
 * element, and `WepDualAttr` holds both (the real first table entry).
 */
function buildSnowVenomFixture() {
  const reader = buildCarbaliteSwordFixture();
  const buf = reader.buf;
  buf.writeUInt32LE(140, tableOffset("weaponClassModifiers") + 24); // WepClassMod.DualBlades
  const wOff = tableOffset("weaponsBlademaster") + 867 * WEAPON_BM_ENTRY_SIZE;
  buf.writeUInt16LE(20, wOff + 0); // ModelID
  buf.writeUInt16LE(200, wOff + 10); // Attack (raw)
  buf.writeUInt8(6, tableOffset("modelToWeaponType") + 20); // WepTypeID 6 = dual-blades
  Buffer.from("630380000c000200080064038000100002001400", "hex").copy(
    buf,
    tableOffset("dualAttributeWeapons"),
  );
  return reader;
}

test("emitBlademasterWeapons emits both elements of a dual-element weapon, in stored order", () => {
  const weapons = emitBlademasterWeapons(buildSnowVenomFixture());
  const snowVenom = weapons.find((w) => w.name === "Snow Venom");
  assert.equal(snowVenom!.type, "dual-blades");
  assert.deepEqual(snowVenom!.elements, [
    { name: "Ice", attack: 120 },
    { name: "Poison", attack: 80 },
  ]);
  // Snow Venom+ is the table's second entry.
  assert.deepEqual(weapons.find((w) => w.name === "Snow Venom+")!.elements, [
    { name: "Ice", attack: 160 },
    { name: "Poison", attack: 200 },
  ]);
  // Weapons without an entry keep their single element (none here).
  assert.equal(weapons.find((w) => w.name === "Carbalite Sword")!.elements, null);
});

test("emitBlademasterWeapons rejects an unknown dual-attribute flag", () => {
  const reader = buildSnowVenomFixture();
  reader.buf.writeUInt16LE(0x08, tableOffset("dualAttributeWeapons") + 2); // EleBitFlag.Unused
  assert.throws(
    () => emitBlademasterWeapons(reader),
    /Unknown dual-attribute flag 0x8 on WepBMID 867/,
  );
});

test("defenseBonus writes the Defense byte, signed except on bowguns", () => {
  assert.equal(defenseBonus(0, "hunting-horn"), null);
  assert.equal(defenseBonus(10, "hunting-horn"), "+10");
  assert.equal(defenseBonus(20, "lance"), "+20");
  assert.equal(defenseBonus(15, "bow"), "+15");
  assert.equal(defenseBonus(10, "heavy-bowgun"), "10");
  assert.equal(defenseBonus(6, "light-bowgun"), "6");
});

test("gunlanceShelling decodes type and level from NoteGLType", () => {
  assert.deepEqual(gunlanceShelling(0), { type: "Normal", level: "1" });
  assert.deepEqual(gunlanceShelling(4), { type: "Spread", level: "2" });
  assert.deepEqual(gunlanceShelling(8), { type: "Long", level: "3" });
  assert.deepEqual(gunlanceShelling(14), { type: "Long", level: "5" });
});

/** The Carbalite Sword fixture turned into a hunting horn (index 1) and a gunlance (index 2). */
function buildHornAndGunlanceFixture() {
  const reader = buildCarbaliteSwordFixture();
  const buf = reader.buf;
  Buffer.from([...NOTE_SET_BYTES, 0xff, 0xff, 0xff, 0xff]).copy(buf, 0x1f0000);
  const horn = tableOffset("weaponsBlademaster") + 1 * WEAPON_BM_ENTRY_SIZE;
  buf.writeUInt16LE(30, horn + 0); // ModelID
  buf.writeUInt8(10, horn + 12); // Defense
  buf.writeUInt8(2, horn + 19); // NoteGLType: w-g-r
  buf.writeUInt8(8, tableOffset("modelToWeaponType") + 30); // hunting horn
  const gunlance = tableOffset("weaponsBlademaster") + 2 * WEAPON_BM_ENTRY_SIZE;
  buf.writeUInt16LE(31, gunlance + 0);
  buf.writeUInt8(7, gunlance + 19); // NoteGLType: Spread 3
  buf.writeUInt8(9, tableOffset("modelToWeaponType") + 31); // gunlance
  return reader;
}

test("emitBlademasterWeapons emits horn notes, gunlance shelling and bonus", () => {
  const weapons = emitBlademasterWeapons(buildHornAndGunlanceFixture());
  const horn = weapons.find((w) => w.type === "hunting-horn")!;
  assert.deepEqual(horn.notes, ["w", "g", "r"]);
  assert.equal(horn.bonus, "+10");
  assert.equal(horn.shelling, undefined);
  const gunlance = weapons.find((w) => w.type === "gunlance")!;
  assert.deepEqual(gunlance.shelling, { type: "Spread", level: "3" });
  assert.equal(gunlance.bonus, null);
  assert.equal(gunlance.notes, undefined);
});

test("attachHornMelodies gives each horn the songs its notes can play, with effect text", () => {
  const weapons = emitBlademasterWeapons(buildHornAndGunlanceFixture());
  const ovl = Buffer.alloc(0x400);
  melodyTableBytes().copy(ovl, 0x80);
  attachHornMelodies(weapons, new BinaryReader(ovl));
  const horn = weapons.find((w) => w.type === "hunting-horn")!;
  assert.deepEqual(horn.melodies, [
    {
      combo: ["w", "w"],
      effect: "Movement Speed Up",
      description: null,
      duration: "3 mins",
      extended_effect: "Attacks Harder To Break",
      extended_duration: "1 min 30 s",
    },
    {
      combo: ["w", "r"],
      effect: "Attack Up [Lo]",
      description: "Attack +10%",
      duration: "2 mins",
      extended_effect: "Attack +15%",
      extended_duration: "1 min",
    },
    {
      combo: ["r", "g", "r"],
      effect: "Defense Up [Lo]",
      description: "Defense +15%",
      duration: "2 mins",
      extended_effect: "Defense +20%",
      extended_duration: "1 min 30 s",
    },
  ]);
  assert.equal(weapons.find((w) => w.type === "gunlance")!.melodies, undefined);
});

test("emitMelodies leaves out songs needing a colour the horn lacks", () => {
  const ovl = Buffer.alloc(0x400);
  melodyTableBytes().copy(ovl, 0x80);
  const songs = readMelodyTable(new BinaryReader(ovl));
  assert.deepEqual(
    emitMelodies(songs, ["p", "a", "r"]).map((m) => m.combo.join("")),
    ["prr", "raap", ...Array.from({ length: 27 }, () => "aaa")],
  );
});
