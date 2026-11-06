import assert from "node:assert/strict";
import { test } from "node:test";
import { readItemTable } from "../src/tables/items.js";
import { ITEM_ENTRY_SIZE, TABLE_COUNTS, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

test("readItemTable reads exactly the regular (non-decoration) item count", () => {
  const { reader } = fixtureReader(tableOffset("itemTable") + TABLE_COUNTS.regularItems * ITEM_ENTRY_SIZE);
  const items = readItemTable(reader);
  assert.equal(items.length, 948);
});

test("readItemTable decodes fields at the documented byte offsets", () => {
  const base = tableOffset("itemTable");
  const { buf, reader } = fixtureReader(base + TABLE_COUNTS.regularItems * ITEM_ENTRY_SIZE);

  // index 7, matching the real Potion entry's shape (stackLimit=10, price=66).
  const off = base + 7 * ITEM_ENTRY_SIZE;
  buf.writeUInt8(4, off + 2); // rarity
  buf.writeUInt8(10, off + 3); // stackLimit
  buf.writeUInt8(24, off + 5); // iconId
  buf.writeUInt8(2, off + 6); // color
  buf.writeUInt32LE(66, off + 12); // price

  const items = readItemTable(reader);
  const potion = items[7]!;
  assert.equal(potion.index, 7);
  assert.equal(potion.rarity, 4);
  assert.equal(potion.stackLimit, 10);
  assert.equal(potion.iconId, 24);
  assert.equal(potion.color, 2);
  assert.equal(potion.price, 66);
});
