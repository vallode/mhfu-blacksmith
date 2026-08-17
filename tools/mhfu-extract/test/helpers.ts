/** Shared helpers for building minimal hand-crafted EBOOT-shaped fixture buffers. */
import { BinaryReader } from "../src/binary/reader.js";

/** A zero-filled buffer big enough to reach `minLength`, wrapped as a BinaryReader. */
export function fixtureReader(minLength: number): { buf: Buffer; reader: BinaryReader } {
  const buf = Buffer.alloc(minLength);
  return { buf, reader: new BinaryReader(buf) };
}
