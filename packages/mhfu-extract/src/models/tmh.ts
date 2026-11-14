/**
 * `.TMH` texture set ("`.TMH0.14`"). Layout based on svanheulen/mhff
 * `psp/tmh.py` (GPL-3.0); pixel formats are the PSP GE's texture formats.
 *
 *   0x00 ".TMH0.14"  0x08 u32 image count  0x0c u32 ?
 * Per image:
 *   image header (0x10): u32 total size, u32, u32, u32 hasPalette
 *   pixel header (0x10): u32 size (incl. header), u32 swizzled, u32 format, u16 width, u16 height
 *   pixel data
 *   if hasPalette: palette header (0x10): u32 size (incl. header), u32, u32 format, u32 entry count; palette data
 */
import { BinaryReader } from "../binary/reader.js";

export interface TmhImage {
  width: number;
  height: number;
  /** Row-major RGBA8, top row first. */
  rgba: Buffer;
  /** True when any pixel has alpha < 255. */
  hasAlpha: boolean;
}

const MAGIC = Buffer.from(".TMH0.14", "latin1");

/** Bits per pixel for GE texture formats 0-7. */
const BITS_PER_PIXEL = [16, 16, 16, 32, 4, 8, 16, 32] as const;

export function isTmh(buf: Buffer): boolean {
  return buf.length >= 16 && buf.subarray(0, 8).equals(MAGIC);
}

/** Decode one direct-color GE pixel (formats 0-3) to RGBA8. */
function directColor(
  reader: BinaryReader,
  offset: number,
  format: number,
): [number, number, number, number] {
  if (format === 3)
    return [reader.u8(offset), reader.u8(offset + 1), reader.u8(offset + 2), reader.u8(offset + 3)];
  const v = reader.u16(offset);
  const scale = (value: number, bits: number) => Math.round((value * 255) / ((1 << bits) - 1));
  if (format === 0)
    return [scale(v & 31, 5), scale((v >> 5) & 63, 6), scale((v >> 11) & 31, 5), 255];
  if (format === 1)
    return [scale(v & 31, 5), scale((v >> 5) & 31, 5), scale((v >> 10) & 31, 5), (v >> 15) * 255];
  if (format === 2)
    return [
      scale(v & 15, 4),
      scale((v >> 4) & 15, 4),
      scale((v >> 8) & 15, 4),
      scale((v >> 12) & 15, 4),
    ];
  throw new Error(`Not a direct-color format: ${format}`);
}

/**
 * Moves an image between row-major and the GE's swizzled order: 16-byte x
 * 8-row blocks, left to right then top to bottom.
 */
function reorderBlocks(data: Buffer, rowBytes: number, height: number, swizzling: boolean): Buffer {
  if (rowBytes % 16 !== 0 || height % 8 !== 0) return data; // too small to be swizzled in blocks
  const out = Buffer.alloc(rowBytes * height);
  const blocksPerRow = rowBytes / 16;
  let block = 0;
  for (let by = 0; by < height / 8; by++) {
    for (let bx = 0; bx < blocksPerRow; bx++) {
      for (let row = 0; row < 8; row++, block += 16) {
        const flat = (by * 8 + row) * rowBytes + bx * 16;
        if (swizzling) data.copy(out, block, flat, flat + 16);
        else data.copy(out, flat, block, block + 16);
      }
    }
  }
  return out;
}

/** Undo the GE's texture swizzle: the image is stored as 16-byte x 8-row blocks. */
export function unswizzle(data: Buffer, rowBytes: number, height: number): Buffer {
  return reorderBlocks(data, rowBytes, height, false);
}

/** The inverse of `unswizzle`. */
export function swizzle(data: Buffer, rowBytes: number, height: number): Buffer {
  return reorderBlocks(data, rowBytes, height, true);
}

export interface IndexedImageLocation {
  width: number;
  height: number;
  swizzled: boolean;
  /** File offset of the pixel data, one palette index per pixel. */
  pixels: number;
  /** File offset of the palette's first entry (RGBA8888 or 16-bit, by `paletteFormat`). */
  palette: number;
  paletteFormat: number;
}

/**
 * Where the first image of a texture set keeps its 8-bit pixels and palette,
 * or null if it isn't a palettized 8-bit image. For editing a texture in
 * place; `readTmh` decodes the same layout.
 */
export function locateIndexedImage(buf: Buffer): IndexedImageLocation | null {
  if (!isTmh(buf) || buf.length < 64 || buf.readUInt32LE(28) !== 1) return null;
  const pixelHeader = 32;
  const pixelSize = buf.readUInt32LE(pixelHeader);
  const paletteHeader = pixelHeader + pixelSize;
  if (buf.readUInt32LE(pixelHeader + 8) !== 5 || paletteHeader + 16 > buf.length) return null;
  const width = buf.readUInt16LE(pixelHeader + 12);
  const height = buf.readUInt16LE(pixelHeader + 14);
  const paletteFormat = buf.readUInt32LE(paletteHeader + 8);
  const palette = paletteHeader + 16;
  const entryBytes = paletteFormat === 3 ? 4 : 2;
  if (
    pixelSize !== 16 + width * height ||
    buf.readUInt32LE(paletteHeader + 12) !== 256 ||
    palette + 256 * entryBytes > buf.length
  ) {
    return null;
  }
  return {
    width,
    height,
    swizzled: buf.readUInt32LE(pixelHeader + 4) === 1,
    pixels: pixelHeader + 16,
    palette,
    paletteFormat,
  };
}

function decodePalette(
  reader: BinaryReader,
  offset: number,
): { colors: [number, number, number, number][]; size: number } {
  const size = reader.u32(offset);
  const format = reader.u32(offset + 8);
  const count = reader.u32(offset + 12);
  if (format > 3) throw new Error(`Unsupported palette format ${format}`);
  const entryBytes = format === 3 ? 4 : 2;
  const colors: [number, number, number, number][] = [];
  for (let i = 0; i < count; i++)
    colors.push(directColor(reader, offset + 16 + i * entryBytes, format));
  return { colors, size };
}

function decodeDxt1(data: Buffer, width: number, height: number): Buffer {
  // PSP DXT1 blocks are 8 bytes: u32 2-bit indices first, then two RGB565 colors
  // (the reverse of PC DXT1), stored in 4x4-pixel block order.
  const reader = new BinaryReader(data);
  const out = Buffer.alloc(width * height * 4);
  const rgb = (v: number): [number, number, number] => [
    Math.round((((v >> 11) & 31) * 255) / 31),
    Math.round((((v >> 5) & 63) * 255) / 63),
    Math.round(((v & 31) * 255) / 31),
  ];
  let at = 0;
  for (let by = 0; by < height / 4; by++) {
    for (let bx = 0; bx < width / 4; bx++, at += 8) {
      const bits = reader.u32(at);
      const c0v = reader.u16(at + 4);
      const c1v = reader.u16(at + 6);
      const c0 = rgb(c0v);
      const c1 = rgb(c1v);
      const palette: [number, number, number, number][] =
        c0v > c1v
          ? [
              [...c0, 255],
              [...c1, 255],
              [0, 1, 2].map((k) => Math.round((2 * c0[k]! + c1[k]!) / 3)).concat(255) as [
                number,
                number,
                number,
                number,
              ],
              [0, 1, 2].map((k) => Math.round((c0[k]! + 2 * c1[k]!) / 3)).concat(255) as [
                number,
                number,
                number,
                number,
              ],
            ]
          : [
              [...c0, 255],
              [...c1, 255],
              [0, 1, 2].map((k) => Math.round((c0[k]! + c1[k]!) / 2)).concat(255) as [
                number,
                number,
                number,
                number,
              ],
              [0, 0, 0, 0],
            ];
      for (let p = 0; p < 16; p++) {
        const color = palette[(bits >>> (p * 2)) & 3]!;
        const x = bx * 4 + (p % 4);
        const y = by * 4 + Math.floor(p / 4);
        out.set(color, (y * width + x) * 4);
      }
    }
  }
  return out;
}

function decodeImage(reader: BinaryReader, offset: number): { image: TmhImage; size: number } {
  const totalSize = reader.u32(offset);
  const hasPalette = reader.u32(offset + 12) === 1;
  const pixelAt = offset + 16;
  const pixelSize = reader.u32(pixelAt);
  const swizzled = reader.u32(pixelAt + 4) === 1;
  const format = reader.u32(pixelAt + 8);
  const width = reader.u16(pixelAt + 12);
  const height = reader.u16(pixelAt + 14);
  let data = reader.bytes(pixelAt + 16, pixelSize - 16);

  let rgba: Buffer;
  if (format === 8) {
    rgba = decodeDxt1(data, width, height);
  } else if (format <= 7) {
    const bpp = BITS_PER_PIXEL[format]!;
    if (swizzled) data = unswizzle(data, (width * bpp) / 8, height);
    const pixels = new BinaryReader(data);
    rgba = Buffer.alloc(width * height * 4);
    if (format <= 3) {
      for (let i = 0; i < width * height; i++)
        rgba.set(directColor(pixels, (i * bpp) / 8, format), i * 4);
    } else {
      if (!hasPalette) throw new Error(`Indexed texture format ${format} without a palette`);
      const { colors } = decodePalette(reader, pixelAt + pixelSize);
      for (let i = 0; i < width * height; i++) {
        let index: number;
        if (format === 4) index = (pixels.u8(i >> 1) >> ((i & 1) * 4)) & 15;
        else if (format === 5) index = pixels.u8(i);
        else if (format === 6) index = pixels.u16(i * 2);
        else index = pixels.u32(i * 4);
        rgba.set(colors[index] ?? [255, 0, 255, 255], i * 4);
      }
    }
  } else {
    throw new Error(`Unsupported texture format ${format} (DXT3/DXT5 not implemented)`);
  }

  let hasAlpha = false;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! < 255) {
      hasAlpha = true;
      break;
    }
  }
  return { image: { width, height, rgba, hasAlpha }, size: totalSize };
}

export function readTmh(buf: Buffer): TmhImage[] {
  if (!isTmh(buf)) throw new Error("Not a .TMH0.14 texture set");
  const reader = new BinaryReader(buf);
  const count = reader.u32(8);
  const images: TmhImage[] = [];
  let offset = 16;
  for (let i = 0; i < count; i++) {
    const { image, size } = decodeImage(reader, offset);
    images.push(image);
    offset += size;
  }
  return images;
}
