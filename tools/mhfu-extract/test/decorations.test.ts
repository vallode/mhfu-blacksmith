import assert from "node:assert/strict";
import { test } from "node:test";
import { readDecorationSkills, readDecorationValues } from "../src/tables/decorations.js";
import { DECO_SKILL_ENTRY_SIZE, ITEM_ENTRY_SIZE, TABLE_COUNTS, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

test("readDecorationValues decodes fields at the documented byte offsets", () => {
  const base = tableOffset("decorationValues");
  const { buf, reader } = fixtureReader(base + TABLE_COUNTS.decorations * ITEM_ENTRY_SIZE);

  const off = base + 2 * ITEM_ENTRY_SIZE;
  buf.writeUInt16LE(0, off + 0); // unkn1
  buf.writeUInt8(3, off + 2); // rarity
  buf.writeUInt8(1, off + 3); // stackLimit
  buf.writeUInt8(0, off + 4); // iconDeco
  buf.writeUInt8(5, off + 5); // iconId
  buf.writeUInt8(2, off + 6); // color
  buf.writeUInt8(0, off + 7); // unkn2
  buf.writeUInt32LE(0, off + 8); // unkn3
  buf.writeUInt32LE(1500, off + 12); // price
  buf.writeUInt16LE(0, off + 16);
  buf.writeUInt16LE(0, off + 18);
  buf.writeUInt16LE(0, off + 20);
  buf.writeUInt16LE(7, off + 22); // skillTblId

  const decos = readDecorationValues(reader);
  assert.equal(decos.length, TABLE_COUNTS.decorations);
  assert.equal(decos[2]!.rarity, 3);
  assert.equal(decos[2]!.price, 1500);
  assert.equal(decos[2]!.skillTblId, 7);
});

test("readDecorationSkills skips the hidden dummy slot and reads 168 real entries", () => {
  const dummyBase = tableOffset("decorationSkills");
  const base = dummyBase + DECO_SKILL_ENTRY_SIZE;
  const { buf, reader } = fixtureReader(base + (TABLE_COUNTS.decorations - 1) * DECO_SKILL_ENTRY_SIZE);

  const off = base + 0;
  buf.writeUInt8(1, off + 0); // reqSlots
  buf.writeUInt8(0x0f, off + 1); // unkn1 (documented as "always 0x0F")
  buf.writeUInt16LE(0, off + 2);
  buf.writeUInt32LE(10, off + 4); // unkn3
  buf.writeUInt8(20, off + 8); // skill 0
  buf.writeInt8(2, off + 9); // amount 0
  buf.writeUInt8(0, off + 10);
  buf.writeInt8(0, off + 11);
  buf.writeUInt8(0, off + 12);
  buf.writeInt8(0, off + 13);
  buf.writeUInt16LE(0, off + 14); // term

  const skills = readDecorationSkills(reader);
  assert.equal(skills.length, TABLE_COUNTS.decorations - 1);
  assert.equal(skills[0]!.reqSlots, 1);
  assert.equal(skills[0]!.unkn1, 0x0f);
  assert.deepEqual(skills[0]!.skills[0], { skill: 20, amount: 2 });
});
