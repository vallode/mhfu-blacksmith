import assert from "node:assert/strict";
import { test } from "node:test";
import { dumpArmorRaw } from "../src/emit/armor-raw.js";
import { ARMOR_POINTER_INDEX, ARMOR_SLOT_COUNTS } from "../src/tables/armor.js";
import { JP_BASE_ADDRESS, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

test("dumpArmorRaw writes every struct byte plus flattened fields and names", () => {
  const ptrTableBase = tableOffset("armorValuePointers");
  const arrayBase = (pointer: number) => ptrTableBase + 0x10000 + pointer * 0x5000;
  const { buf, reader } = fixtureReader(arrayBase(5) + 0x2000);
  for (let p = 0; p < 5; p++)
    buf.writeUInt32LE(arrayBase(p) + JP_BASE_ADDRESS, ptrTableBase + p * 4);

  const head1 = arrayBase(ARMOR_POINTER_INDEX.head) + 1 * 40;
  buf.writeUInt16LE(6, head1 + 0); // maleId
  buf.writeUInt8(3, head1 + 4); // hunterType
  buf.writeInt8(2, head1 + 12); // defense
  buf.writeUInt8(7, head1 + 26); // truMax
  buf.writeUInt8(10, head1 + 30); // skill 0
  buf.writeInt8(-2, head1 + 31); // amount 0

  const dump = dumpArmorRaw(reader);
  assert.equal(dump.arrayOffsets.head, arrayBase(ARMOR_POINTER_INDEX.head));
  const piece = dump.pieces.find((p) => p.slot === "head" && p.index === 1)!;
  assert.equal(piece.name, "Leather Helm");
  assert.equal(piece.bytes.length, 40);
  assert.equal(piece.bytes[31], 0xfe);
  assert.equal(piece.fields.maleId, 6);
  assert.equal(piece.fields.hunterType, 3);
  assert.equal(piece.fields.defense, 2);
  assert.equal(piece.fields.cap_truMax, 7);
  assert.equal(piece.fields.skill0, 10);
  assert.equal(piece.fields.skill0_amount, -2);
  assert.ok(!("index" in piece.fields));

  const total = Object.values(ARMOR_SLOT_COUNTS).reduce((a, b) => a + b, 0);
  assert.equal(dump.pieces.length, total);
  assert.equal(dump.sphereUpgrades.entries.length, 7);
  assert.equal(dump.equipUpgradeUnknown.u32.length, 49);
  assert.deepEqual(
    dump.windows.map((w) => w.label),
    [
      "after-head",
      "after-chest",
      "after-arm",
      "after-waist",
      "after-leg",
      "before-head",
      "after-sphere-upgrades",
    ],
  );
});
