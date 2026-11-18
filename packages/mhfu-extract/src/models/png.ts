/**
 * PNG encoding for model textures. `encodePng` writes the smallest of a few
 * lossless encodings: a palette PNG (1/2/4/8-bit, with tRNS for alpha) when
 * the image has <= 256 colours, as every TMH texture does, else RGBA; each
 * with no row filter and with adaptive filters, keeping whichever compresses
 * smaller.
 */
import { constants, crc32, deflateSync } from "node:zlib";

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Prefix each row with a filter type. `adaptive` picks, per row, the filter
 * with the smallest sum of absolute byte values (the usual libpng heuristic);
 * otherwise every row uses filter 0 (none), which is usually best for
 * palette images.
 */
function filterRows(rows: Buffer[], bpp: number, adaptive: boolean): Buffer {
  const rowBytes = rows[0]!.length;
  const out = Buffer.alloc((rowBytes + 1) * rows.length);
  const zero = Buffer.alloc(rowBytes);
  rows.forEach((row, y) => {
    const prev = y > 0 ? rows[y - 1]! : zero;
    const candidates: Buffer[] = [row];
    if (adaptive) {
      for (let type = 1; type <= 4; type++) {
        const filtered = Buffer.alloc(rowBytes);
        for (let i = 0; i < rowBytes; i++) {
          const a = i >= bpp ? row[i - bpp]! : 0;
          const b = prev[i]!;
          const c = i >= bpp ? prev[i - bpp]! : 0;
          const predictor =
            type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : paeth(a, b, c);
          filtered[i] = (row[i]! - predictor) & 0xff;
        }
        candidates.push(filtered);
      }
    }
    let best = 0;
    let bestCost = Infinity;
    candidates.forEach((candidate, type) => {
      let cost = 0;
      for (const byte of candidate) cost += byte < 128 ? byte : 256 - byte;
      if (cost < bestCost) {
        bestCost = cost;
        best = type;
      }
    });
    out[y * (rowBytes + 1)] = best;
    candidates[best]!.copy(out, y * (rowBytes + 1) + 1);
  });
  return out;
}

function smallestDeflate(raw: Buffer): Buffer {
  let best: Buffer | null = null;
  for (const strategy of [constants.Z_DEFAULT_STRATEGY, constants.Z_FILTERED]) {
    const compressed = deflateSync(raw, { level: 9, memLevel: 9, strategy });
    if (!best || compressed.length < best.length) best = compressed;
  }
  return best!;
}

function assemble(ihdr: Buffer, extra: Buffer[], rows: Buffer[], bpp: number): Buffer {
  let best: Buffer | null = null;
  for (const adaptive of [false, true]) {
    const idat = smallestDeflate(filterRows(rows, bpp, adaptive));
    const png = Buffer.concat([
      SIGNATURE,
      chunk("IHDR", ihdr),
      ...extra,
      chunk("IDAT", idat),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    if (!best || png.length < best.length) best = png;
  }
  return best!;
}

function header(width: number, height: number, bitDepth: number, colorType: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  return ihdr;
}

function encodeRgba(width: number, height: number, rgba: Buffer): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) rows.push(rgba.subarray(y * width * 4, (y + 1) * width * 4));
  return assemble(header(width, height, 8, 6), [], rows, 4);
}

/** Palette PNG, or null if the image has more than 256 colours. */
function encodePalette(width: number, height: number, rgba: Buffer): Buffer | null {
  // Palette in order of first appearance, with every translucent colour
  // first so tRNS (which lists alpha for the first N entries) stays short.
  const seen = new Map<number, number>();
  for (let i = 0; i < width * height; i++) {
    const color = rgba.readUInt32BE(i * 4);
    if (!seen.has(color)) {
      if (seen.size === 256) return null;
      seen.set(color, seen.size);
    }
  }
  const colors = [...seen.keys()].sort(
    (a, b) =>
      Number((a & 0xff) === 0xff) - Number((b & 0xff) === 0xff) || seen.get(a)! - seen.get(b)!,
  );
  const index = new Map(colors.map((color, i) => [color, i]));
  const bitDepth = colors.length <= 2 ? 1 : colors.length <= 4 ? 2 : colors.length <= 16 ? 4 : 8;

  const plte = Buffer.alloc(colors.length * 3);
  const alphas: number[] = [];
  colors.forEach((color, i) => {
    plte[i * 3] = color >>> 24;
    plte[i * 3 + 1] = (color >>> 16) & 0xff;
    plte[i * 3 + 2] = (color >>> 8) & 0xff;
    if ((color & 0xff) !== 0xff) alphas.push(color & 0xff);
  });

  const rowBytes = Math.ceil((width * bitDepth) / 8);
  const perByte = 8 / bitDepth;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(rowBytes);
    for (let x = 0; x < width; x++) {
      const value = index.get(rgba.readUInt32BE((y * width + x) * 4))!;
      const shift = 8 - bitDepth * ((x % perByte) + 1);
      const at = Math.floor(x / perByte);
      row[at] = (row[at] ?? 0) | (value << shift);
    }
    rows.push(row);
  }
  const extra = [chunk("PLTE", plte)];
  if (alphas.length) extra.push(chunk("tRNS", Buffer.from(alphas)));
  return assemble(header(width, height, bitDepth, 3), extra, rows, 1);
}

export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  if (rgba.length !== width * height * 4)
    throw new Error("RGBA buffer size does not match dimensions");
  const palette = encodePalette(width, height, rgba);
  const direct = palette && palette.length < 1024 ? null : encodeRgba(width, height, rgba);
  return !palette ? direct! : !direct || palette.length <= direct.length ? palette : direct;
}
