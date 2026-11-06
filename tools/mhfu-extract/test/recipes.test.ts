import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EQUIP_CREATE_ENTRY_SIZE,
  EQUIP_UPGRADE_ENTRY_SIZE,
  TABLE_COUNTS,
  tableOffset,
} from "../src/tables/offsets.js";
import { invertUpgradeTree, readEquipmentCreate, readEquipmentUpgrade } from "../src/tables/recipes.js";
import { fixtureReader } from "./helpers.js";

// Total EquipCreate entries across every EquipmentCreateTable section, plus
// the two hidden u16 TERM fields and two hidden NullCreate<0>[1] entries —
// this must match the real gap to the next table exactly (see recipes.ts).
const CREATE_SECTION_COUNTS = [437, 435, 426, 424, 434, 131, 117, 131, 124, 8, 135, 107, 61, 2, 192];
const CREATE_TOTAL_BYTES =
  CREATE_SECTION_COUNTS.reduce((a, b) => a + b, 0) * EQUIP_CREATE_ENTRY_SIZE + 2 * 2 + 2 * EQUIP_CREATE_ENTRY_SIZE;

test("readEquipmentCreate lays out every section with the documented counts", () => {
  const { reader } = fixtureReader(tableOffset("equipmentCreate") + CREATE_TOTAL_BYTES);
  const create = readEquipmentCreate(reader);
  assert.equal(create.head.length, 437);
  assert.equal(create.chest.length, 435);
  assert.equal(create.arm.length, 426);
  assert.equal(create.waist.length, 424);
  assert.equal(create.leg.length, 434);
  assert.equal(create.greatSwordLongSword.length, 131);
  assert.equal(create.lanceGunlance.length, 117);
  assert.equal(create.swordAndShieldDualBlades.length, 131);
  assert.equal(create.hammerHuntingHorn.length, 124);
  assert.equal(create.ancientRustBlademaster.length, 8);
  assert.equal(create.lightBowgun.length, 135);
  assert.equal(create.heavyBowgun.length, 107);
  assert.equal(create.bow.length, 61);
  assert.equal(create.ancientRustGunner.length, 2);
  assert.equal(create.decoration.length, 192);
});

test("readEquipmentCreate decodes an entry's crafting materials and equipId", () => {
  const base = tableOffset("equipmentCreate");
  const { buf, reader } = fixtureReader(base + CREATE_TOTAL_BYTES);

  const off = base + 1 * EQUIP_CREATE_ENTRY_SIZE; // head[1]
  buf.writeUInt8(1, off + 0); // Type (EquipTypeID.Head)
  buf.writeUInt8(1, off + 1); // Hide
  buf.writeUInt16LE(1, off + 2); // EquipID
  buf.writeUInt16LE(201, off + 4); // Craft[0].Item
  buf.writeUInt16LE(1, off + 6); // Craft[0].Quantity
  buf.writeUInt32LE(0, off + 20); // Unkn
  buf.writeUInt16LE(1, off + 24); // Unkn2

  const create = readEquipmentCreate(reader);
  assert.deepEqual(create.head[1], {
    index: 1,
    hide: true,
    equipId: 1,
    craft: [
      { itemId: 201, quantity: 1 },
      { itemId: 0, quantity: 0 },
      { itemId: 0, quantity: 0 },
      { itemId: 0, quantity: 0 },
    ],
    unkn: 0,
    unkn2: 1,
  });
});

const UPGRADE_TOTAL_BYTES =
  (1 + TABLE_COUNTS.weaponsBlademaster + TABLE_COUNTS.weaponsGunner + 7) * EQUIP_UPGRADE_ENTRY_SIZE + 49 * 4;

test("readEquipmentUpgrade lays out every section with the documented counts", () => {
  const { reader } = fixtureReader(tableOffset("equipmentUpgrade") + UPGRADE_TOTAL_BYTES);
  const upgrade = readEquipmentUpgrade(reader);
  assert.equal(upgrade.blademaster.length, TABLE_COUNTS.weaponsBlademaster);
  assert.equal(upgrade.gunner.length, TABLE_COUNTS.weaponsGunner);
  assert.equal(upgrade.armorSphere.length, 7);
});

test("readEquipmentUpgrade decodes crafting materials and upgrade targets, skipping the hidden dummy slot", () => {
  const base = tableOffset("equipmentUpgrade");
  const { buf, reader } = fixtureReader(base + UPGRADE_TOTAL_BYTES);

  // blademaster[1] is the second entry overall, right after the hidden
  // NullUpgrade[1] dummy.
  const off = base + EQUIP_UPGRADE_ENTRY_SIZE + 1 * EQUIP_UPGRADE_ENTRY_SIZE;
  buf.writeUInt16LE(206, off + 0);
  buf.writeUInt16LE(3, off + 2);
  buf.writeUInt16LE(2, off + 16); // Upgrade1 -> weapon 2
  buf.writeUInt16LE(489, off + 18); // Upgrade2 -> weapon 489
  buf.writeUInt16LE(0, off + 20); // Upgrade3 unused

  const upgrade = readEquipmentUpgrade(reader);
  const entry = upgrade.blademaster[1]!;
  assert.equal(entry.index, 1);
  assert.deepEqual(entry.craft[0], { itemId: 206, quantity: 3 });
  assert.deepEqual(entry.upgradeTargets, [2, 489, 0, 0, 0]);
});

test("invertUpgradeTree reverses the upgrade graph and ignores unused (0) targets", () => {
  const entries = [
    { index: 1, craft: [], upgradeTargets: [2, 489, 0, 0, 0] },
    { index: 5, craft: [], upgradeTargets: [2, 0, 0, 0, 0] },
    { index: 2, craft: [], upgradeTargets: [0, 0, 0, 0, 0] },
  ];
  const inverted = invertUpgradeTree(entries);
  assert.deepEqual(inverted.get(2), [1, 5]);
  assert.deepEqual(inverted.get(489), [1]);
  assert.equal(inverted.get(0), undefined);
  assert.equal(inverted.has(1), false);
});
