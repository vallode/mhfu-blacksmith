import assert from "node:assert/strict";
import { test } from "node:test";
import { emitArmor } from "../src/emit/armor.js";
import { ARMOR_ENTRY_SIZE, EQUIP_CREATE_ENTRY_SIZE, JP_BASE_ADDRESS, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

const HEAD_ARRAY_OFFSET = 0x180000;
const CHEST_ARRAY_OFFSET = 0x190000;
const ARM_ARRAY_OFFSET = 0x1a0000;
const WAIST_ARRAY_OFFSET = 0x1b0000;
const LEG_ARRAY_OFFSET = 0x1c0000;

/**
 * Reproduces the real byte layout for head armor index 1 ("Leather Helm")
 * against a real decrypted JP EBOOT — see emit/armor.ts's derivation notes —
 * as a regression fixture. Only exercises the transform pipeline (raw bytes
 * -> schema shape); the committed data/armor/helmet.json entry for this name
 * disagrees on skills specifically (see emit/armor.ts's module doc), so this
 * fixture asserts against the *raw* values, not the committed file.
 */
function buildLeatherHelmFixture() {
  // emitArmor() eagerly reads every armor slot's full array plus the whole
  // EquipCreate table, so the buffer needs to cover everything it touches.
  const { buf, reader } = fixtureReader(0x200000);

  const ptrBase = tableOffset("armorValuePointers");
  buf.writeUInt32LE(JP_BASE_ADDRESS + HEAD_ARRAY_OFFSET, ptrBase + 0);
  buf.writeUInt32LE(JP_BASE_ADDRESS + CHEST_ARRAY_OFFSET, ptrBase + 4);
  buf.writeUInt32LE(JP_BASE_ADDRESS + ARM_ARRAY_OFFSET, ptrBase + 8);
  buf.writeUInt32LE(JP_BASE_ADDRESS + WAIST_ARRAY_OFFSET, ptrBase + 12);
  buf.writeUInt32LE(JP_BASE_ADDRESS + LEG_ARRAY_OFFSET, ptrBase + 16);

  // ArmorValues.head[1] — real "Leather Helm" bytes.
  const aOff = HEAD_ARRAY_OFFSET + 1 * ARMOR_ENTRY_SIZE;
  buf.writeUInt8(0, aOff + 5); // Rarity (raw) -> display rarity 1
  buf.writeUInt32LE(300, aOff + 8); // Price
  buf.writeInt8(2, aOff + 12); // Defense
  buf.writeInt8(2, aOff + 13); // Fire resistance
  buf.writeUInt8(1, aOff + 18); // Slots
  buf.writeUInt8(52, aOff + 30); // Skill[0] = Gathering
  buf.writeInt8(3, aOff + 31); // Skill[0].amount
  buf.writeUInt8(19, aOff + 32); // Skill[1] = Throw
  buf.writeInt8(2, aOff + 33); // Skill[1].amount

  // EquipmentCreateTable.head — real "Leather Helm" recipe (equipId=1
  // identifies the armor piece; array position doesn't need to match).
  const cOff = tableOffset("equipmentCreate") + 0 * EQUIP_CREATE_ENTRY_SIZE;
  buf.writeUInt16LE(1, cOff + 2); // EquipID
  buf.writeUInt16LE(201, cOff + 4); // Craft[0].Item = "Disk Stone"
  buf.writeUInt16LE(1, cOff + 6); // Craft[0].Quantity

  return reader;
}

test("emitArmor reproduces the real Leather Helm entry end-to-end", () => {
  const reader = buildLeatherHelmFixture();
  const armor = emitArmor(reader);
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
  assert.deepEqual(helm!.skills, [
    { name: "Gathering", amount: 3 },
    { name: "Throw", amount: 2 },
  ]);
  assert.deepEqual(helm!.create_mats, [{ name: "Disk Stone", amount: 1, type: "ore", color: "gray" }]);
});
