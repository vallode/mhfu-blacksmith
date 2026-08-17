/**
 * Minimal random-access byte source, implemented by both a plain ISO file
 * and a CSO-backed reader (container/cso.ts) so the ISO 9660 layer
 * (container/iso9660.ts) never needs to know which one it's talking to.
 */
export interface RandomAccessSource {
  readonly totalBytes: number;
  read(offset: number, length: number): Buffer;
  close(): void;
}

import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export class FileSource implements RandomAccessSource {
  private fd: number;
  readonly totalBytes: number;

  constructor(path: string) {
    this.fd = openSync(path, "r");
    this.totalBytes = fstatSync(this.fd).size;
  }

  read(offset: number, length: number): Buffer {
    const buf = Buffer.alloc(length);
    let readTotal = 0;
    while (readTotal < length) {
      const n = readSync(this.fd, buf, readTotal, length - readTotal, offset + readTotal);
      if (n === 0) break;
      readTotal += n;
    }
    if (readTotal < length) {
      throw new RangeError(
        `FileSource: short read at offset=0x${offset.toString(16)}, wanted ${length}, got ${readTotal}`
      );
    }
    return buf;
  }

  close(): void {
    closeSync(this.fd);
  }
}

/** In-memory source, mainly useful for tests and already-decrypted buffers. */
export class BufferSource implements RandomAccessSource {
  readonly totalBytes: number;
  constructor(private readonly buf: Buffer) {
    this.totalBytes = buf.length;
  }

  read(offset: number, length: number): Buffer {
    if (offset < 0 || offset + length > this.buf.length) {
      throw new RangeError(`BufferSource: out of bounds read at 0x${offset.toString(16)}, length=${length}`);
    }
    return this.buf.subarray(offset, offset + length);
  }

  close(): void {
    // no-op
  }
}
