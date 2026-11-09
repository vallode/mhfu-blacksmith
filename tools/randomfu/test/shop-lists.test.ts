import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOvl } from "../../mhfu-extract/src/container/ovl.js";
import { findItemLists, formatShopLists, mapShopLists } from "../src/research/shop-lists.js";

const LOAD = 0x09c00000;

function ovl(): Buffer {
  const buf = Buffer.alloc(0x2000);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(LOAD, 8);
  buf.fill(0xee, 0x80);
  const put = (at: number, items: number[]) => {
    items.forEach((v, i) => buf.writeUInt16LE(v, at + i * 2));
    buf.writeUInt16LE(0, at + items.length * 2);
  };
  // Two general store stages (the second longer), then an ammo-only list with no shop anchors.
  put(0x1000, [163, 7, 11, 153, 21, 22, 144, 145]);
  put(0x1020, [163, 7, 11, 153, 21, 22, 144, 145, 100]);
  put(0x1040, [96, 97, 99, 102]);
  // A pointer table: { u32 condition, u32 list } x 3.
  [
    [0, 0x1000],
    [5, 0x1020],
    [0, 0x1040],
  ].forEach(([cond, list], i) => {
    buf.writeUInt32LE(cond!, 0x1800 + i * 8);
    buf.writeUInt32LE(LOAD + list!, 0x1804 + i * 8);
  });
  return buf;
}

test("findItemLists reads 0-terminated item lists and nothing else", () => {
  const lists = findItemLists(ovl());
  assert.deepEqual(
    lists.map((l) => [l.offset, l.items.length]),
    [
      [0x1000, 8],
      [0x1020, 9],
      [0x1040, 4],
    ],
  );
});

test("mapShopLists finds the lists around the shop and the pointers to them", () => {
  const report = mapShopLists(parseOvl(ovl()));
  assert.equal(report.lists.length, 3, "the ammo list is found next to the store's");
  assert.deepEqual(
    report.pointers.map((p) => [p.at, p.target]),
    [
      [0x1804, 0x1000],
      [0x180c, 0x1020],
      [0x1814, 0x1040],
    ],
  );
  assert.match(report.pointers[1]!.context, /00000005 \[09c01020\]/);
  assert.match(formatShopLists(report), /0x1020: 9 items, 7 shop items/);
});
