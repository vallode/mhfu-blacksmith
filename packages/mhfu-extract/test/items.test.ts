import assert from "node:assert/strict";
import { test } from "node:test";
import { emitItems } from "../src/emit/items.js";
import { readItemTable } from "../src/tables/items.js";
import { ITEM_ENTRY_SIZE, TABLE_COUNTS, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

test("readItemTable reads one entry per ItemID, decorations and later items included", () => {
  const { reader } = fixtureReader(tableOffset("itemTable") + TABLE_COUNTS.items * ITEM_ENTRY_SIZE);
  const items = readItemTable(reader);
  assert.equal(items.length, 1261);
  assert.equal(items.at(-1)!.index, 1260);
});

test("readItemTable decodes fields at the documented byte offsets", () => {
  const base = tableOffset("itemTable");
  const { buf, reader } = fixtureReader(base + TABLE_COUNTS.items * ITEM_ENTRY_SIZE);

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

test("emitItems writes each named item's display rarity, carry limit and price", () => {
  const base = tableOffset("itemTable");
  const { buf, reader } = fixtureReader(base + TABLE_COUNTS.items * ITEM_ENTRY_SIZE);
  // Potion's and Giadrome Jewel's (past the decorations) real EU records.
  Buffer.from("0001000a0018020000000000420000000700000000000000", "hex").copy(
    buf,
    base + 7 * ITEM_ENTRY_SIZE,
  );
  Buffer.from("010007011001030000000300983a00000000000000000000", "hex").copy(
    buf,
    base + 1116 * ITEM_ENTRY_SIZE,
  );

  const items = emitItems(reader);
  assert.equal(items[0]!.id, 1, "ID 0 (None) has no name");
  assert.equal(items.length, 1260);
  assert.deepEqual(
    items.find((i) => i.id === 7),
    { id: 7, name: "Potion", rarity: 1, carry: 10, price: 66 },
  );
  assert.deepEqual(
    items.find((i) => i.id === 1116),
    { id: 1116, name: "Giadrome Jewel", rarity: 8, carry: 1, price: 15000 },
  );
});
