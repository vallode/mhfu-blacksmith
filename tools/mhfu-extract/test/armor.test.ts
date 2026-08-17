import assert from "node:assert/strict";
import { test } from "node:test";
import { JP_BASE_ADDRESS, tableOffset } from "../src/tables/offsets.js";
import { ARMOR_SLOTS, readArmorValues } from "../src/tables/armor.js";
import { fixtureReader } from "./helpers.js";

test("readArmorValues dereferences each slot's single base pointer, not per-entry pointers", () => {
  const ptrTableBase = tableOffset("armorValuePointers");
  // Put the actual armor structs well past every pointer table so nothing
  // overlaps, sized for the largest slot (head, 436 entries) since every
  // slot's pointer is set to the same region below (only head's content
  // matters for this test; the other four slots reading the same bytes is
  // harmless — we only assert on head's decoded content).
  const armStructsBase = ptrTableBase + 0x10000;
  const { buf, reader } = fixtureReader(armStructsBase + 436 * 40);
  for (let slot = 0; slot < 5; slot++) {
    buf.writeUInt32LE(armStructsBase + JP_BASE_ADDRESS, ptrTableBase + slot * 4);
  }

  const off = armStructsBase + 1 * 40; // second head armor piece
  buf.writeUInt16LE(6, off + 0); // maleId
  buf.writeUInt16LE(26, off + 2); // femaleId
  buf.writeUInt8(15, off + 4); // hunterType
  buf.writeUInt8(0, off + 5); // rarity
  buf.writeUInt16LE(0, off + 6); // unkn1
  buf.writeUInt32LE(300, off + 8); // price
  buf.writeInt8(2, off + 12); // defense
  buf.writeInt8(1, off + 13); // fireRes
  buf.writeInt8(-1, off + 14); // waterRes
  buf.writeInt8(0, off + 15); // thunderRes
  buf.writeInt8(0, off + 16); // dragonRes
  buf.writeInt8(0, off + 17); // iceRes
  buf.writeUInt8(1, off + 18); // slots
  buf.writeUInt8(0, off + 19); // colorSeries
  for (let i = 0; i < 7; i++) buf.writeUInt8(0, off + 20 + i); // sphereCaps
  buf.writeUInt8(0, off + 27); // unkn2
  buf.writeUInt16LE(0, off + 28); // unkn3
  buf.writeUInt8(10, off + 30); // skill 0
  buf.writeInt8(3, off + 31); // amount 0

  const armor = readArmorValues(reader);
  assert.deepEqual(Object.keys(armor), [...ARMOR_SLOTS]);

  const head1 = armor.head[1]!;
  assert.equal(head1.maleId, 6);
  assert.equal(head1.femaleId, 26);
  assert.equal(head1.price, 300);
  assert.equal(head1.defense, 2);
  assert.deepEqual(head1.resistances, { fire: 1, water: -1, thunder: 0, dragon: 0, ice: 0 });
  assert.equal(head1.slots, 1);
  assert.deepEqual(head1.skills[0], { skill: 10, amount: 3 });
});
