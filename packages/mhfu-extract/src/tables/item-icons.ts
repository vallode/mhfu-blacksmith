/**
 * The two EBOOT tables behind `itemTable`'s icon fields (`tables/items.ts`):
 * where each icon shape sits in the UI's sprite atlas, and the colours items
 * are tinted with.
 *
 * None are named in `eboot.hexpat`; the game's own drawing code (EU vaddr
 * 0x0882e10c and 0x088303b8) showed how they fit together:
 *
 * - `itemIconSpriteIndex` is two u16 lists of 56, by `ItemEntry.iconId`: one
 *   for the 24x24 icons and, 112 bytes on, one for the 16x16 icons. They
 *   index the sprite table below. Shapes 0-38 are consecutive; the rest
 *   jump around, and the shapes no item uses point at shape 33's "?".
 * - `uiSpriteTable` holds every UI sprite as 12 bytes: u16 x, y, width,
 *   height, then two u16s selecting a texture and blend. `cockpit/cock.tmh`'s
 *   first image holds the item icons.
 * - `itemColorPalette` is 11 u32s, by `ItemEntry.color`, bytes R, G, B and
 *   1: white, red, green, blue, yellow, purple, cyan, orange, pink, an empty
 *   slot no item uses, and gray. The atlas is drawn in grays and the game
 *   tints it with the colour.
 *
 * JP's addresses aren't known, so these need a resolver that has them (EU's).
 */
import { BinaryReader } from "../binary/reader.js";
import type { TableAddressResolver } from "./resolver.js";

/** Icon shapes, `ItemEntry.iconId` 0 through 55. */
export const ITEM_ICON_COUNT = 56;
export const ITEM_COLOR_COUNT = 11;
const SPRITE_ENTRY_SIZE = 12;
/** Bytes from the 24x24 list to the 16x16 one in `itemIconSpriteIndex`. */
const SMALL_ICON_LIST = ITEM_ICON_COUNT * 2;

/** The file under `data-bin/` that holds the icon atlas, and its image index. */
export const ITEM_ICON_ATLAS = { file: "cockpit/cock.tmh", image: 0 } as const;

export interface IconRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The 16x16 atlas rectangle of each icon shape, by `ItemEntry.iconId`. */
export function readItemIconRects(
  reader: BinaryReader,
  resolver: TableAddressResolver,
): IconRect[] {
  const sprites = resolver.resolve("uiSpriteTable", reader.buf);
  const list = resolver.resolve("itemIconSpriteIndex", reader.buf) + SMALL_ICON_LIST;
  return Array.from({ length: ITEM_ICON_COUNT }, (_, i) => {
    const off = sprites + reader.u16(list + i * 2) * SPRITE_ENTRY_SIZE;
    return {
      x: reader.u16(off),
      y: reader.u16(off + 2),
      width: reader.u16(off + 4),
      height: reader.u16(off + 6),
    };
  });
}

/** The item colour palette as `#rrggbb`, by `ItemEntry.color`. */
export function readItemColors(reader: BinaryReader, resolver: TableAddressResolver): string[] {
  const base = resolver.resolve("itemColorPalette", reader.buf);
  return Array.from({ length: ITEM_COLOR_COUNT }, (_, i) => {
    const off = base + i * 4;
    const hex = (at: number) =>
      reader
        .u8(off + at)
        .toString(16)
        .padStart(2, "0");
    return `#${hex(0)}${hex(1)}${hex(2)}`;
  });
}
