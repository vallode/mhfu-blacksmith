import assert from "node:assert/strict";
import { test } from "node:test";
import { formatShopScan, scanForShops, SHOP_ANCHORS } from "../src/research/shop-scan.js";

test("shop-scan finds a planted shop list among noise and ranks it first", () => {
  const buf = Buffer.alloc(64 * 1024);
  for (let i = 0; i < buf.length; i++) buf[i] = (i * 2654435761) >>> 24; // noise
  // A list of 8-byte records: u16 unlock flag, u16 item, u32 price. Shop items plus a few others.
  const shop = [7, 8, 11, 21, 22, 64, 97, 144, 149, 151, 153, 300, 301];
  const at = 0x4000;
  shop.forEach((item, i) => {
    buf.writeUInt16LE(i % 3, at + i * 8);
    buf.writeUInt16LE(item, at + i * 8 + 2);
    buf.writeUInt32LE(100 + i * 10, at + i * 8 + 4);
  });
  buf.writeUInt16LE(0xffff, at + shop.length * 8 + 2);
  buf.writeUInt32LE(0xdeadbeef, at + shop.length * 8 + 8); // break the run after the terminator

  const [best] = scanForShops([{ name: "test.ovl", buf }]);
  assert.ok(best);
  assert.equal(best.file, "test.ovl");
  // The item column, wherever the record is taken to start.
  assert.equal(best.offset + best.field, at + 2);
  assert.equal(best.stride, 8);
  assert.equal(best.anchors, SHOP_ANCHORS.size - 1, "every anchor but Iron Pickaxe");
  assert.deepEqual(best.items.slice(0, shop.length), shop);
  assert.match(formatShopScan([best]), /Potion \(7\), Mega Potion \(8\)/);
});
