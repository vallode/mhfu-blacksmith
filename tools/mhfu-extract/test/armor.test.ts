import assert from "node:assert/strict";
import { test } from "node:test";
import { JP_BASE_ADDRESS, tableOffset } from "../src/tables/offsets.js";
import { ARMOR_POINTER_INDEX, ARMOR_SLOT_COUNTS, ARMOR_SLOT_TABLE_NAMES, ARMOR_SLOTS, readArmorValues } from "../src/tables/armor.js";
import { SignatureResolver } from "../src/tables/resolver.js";
import { fixtureReader } from "./helpers.js";

test("readArmorValues dereferences each slot's single base pointer, not per-entry pointers", () => {
  const ptrTableBase = tableOffset("armorValuePointers");
  // One shared array for every pointer: only head's decoded content is
  // asserted on here. Sized for the largest slot (head, 436 entries).
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

test("readArmorValues follows ArmorValuePTR's real pointer order (leg, head, chest, arm, waist) with per-slot counts", () => {
  const ptrTableBase = tableOffset("armorValuePointers");
  const arrayBase = (pointer: number) => ptrTableBase + 0x10000 + pointer * 0x5000;
  const { buf, reader } = fixtureReader(arrayBase(5));
  for (let pointer = 0; pointer < 5; pointer++) {
    buf.writeUInt32LE(arrayBase(pointer) + JP_BASE_ADDRESS, ptrTableBase + pointer * 4);
    // Mark entry 1 of each array with its pointer position via `price`.
    buf.writeUInt32LE(1000 + pointer, arrayBase(pointer) + 1 * 40 + 8);
  }

  const armor = readArmorValues(reader);
  for (const slot of ARMOR_SLOTS) {
    assert.equal(armor[slot][1]!.price, 1000 + ARMOR_POINTER_INDEX[slot], `${slot} read the wrong pointer`);
    assert.equal(armor[slot].length, ARMOR_SLOT_COUNTS[slot]);
  }
  assert.equal(armor.leg[1]!.price, 1000); // first pointer
  assert.equal(armor.head[1]!.price, 1001); // second pointer
  assert.deepEqual(
    Object.fromEntries(ARMOR_SLOTS.map((slot) => [slot, armor[slot].length])),
    { head: 436, chest: 420, arm: 411, waist: 409, leg: 420 }
  );
});

test("readArmorValues(reader, resolver) resolves each slot's array directly via ARMOR_SLOT_TABLE_NAMES, bypassing the pointer table entirely", () => {
  // Put each slot's array at a distinct, resolver-only-known location — no
  // armorValuePointers pointer table is written into this fixture at all,
  // proving the resolver path never dereferences one. A distinct marker
  // u32 at each slot's base (used only as the signature to search for)
  // keeps the 5 slots from being ambiguous with each other.
  // Spaced far enough apart that even the largest real slot count (head,
  // 436 entries * 40 bytes ~= 0x4420) can't spill into the next slot's base.
  const slotBases: Record<string, number> = {
    head: 0x10000,
    chest: 0x20000,
    arm: 0x30000,
    waist: 0x40000,
    leg: 0x50000,
  };
  const { buf, reader } = fixtureReader(0x60000);
  const markers: Record<string, number> = { head: 0xaaaa0001, chest: 0xbbbb0002, arm: 0xcccc0003, waist: 0xdddd0004, leg: 0xeeee0005 };
  for (const [slot, base] of Object.entries(slotBases)) buf.writeUInt32LE(markers[slot]!, base);

  const off = slotBases.chest! + 1 * 40; // second chest armor piece
  buf.writeUInt16LE(7, off + 0); // maleId
  buf.writeUInt8(0, off + 5); // rarity
  buf.writeUInt32LE(600, off + 8); // price
  buf.writeInt8(4, off + 12); // defense

  const resolver = new SignatureResolver(
    Object.fromEntries(
      Object.entries(slotBases).map(([slot, base]) => [
        ARMOR_SLOT_TABLE_NAMES[slot as keyof typeof ARMOR_SLOT_TABLE_NAMES],
        { signature: buf.subarray(base, base + 4), signatureOffset: 0 },
      ])
    )
  );

  const armor = readArmorValues(reader, resolver);
  assert.deepEqual(Object.keys(armor), [...ARMOR_SLOTS]);
  const chest1 = armor.chest[1]!;
  assert.equal(chest1.maleId, 7);
  assert.equal(chest1.price, 600);
  assert.equal(chest1.defense, 4);
});
