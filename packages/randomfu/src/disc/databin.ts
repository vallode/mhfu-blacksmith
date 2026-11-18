/**
 * Random access to the files inside `DATA.BIN`, and re-encrypting edited
 * ones in place.
 *
 * The extractor's `unpackDataBin` decrypts every file at once. Here only the
 * table of contents is read up front, and each file is decrypted when asked
 * for, so a randomizer run touches a few files instead of the whole archive.
 *
 * Every file is encrypted with a key seeded from its starting sector, so an
 * edited file that keeps its size can be re-encrypted and written back where
 * it was, leaving every other file untouched. Files that change size would
 * move every file after them; that isn't supported yet.
 *
 * FUComplete's DATA.BIN has no cipher at all: its files are read and
 * written as they are.
 */
import {
  decryptDataBinBlock,
  encryptDataBinBlock,
  isStoredRaw,
} from "mhfu-extract/src/container/databin.js";
import type { Region } from "mhfu-extract/src/container/sfo.js";
import { SECTOR_SIZE } from "./image.js";

/** Reads `length` bytes at `offset` within DATA.BIN. */
export type ReadAt = (offset: number, length: number) => Buffer;

export class DataBin {
  /** Start sector of each file, plus a final entry for the end of the last one. */
  private readonly starts: number[];
  private readonly cache = new Map<number, Buffer>();
  /** False when DATA.BIN is stored without its cipher (FUComplete). */
  readonly encrypted: boolean;

  constructor(
    private readonly readAt: ReadAt,
    readonly size: number,
    readonly region: Region,
  ) {
    const encrypted = readStarts(readAt, size, true);
    const starts = encrypted ?? readStarts(readAt, size, false);
    if (!starts) {
      throw new Error(
        "DATA.BIN has no valid table of contents, encrypted or plain: no run of sector offsets ending at the file's size",
      );
    }
    this.starts = starts;
    this.encrypted = encrypted !== null;
  }

  private storedRaw(index: number): boolean {
    return !this.encrypted || isStoredRaw(index, this.region);
  }

  get fileCount(): number {
    return this.starts.length - 1;
  }

  /** Byte offset of file `index` within DATA.BIN. */
  offsetOf(index: number): number {
    return this.startLba(index) * SECTOR_SIZE;
  }

  /** Length of file `index` in bytes (whole sectors). */
  lengthOf(index: number): number {
    return (this.starts[index + 1]! - this.startLba(index)) * SECTOR_SIZE;
  }

  private startLba(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.fileCount) {
      throw new RangeError(`DATA.BIN has no file ${index} (it has ${this.fileCount})`);
    }
    return this.starts[index]!;
  }

  /** File `index`, decrypted. Callers must copy before editing. */
  read(index: number): Buffer {
    const cached = this.cache.get(index);
    if (cached) return cached;
    const raw = this.readAt(this.offsetOf(index), this.lengthOf(index));
    const data = this.storedRaw(index) ? raw : decryptDataBinBlock(raw, this.startLba(index));
    this.cache.set(index, data);
    return data;
  }

  /** The on-disc bytes for file `index` with new plaintext contents of the same length. */
  encode(index: number, data: Buffer): Buffer {
    if (data.length !== this.lengthOf(index)) {
      throw new Error(
        `DATA.BIN file ${index} would change size (${this.lengthOf(index)} -> ${data.length} bytes); only same-size edits are supported`,
      );
    }
    return this.storedRaw(index)
      ? Buffer.from(data)
      : encryptDataBinBlock(data, this.startLba(index));
  }
}

/**
 * The TOC's file start sectors up to and including the end-of-file entry,
 * or null unless it is a real TOC: it fits in the file, its first entry is
 * its own size, the sectors never go backwards, and one of them is the
 * file's size in sectors. FUComplete stores DATA.BIN without the cipher,
 * which shows here, so callers try both.
 */
function readStarts(readAt: ReadAt, size: number, encrypted: boolean): number[] | null {
  const decode = (buf: Buffer) => (encrypted ? decryptDataBinBlock(buf, 0) : buf);
  if (size < 4) return null;
  const tocSectors = decode(readAt(0, 4)).readUInt32LE(0);
  const tocBytes = tocSectors * SECTOR_SIZE;
  if (tocBytes === 0 || tocBytes > size) return null;
  const toc = decode(readAt(0, tocBytes));
  const totalSectors = size / SECTOR_SIZE;
  const starts: number[] = [];
  for (let i = 0; i < toc.length / 4; i++) {
    const lba = toc.readUInt32LE(i * 4);
    if (lba < (starts.at(-1) ?? 0)) return null;
    starts.push(lba);
    if (lba === totalSectors) return starts.length > 1 ? starts : null;
  }
  return null;
}
