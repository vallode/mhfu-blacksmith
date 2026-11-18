import assert from "node:assert/strict";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import { cropImage } from "../src/cli/item-icons.js";
import type { TmhImage } from "../src/models/tmh.js";
import {
  ITEM_COLOR_COUNT,
  ITEM_ICON_COUNT,
  readItemColors,
  readItemIconRects,
} from "../src/tables/item-icons.js";
import type { TableAddressResolver } from "../src/tables/resolver.js";

const SPRITES = 0x10;
const SPRITE_INDEX = 0x300;
const PALETTE = 0x400;
const resolver: TableAddressResolver = {
  resolve: (table) =>
    table === "uiSpriteTable" ? SPRITES : table === "itemIconSpriteIndex" ? SPRITE_INDEX : PALETTE,
};

test("readItemIconRects finds each icon shape through the 16x16 sprite list", () => {
  const buf = Buffer.alloc(0x1000);
  const putSprite = (sprite: number, values: number[]) =>
    values.forEach((v, i) => buf.writeUInt16LE(v, SPRITES + sprite * 12 + i * 2));
  // The 16x16 list follows the 24x24 list of 56 u16s; 24x24 sprites go unread.
  const smallList = SPRITE_INDEX + 56 * 2;
  buf.writeUInt16LE(186, smallList); // shape 0
  buf.writeUInt16LE(5, SPRITE_INDEX); // the 24x24 list's shape 0, ignored
  buf.writeUInt16LE(40, smallList + 43 * 2); // shape 43, the jewels', out of sequence
  putSprite(186, [192, 0, 16, 16, 0x8000, 11]);
  putSprite(5, [24, 0, 24, 24, 0x8000, 11]);
  putSprite(40, [208, 176, 16, 16, 0x8000, 11]);

  const rects = readItemIconRects(new BinaryReader(buf), resolver);
  assert.equal(rects.length, ITEM_ICON_COUNT);
  assert.deepEqual(rects[0], { x: 192, y: 0, width: 16, height: 16 });
  assert.deepEqual(rects[43], { x: 208, y: 176, width: 16, height: 16 });
});

test("readItemColors reads R, G, B of each u32 as a hex colour", () => {
  const buf = Buffer.alloc(0x800);
  Buffer.from("ffffff01ff5d5d0173cb8d01", "hex").copy(buf, PALETTE);
  Buffer.from("a0a0a001", "hex").copy(buf, PALETTE + 10 * 4);

  const colors = readItemColors(new BinaryReader(buf), resolver);
  assert.equal(colors.length, ITEM_COLOR_COUNT);
  assert.deepEqual(colors.slice(0, 3), ["#ffffff", "#ff5d5d", "#73cb8d"]);
  assert.equal(colors[10], "#a0a0a0");
});

test("cropImage copies one rectangle out of an image", () => {
  const rgba = Buffer.alloc(4 * 4 * 4);
  const mark = (x: number, y: number, v: number) => rgba.writeUInt8(v, (y * 4 + x) * 4);
  mark(1, 1, 11);
  mark(2, 1, 12);
  mark(1, 2, 21);
  mark(2, 2, 22);
  const image: TmhImage = { width: 4, height: 4, rgba, hasAlpha: false };

  const out = cropImage(image, { x: 1, y: 1, width: 2, height: 2 });
  assert.equal(out.length, 2 * 2 * 4);
  assert.deepEqual([out[0], out[4], out[8], out[12]], [11, 12, 21, 22]);
});
