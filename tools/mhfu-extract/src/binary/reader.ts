/**
 * Little-endian struct reader over a Node Buffer, matching the field types
 * used throughout the vendored ImHex patterns (u8/s8/u16/s16/u32/s32/float,
 * fixed-length char arrays, and NUL-terminated C strings).
 *
 * All read* methods take an absolute byte offset and do not mutate cursor
 * state — struct decoders are expected to compute offsets explicitly, which
 * keeps them a direct, auditable transcription of the .hexpat field lists.
 */
export class BinaryReader {
  constructor(public readonly buf: Buffer) {}

  get length(): number {
    return this.buf.length;
  }

  private assertInBounds(offset: number, size: number, label: string): void {
    if (offset < 0 || offset + size > this.buf.length) {
      throw new RangeError(
        `${label} out of bounds: offset=0x${offset.toString(16)} size=${size} bufLength=0x${this.buf.length.toString(16)}`
      );
    }
  }

  u8(offset: number): number {
    this.assertInBounds(offset, 1, "u8");
    return this.buf.readUInt8(offset);
  }

  s8(offset: number): number {
    this.assertInBounds(offset, 1, "s8");
    return this.buf.readInt8(offset);
  }

  u16(offset: number): number {
    this.assertInBounds(offset, 2, "u16");
    return this.buf.readUInt16LE(offset);
  }

  s16(offset: number): number {
    this.assertInBounds(offset, 2, "s16");
    return this.buf.readInt16LE(offset);
  }

  u32(offset: number): number {
    this.assertInBounds(offset, 4, "u32");
    return this.buf.readUInt32LE(offset);
  }

  s32(offset: number): number {
    this.assertInBounds(offset, 4, "s32");
    return this.buf.readInt32LE(offset);
  }

  f32(offset: number): number {
    this.assertInBounds(offset, 4, "f32");
    return this.buf.readFloatLE(offset);
  }

  /** Fixed-length byte slice. */
  bytes(offset: number, length: number): Buffer {
    this.assertInBounds(offset, length, "bytes");
    return this.buf.subarray(offset, offset + length);
  }

  /** Fixed-length ASCII char array, trimmed at the first NUL. */
  fixedString(offset: number, length: number): string {
    const slice = this.bytes(offset, length);
    const nul = slice.indexOf(0);
    return slice.toString("latin1", 0, nul === -1 ? slice.length : nul);
  }

  /**
   * NUL-terminated C string, matching `char Field[while(...!=0)] @ ptr`.
   * Defaults to latin1 (safe for plain-ASCII EBOOT/overlay strings); pass
   * "utf8" for text known to be UTF-8-encoded (e.g. quest strings — see
   * quests/parser.ts, which is UTF-8 even on the JP disc, not Shift-JIS).
   */
  cString(offset: number, maxLength = 4096, encoding: "latin1" | "utf8" = "latin1"): string {
    let end = offset;
    const limit = Math.min(this.buf.length, offset + maxLength);
    while (end < limit && this.buf[end] !== 0) end++;
    return this.buf.toString(encoding, offset, end);
  }

  /** Reads 4 bytes as a magic tag for equality checks. */
  magic(offset: number, length: number): Buffer {
    return this.bytes(offset, length);
  }
}

/**
 * Resolves a virtual-memory address (as stored in EBOOT.BIN / .ovl pointer
 * fields) to a byte offset within the given buffer, using the region's
 * base_address (the `#pragma base_address` of the relevant .hexpat file).
 *
 * Every pointer field in the vendored patterns (`Type *field : u32`) stores
 * an absolute address of this form, not a file offset.
 */
export function vaddrToOffset(vaddr: number, baseAddress: number): number {
  return vaddr - baseAddress;
}

/** Reads a u32 pointer field and immediately resolves it to a file offset. */
export function readPointer(reader: BinaryReader, offset: number, baseAddress: number): number {
  return vaddrToOffset(reader.u32(offset), baseAddress);
}
