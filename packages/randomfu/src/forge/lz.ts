/**
 * The LZ packing of FORGE.BIN's blocks and images (`stitch-library.ts`),
 * which the blob unpacks in place (`blob/stitch.c`'s `load`): LZ4's
 * sequences without its frame. A sequence is a token (literal count in the
 * high nibble, match length less MIN_MATCH in the low; 15 means more bytes
 * follow, each added, until one under 255), the literals, then the match
 * as a u16 distance back and its length's further bytes. The last sequence
 * may stop after its literals; unpacking stops at the unpacked size.
 *
 * In place: the packed bytes are read in to end PACK_MARGIN bytes past
 * where the unpacked ones end, and unpacked from the start forwards. `pack`
 * keeps data whose unpacking would catch up with the bytes still to read,
 * or that doesn't get smaller, as it is (packed size = size).
 */

/** How far past the unpacked end the packed bytes end, unpacked in place. */
export const PACK_MARGIN = 16;
const MIN_MATCH = 4;
const MAX_DISTANCE = 0xffff;
/** Candidates tried per position: past 64 the packing gains under 0.5%. */
const CHAIN = 64;

/** `data` packed, or `data` itself if packing doesn't make it smaller (or can't unpack in place). */
export function pack(data: Buffer): Buffer {
  const packed = lzPack(data);
  return packed.length < data.length && inPlaceMargin(packed, data.length) <= PACK_MARGIN
    ? packed
    : data;
}

/** Unpacks `packed` to `size` bytes (as it is if `packed` is that size). */
export function unpack(packed: Buffer, size: number): Buffer {
  if (packed.length === size) return Buffer.from(packed);
  const out = Buffer.alloc(size);
  let o = 0;
  let p = 0;
  const length = (n: number) => {
    if (n === 15) {
      let b: number;
      do {
        b = packed[p++]!;
        n += b;
      } while (b === 255);
    }
    return n;
  };
  while (o < size) {
    const token = packed[p++]!;
    const literals = length(token >> 4);
    packed.copy(out, o, p, p + literals);
    p += literals;
    o += literals;
    if (o >= size) break;
    const distance = packed[p]! | (packed[p + 1]! << 8);
    p += 2;
    const n = length(token & 15) + MIN_MATCH;
    if (distance === 0 || distance > o || o + n > size) throw new Error("bad packed data");
    for (let k = 0; k < n; k++, o++) out[o] = out[o - distance]!;
  }
  if (p !== packed.length) throw new Error("bad packed data");
  return out;
}

/**
 * The margin unpacking `packed` (to `size` bytes) in place needs: the
 * least m for which every byte is written below the next one to read, with
 * the packed bytes ending m past the unpacked end.
 */
export function inPlaceMargin(packed: Buffer, size: number): number {
  // Packed byte p sits at size + m - packed.length + p; a byte written at
  // o must lie below the next unread one: o < size + m - packed.length + p.
  let need = 0;
  const write = (o: number, p: number) => {
    need = Math.max(need, o - p - size + packed.length + 1);
  };
  let o = 0;
  let p = 0;
  const length = (n: number) => {
    if (n === 15) {
      let b: number;
      do {
        b = packed[p++]!;
        n += b;
      } while (b === 255);
    }
    return n;
  };
  while (o < size) {
    const token = packed[p++]!;
    const literals = length(token >> 4);
    for (let k = 0; k < literals; k++) write(o++, ++p);
    if (o >= size) break;
    p += 2;
    const n = length(token & 15) + MIN_MATCH;
    for (let k = 0; k < n; k++) write(o++, p);
  }
  return need;
}

/** Greedy LZ with one step of lazy matching, over hash chains of 4-byte prefixes. */
function lzPack(src: Buffer): Buffer {
  const out: number[] = [];
  const n = src.length;
  const chains = new Map<number, number[]>();
  const key = (i: number) => src.readUInt32LE(i);
  const insert = (i: number) => {
    if (i + MIN_MATCH > n) return;
    const k = key(i);
    const chain = chains.get(k);
    if (chain) chain.push(i);
    else chains.set(k, [i]);
  };
  const longest = (i: number): [number, number] => {
    if (i + MIN_MATCH > n) return [0, 0];
    const chain = chains.get(key(i));
    let best = 0;
    let distance = 0;
    if (!chain) return [0, 0];
    for (let c = chain.length - 1, tries = 0; c >= 0 && tries < CHAIN; c--, tries++) {
      const j = chain[c]!;
      if (i - j > MAX_DISTANCE) break;
      let l = 0;
      while (i + l < n && src[j + l] === src[i + l]) l++;
      if (l > best) {
        best = l;
        distance = i - j;
      }
    }
    return best >= MIN_MATCH ? [best, distance] : [0, 0];
  };
  const more = (v: number) => {
    for (; v >= 255; v -= 255) out.push(255);
    out.push(v);
  };
  const sequence = (from: number, literals: number, match: number, distance: number) => {
    const m = match ? match - MIN_MATCH : 0;
    out.push((Math.min(15, literals) << 4) | Math.min(15, m));
    if (literals >= 15) more(literals - 15);
    for (let k = 0; k < literals; k++) out.push(src[from + k]!);
    if (!match) return;
    out.push(distance & 0xff, distance >> 8);
    if (m >= 15) more(m - 15);
  };
  let start = 0;
  let i = 0;
  while (i < n) {
    const [length, distance] = longest(i);
    if (length === 0 || longest(i + 1)[0] > length + 1) {
      insert(i++);
      continue;
    }
    sequence(start, i - start, length, distance);
    for (let k = 0; k < length; k++) insert(i + k);
    i += length;
    start = i;
  }
  if (start < n || n === 0) sequence(start, n - start, 0, 0);
  return Buffer.from(out);
}
