/** Shared helpers for building minimal hand-crafted EBOOT-shaped fixture buffers. */
import { BinaryReader } from "../src/binary/reader.js";

/** A zero-filled buffer big enough to reach `minLength`, wrapped as a BinaryReader. */
export function fixtureReader(minLength: number): { buf: Buffer; reader: BinaryReader } {
  const buf = Buffer.alloc(minLength);
  return { buf, reader: new BinaryReader(buf) };
}

/** The EU note-set table's first entries (w-b-r, w-y-r, …); the rest repeat p-g-a. */
export const NOTE_SET_BYTES = [
  [1, 3, 5],
  [1, 4, 5],
  [1, 6, 5],
  ...Array.from({ length: 17 }, () => [2, 6, 7]),
].flat();

/**
 * A melody table shaped like the EU one: songs stored last-played first,
 * then an empty entry, then one effect ID per song.
 */
export function melodyTableBytes(): Buffer {
  const songs = [
    [0x01, 0x01, 0x81, 0], // w-w (the extra white flagged 0x80)
    [0x05, 0x01, 0, 0], // w-r
    [0x05, 0x05, 0x02, 0], // p-r-r
    [0x05, 0x06, 0x05, 0], // r-g-r
    [0x02, 0x07, 0x07, 0x05], // r-a-a-p, same effect as r-g-r
  ];
  // Pad to the 30-song minimum with a-a-a songs on later effects.
  while (songs.length < 32) songs.push([0x07, 0x07, 0x07, 0]);
  const effects = [0, 1, 2, 3, 3, ...Array.from({ length: 27 }, (_, i) => 4 + i)];
  return Buffer.from([...songs.flat(), 0, 0, 0, 0, ...effects]);
}
