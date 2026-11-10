import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  defenceAtLevel,
  emitArmor,
  hunterTypeFromBits,
  sexFromHunterType,
  type EmittedArmor,
} from "../src/emit/armor.js";
import { MHP2G_EU_RESOLVER } from "../src/games/mhp2g.js";
import { ARMOR_POINTER_INDEX, ARMOR_SLOTS, type ArmorSlot } from "../src/tables/armor.js";
import { ARMOR_SLOT_TABLE_NAMES_EU, EU_TABLE_SIGNATURES } from "../src/tables/eu-signatures.js";
import { EQUIP_CREATE_ENTRY_SIZE, JP_BASE_ADDRESS, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../data/armor");

const SITE_FILE: Record<ArmorSlot, string> = {
  head: "helmet",
  chest: "plate",
  arm: "gauntlets",
  waist: "waist",
  leg: "leggings",
};

const TABLE_NAME: Record<ArmorSlot, string> = {
  head: "armorValuesHead",
  chest: "armorValuesChest",
  arm: "armorValuesArm",
  waist: "armorValuesWaist",
  leg: "armorValuesLeg",
};

/**
 * Each slot's first two real `ArmorValue` entries (dummy + index 1), taken
 * from the EU signatures, which are real disc bytes. Index 1 of each slot is
 * the starter piece below.
 */
const REAL_BYTES: Record<ArmorSlot, Buffer> = Object.fromEntries(
  ARMOR_SLOTS.map((slot) => [slot, ARMOR_SLOT_TABLE_NAMES_EU[TABLE_NAME[slot]]!.signature]),
) as Record<ArmorSlot, Buffer>;

const INDEX_1_NAME: Record<ArmorSlot, string> = {
  head: "Leather Helm",
  chest: "Leather Armor",
  arm: "Leather Vambraces",
  waist: "Leather Belt",
  leg: "Green Pants",
};

/** Real JP file offsets of each slot's array (back to back, in slot order). */
const JP_ARRAY_OFFSET: Record<ArmorSlot, number> = {
  head: 0x15ed04,
  chest: 0x163124,
  arm: 0x1672c4,
  waist: 0x16b2fc,
  leg: 0x16f2e4,
};

/** Real EU file offsets the signatures resolve to. */
const EU_ARRAY_OFFSET: Record<ArmorSlot, number> = {
  head: 0x161808,
  chest: 0x165c28,
  arm: 0x169dc8,
  waist: 0x16de00,
  leg: 0x171de8,
};

const FIXTURE_SIZE = 0x180000;

function committed(slot: ArmorSlot, name: string) {
  const file = JSON.parse(readFileSync(path.join(DATA_DIR, `${SITE_FILE[slot]}.json`), "utf-8"));
  const entry = file.armor.find((a: { name: string }) => a.name === name);
  assert.ok(entry, `${name} should be in data/armor/${SITE_FILE[slot]}.json`);
  return entry;
}

function sortedSkills(skills: { name: string; amount: number }[] | null) {
  return [...(skills ?? [])].sort((a, b) => a.name.localeCompare(b.name));
}

/** Asserts the emitted index-1 piece of `slot` matches the site's data for it. */
function assertMatchesSite(armor: Record<ArmorSlot, EmittedArmor[]>, slot: ArmorSlot) {
  const name = INDEX_1_NAME[slot];
  const emitted = armor[slot].find((a) => a.name === name);
  assert.ok(emitted, `${slot}: ${name} should be emitted`);
  const site = committed(slot, name);
  assert.equal(emitted!.type, SITE_FILE[slot]);
  assert.equal(emitted!.defence, site.defence, `${name} defence`);
  assert.equal(emitted!.slots, site.slots, `${name} slots`);
  assert.equal(emitted!.rarity, site.rarity, `${name} rarity`);
  for (const res of ["fire_res", "water_res", "thunder_res", "dragon_res", "ice_res"] as const) {
    assert.equal(emitted![res], site[res], `${name} ${res}`);
  }
  assert.deepEqual(sortedSkills(emitted!.skills), sortedSkills(site.skills), `${name} skills`);
}

/** Real "Leather Helm" recipe (equipId 1, the helmet's array index). */
function writeLeatherHelmRecipe(buf: Buffer, createBase: number) {
  const off = createBase + 1 * EQUIP_CREATE_ENTRY_SIZE;
  buf.writeUInt16LE(1, off + 2); // EquipID
  buf.writeUInt16LE(201, off + 4); // Craft[0].Item = "Disk Stone"
  buf.writeUInt16LE(1, off + 6); // Craft[0].Quantity
}

/**
 * JP layout: the five arrays at their real offsets, and `ArmorValuePTR`
 * pointing at them in the real (leg, head, chest, arm, waist) order.
 */
function buildJpFixture() {
  const { buf, reader } = fixtureReader(FIXTURE_SIZE);
  const ptrBase = tableOffset("armorValuePointers");
  for (const slot of ARMOR_SLOTS) {
    REAL_BYTES[slot].copy(buf, JP_ARRAY_OFFSET[slot]);
    buf.writeUInt32LE(
      JP_BASE_ADDRESS + JP_ARRAY_OFFSET[slot],
      ptrBase + ARMOR_POINTER_INDEX[slot] * 4,
    );
  }
  writeLeatherHelmRecipe(buf, tableOffset("equipmentCreate"));
  return reader;
}

test("ArmorValuePTR's pointers are in leg, head, chest, arm, waist order", () => {
  // Pinned so a "cleanup" back to eboot.hexpat's declared order fails here.
  assert.deepEqual(ARMOR_POINTER_INDEX, { leg: 0, head: 1, chest: 2, arm: 3, waist: 4 });
});

test("emitArmor (JP pointer path) gives every slot its own armor, matching the site's data", () => {
  const armor = emitArmor(buildJpFixture());
  for (const slot of ARMOR_SLOTS) assertMatchesSite(armor, slot);
});

test("emitArmor (EU signature path) gives every slot its own armor, matching the site's data", () => {
  const { buf, reader } = fixtureReader(FIXTURE_SIZE);
  for (const slot of ARMOR_SLOTS) REAL_BYTES[slot].copy(buf, EU_ARRAY_OFFSET[slot]);
  const createBase = 0x139dcc; // real EU equipmentCreate offset
  EU_TABLE_SIGNATURES.equipmentCreate!.signature.copy(buf, createBase);
  writeLeatherHelmRecipe(buf, createBase);

  const armor = emitArmor(reader, MHP2G_EU_RESOLVER);
  for (const slot of ARMOR_SLOTS) assertMatchesSite(armor, slot);
  const helm = armor.head.find((a) => a.name === "Leather Helm")!;
  assert.equal(helm.create_cost, 150);
  assert.deepEqual(helm.create_mats, [
    { name: "Disk Stone", amount: 1, type: "ore", color: "gray" },
  ]);
});

test("emitArmor reproduces the real Leather Helm entry end-to-end", () => {
  const armor = emitArmor(buildJpFixture());
  const helm = armor.head.find((a) => a.name === "Leather Helm");
  assert.ok(helm, "Leather Helm should be emitted");
  assert.equal(helm!.type, "helmet");
  assert.equal(helm!.rank, "low-rank");
  assert.equal(helm!.rarity, 1);
  assert.equal(helm!.slots, 1);
  assert.equal(helm!.defence, 2);
  assert.equal(helm!.fire_res, 2);
  assert.equal(helm!.water_res, 0);
  assert.equal(helm!.create_cost, 150); // 300 / 2
  assert.equal(helm!.sex, "Male/Female");
  assert.equal(helm!.hunter_type, "Blademaster/Gunner");
  // Caps 6/11/14/14/19/19/28: level 19 before Ukanlos, 28 after.
  assert.equal(helm!.max_defence_pre_ukanlos, 2 + 2 * 18);
  assert.equal(helm!.max_defence, 2 + 2 * 27);
  assert.deepEqual(helm!.skills, [
    { name: "Gathering", amount: 2 },
    { name: "Throw", amount: 2 },
    { name: "Backpackng", amount: 1 },
    { name: "Shot Mix", amount: 2 },
    { name: "Cooking", amount: -2 },
  ]);
  assert.deepEqual(helm!.create_mats, [
    { name: "Disk Stone", amount: 1, type: "ore", color: "gray" },
  ]);
});

test("emitArmor looks up each piece's recipe by its array index", () => {
  const { buf, reader } = fixtureReader(FIXTURE_SIZE);
  const ptrBase = tableOffset("armorValuePointers");
  for (const slot of ARMOR_SLOTS) {
    REAL_BYTES[slot].copy(buf, JP_ARRAY_OFFSET[slot]);
    buf.writeUInt32LE(
      JP_BASE_ADDRESS + JP_ARRAY_OFFSET[slot],
      ptrBase + ARMOR_POINTER_INDEX[slot] * 4,
    );
  }
  // A recipe for equipId 2 only: Leather Helm (index 1) must not pick it up.
  const off = tableOffset("equipmentCreate") + 1 * EQUIP_CREATE_ENTRY_SIZE;
  buf.writeUInt16LE(2, off + 2);
  buf.writeUInt16LE(200, off + 4);
  buf.writeUInt16LE(5, off + 6);

  const helm = emitArmor(reader).head.find((a) => a.name === "Leather Helm")!;
  assert.equal(helm.create_cost, null);
  assert.equal(helm.create_mats, null);
});

test("HunterType bits decode to sex and hunter_type", () => {
  assert.equal(sexFromHunterType(15), "Male/Female");
  assert.equal(sexFromHunterType(13), "Male"); // Red Guild Guard Suit (male)
  assert.equal(sexFromHunterType(14), "Female");
  assert.equal(sexFromHunterType(4), null);
  assert.equal(hunterTypeFromBits(15), "Blademaster/Gunner");
  assert.equal(hunterTypeFromBits(7), "Blademaster");
  assert.equal(hunterTypeFromBits(11), "Gunner");
  assert.equal(hunterTypeFromBits(3), null);
});

test("defenceAtLevel adds 2 per level above level 1", () => {
  assert.equal(defenceAtLevel(38, 36), 108); // Hunter's Helm S: 540 / 5
  assert.equal(defenceAtLevel(100, 9), 116); // Dark Ukanlos Mask, LV9
  assert.equal(defenceAtLevel(44, 12), 66); // Kirin Horn, LV12
  assert.equal(defenceAtLevel(5, 1), 5);
  assert.equal(defenceAtLevel(5, 0), 5); // dummy entries have no caps
});

test("emitArmor takes sex, hunter_type and both max defences from the struct", () => {
  const reader = buildJpFixture();
  const off = JP_ARRAY_OFFSET.chest + 1 * 40; // Leather Armor
  reader.buf.writeUInt8(10, off + 4); // HunterType: female gunner
  [1, 1, 2, 3, 7, 8, 9].forEach((cap, i) => reader.buf.writeUInt8(cap, off + 20 + i));
  reader.buf.writeInt8(100, off + 12); // defense
  const plate = emitArmor(reader).chest.find((a) => a.name === "Leather Armor")!;
  assert.equal(plate.sex, "Female");
  assert.equal(plate.hunter_type, "Gunner");
  assert.equal(plate.max_defence_pre_ukanlos, 114);
  assert.equal(plate.max_defence, 116);
});
