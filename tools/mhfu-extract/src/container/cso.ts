/**
 * CISO (.cso) v1 decompressor.
 *
 * Format (all little-endian):
 *   offset 0x00  magic[4]        "CISO"
 *   offset 0x04  header_size     u32 (== 0x18)
 *   offset 0x08  total_bytes     u64 (uncompressed image size)
 *   offset 0x10  block_size      u32 (usually 0x800)
 *   offset 0x14  ver             u8
 *   offset 0x15  align           u8  (index values are shifted left by this)
 *   offset 0x16  reserved[2]
 *   offset 0x18  index[N+1]      u32 each, N = ceil(total_bytes / block_size)
 *
 * Each index entry's low 31 bits, left-shifted by `align`, gives the byte
 * offset of that block's compressed data in the file; the top bit
 * (0x80000000) means the block is stored uncompressed. A block's compressed
 * length is the difference between consecutive (unshifted top bit) index
 * values, shifted by `align`. Compressed blocks are raw (headerless) deflate
 * streams, i.e. `zlib.inflateRawSync`.
 *
 * Reference: the widely mirrored CISO_H struct used by PPSSPP / maxcso /
 * ciso.py implementations. No single canonical spec; this matches the
 * common v1 layout used by every PSP CSO in the wild.
 */
import { inflateRawSync } from "node:zlib";
import type { RandomAccessSource } from "./source.js";

const MAGIC = Buffer.from("CISO", "latin1");
const NOT_COMPRESSED_FLAG = 0x80000000;
const INDEX_MASK = 0x7fffffff;

export function isCso(header: Buffer): boolean {
  return header.length >= 4 && header.subarray(0, 4).equals(MAGIC);
}

export class CsoSource implements RandomAccessSource {
  readonly totalBytes: number;
  private readonly blockSize: number;
  private readonly align: number;
  private readonly index: Uint32Array;
  private readonly blockCache = new Map<number, Buffer>();
  private static readonly MAX_CACHED_BLOCKS = 64;

  constructor(private readonly file: RandomAccessSource) {
    const header = file.read(0, 0x18);
    if (!isCso(header)) throw new Error("Not a CISO image (bad magic)");
    const headerSize = header.readUInt32LE(0x04);
    if (headerSize !== 0x18) {
      throw new Error(`Unsupported CISO header size 0x${headerSize.toString(16)}`);
    }
    this.totalBytes = Number(header.readBigUInt64LE(0x08));
    this.blockSize = header.readUInt32LE(0x10);
    this.align = header.readUInt8(0x15);

    const blockCount = Math.ceil(this.totalBytes / this.blockSize);
    const indexBytes = file.read(0x18, (blockCount + 1) * 4);
    this.index = new Uint32Array(blockCount + 1);
    for (let i = 0; i <= blockCount; i++) this.index[i] = indexBytes.readUInt32LE(i * 4);
  }

  private decompressBlock(blockIndex: number): Buffer {
    const cached = this.blockCache.get(blockIndex);
    if (cached) return cached;

    const entry = this.index[blockIndex]!;
    const next = this.index[blockIndex + 1]!;
    const start = (entry & INDEX_MASK) << this.align;
    const end = (next & INDEX_MASK) << this.align;
    const raw = this.file.read(start, end - start);

    const isPlain = (entry & NOT_COMPRESSED_FLAG) !== 0;
    const block = isPlain ? raw : inflateRawSync(raw);

    if (this.blockCache.size >= CsoSource.MAX_CACHED_BLOCKS) {
      const oldestKey = this.blockCache.keys().next().value;
      if (oldestKey !== undefined) this.blockCache.delete(oldestKey);
    }
    this.blockCache.set(blockIndex, block);
    return block;
  }

  read(offset: number, length: number): Buffer {
    if (offset < 0 || offset + length > this.totalBytes) {
      throw new RangeError(
        `CsoSource: out of bounds read at 0x${offset.toString(16)}, length=${length}`,
      );
    }
    const out = Buffer.alloc(length);
    let written = 0;
    while (written < length) {
      const pos = offset + written;
      const blockIndex = Math.floor(pos / this.blockSize);
      const blockOffset = pos % this.blockSize;
      const block = this.decompressBlock(blockIndex);
      const chunkLen = Math.min(this.blockSize - blockOffset, length - written);
      block.copy(out, written, blockOffset, blockOffset + chunkLen);
      written += chunkLen;
    }
    return out;
  }

  close(): void {
    this.file.close();
  }
}
