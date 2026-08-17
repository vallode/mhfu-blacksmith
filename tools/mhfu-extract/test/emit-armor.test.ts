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

/**
 * Reproduces real head[11]/head[12] bytes (see
 * `test/armor-index-corrections.test.ts` for the fingerprint verification
 * that established these are the correct real values) to exercise the
 * armor-index-correction overlay end-to-end through `emitArmor()`: raw
 * position 12's stats should surface as "Vespoid Helm" (the corrected name,
 * index 11) rather than "Vespoid Cap" (its own raw position's name), and
 * raw position 11 — whose own stats don't match "Vespoid Cap" either —
 * should be suppressed (not emitted under a name known to be wrong).
 */
function buildVespoidFixture() {
  const { buf, reader } = fixtureReader(0x200000);

  const ptrBase = tableOffset("armorValuePointers");
  buf.writeUInt32LE(JP_BASE_ADDRESS + HEAD_ARRAY_OFFSET, ptrBase + 0);
  buf.writeUInt32LE(JP_BASE_ADDRESS + CHEST_ARRAY_OFFSET, ptrBase + 4);
  buf.writeUInt32LE(JP_BASE_ADDRESS + ARM_ARRAY_OFFSET, ptrBase + 8);
  buf.writeUInt32LE(JP_BASE_ADDRESS + WAIST_ARRAY_OFFSET, ptrBase + 12);
  buf.writeUInt32LE(JP_BASE_ADDRESS + LEG_ARRAY_OFFSET, ptrBase + 16);

  // ArmorValues.head[11] — real bytes, does NOT match "Vespoid Cap"'s stats.
  const off11 = HEAD_ARRAY_OFFSET + 11 * ARMOR_ENTRY_SIZE;
  buf.writeUInt8(1, off11 + 5); // Rarity (raw) -> display rarity 2
  buf.writeUInt32LE(3800, off11 + 8); // Price
  buf.writeInt8(18, off11 + 12); // Defense
  buf.writeUInt8(2, off11 + 18); // Slots

  // ArmorValues.head[12] — real bytes, exactly match committed
  // "Vespoid Helm" (name index 11), not "Vespoid Cap" (name index 12).
  const off12 = HEAD_ARRAY_OFFSET + 12 * ARMOR_ENTRY_SIZE;
  buf.writeUInt8(2, off12 + 5); // Rarity (raw) -> display rarity 3
  buf.writeUInt32LE(2300, off12 + 8); // Price
  buf.writeInt8(20, off12 + 12); // Defense
  buf.writeInt8(-6, off12 + 13); // Fire resistance
  buf.writeInt8(-5, off12 + 14); // Water resistance
  buf.writeInt8(2, off12 + 15); // Thunder resistance
  buf.writeInt8(2, off12 + 16); // Dragon resistance
  buf.writeInt8(-4, off12 + 17); // Ice resistance
  buf.writeUInt8(1, off12 + 18); // Slots

  return reader;
}

test("emitArmor applies the fingerprint-based index correction and suppression", () => {
  const reader = buildVespoidFixture();
  const armor = emitArmor(reader);

  const vespoidHelm = armor.head.find((a) => a.name === "Vespoid Helm");
  assert.ok(vespoidHelm, "raw head[12]'s stats should surface as 'Vespoid Helm' via the correction");
  assert.equal(vespoidHelm!.defence, 20);
  assert.equal(vespoidHelm!.fire_res, -6);
  assert.equal(vespoidHelm!.rarity, 3);

  assert.ok(
    !armor.head.some((a) => a.defence === 18 && a.rarity === 2),
    "raw head[11]'s stats must not be emitted under any name — it should be suppressed"
  );
});

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
