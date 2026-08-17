/**
 * MHP2G/MHFU `DATA.BIN` decryption and TOC unpacking.
 *
 * Ported from `DataCipher` in svanheulen/mhef (mhef/psp.py) and the TOC
 * walking logic in svanheulen/mhff (psp/data.py), both GPL-3.0-or-later.
 * See ../../NOTICE.md.
 *
 * Algorithm: each file's payload (a run of 2048-byte sectors) is decrypted
 * as a single continuous stream:
 *   1. Byte-substitute every byte via DATA_CIPHER_DECODE_TABLE.
 *   2. Reinterpret as little-endian u32 words and XOR each with the next
 *      value of a two-stream 16-bit LCG keystream, seeded once from the
 *      file's starting LBA (not reset every sector).
 * A handful of files ("exceptions", already-compressed data) are stored
 * raw and must be left untouched.
 */
import { DATA_CIPHER_DECODE_TABLE, DATA_CIPHER_ENCODE_TABLE } from "./data-cipher-tables.js";
import type { Region } from "./sfo.js";

const SECTOR_SIZE = 2048;

const KEY_DEFAULT: readonly [number, number] = [0x2345, 0x7f8d];
const KEY_MODIFIER: readonly [number, number] = [0xffd9, 0xfff1];

// game == MHP2G_JP uses one exception list; MHP2G_NA / MHP2G_EU share the
// other. Values are indices into the file's TOC, not byte offsets.
const JP_EXCEPTIONS = new Set([22, 23, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42]);
const NA_EXCEPTIONS = new Set([42, 43, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62]);

function exceptionsFor(region: Region): Set<number> {
  return region === "jp" ? JP_EXCEPTIONS : NA_EXCEPTIONS;
}

class LcgKeyStream {
  private key0: number;
  private key1: number;

  constructor(seedLba: number) {
    const hi = seedLba >>> 16;
    const lo = seedLba & 0xffff;
    this.key0 = hi === 0 ? KEY_DEFAULT[0] : hi;
    this.key1 = lo === 0 ? KEY_DEFAULT[1] : lo;
  }

  next(): number {
    this.key0 = (this.key0 * KEY_DEFAULT[0]) % KEY_MODIFIER[0];
    this.key1 = (this.key1 * KEY_DEFAULT[1]) % KEY_MODIFIER[1];
    return ((this.key0 << 16) >>> 0) + this.key1;
  }
}

/** Decrypts a contiguous run of sectors starting at LBA `lba`. */
export function decryptDataBinBlock(buf: Buffer, lba: number): Buffer {
  if (buf.length % 4 !== 0) throw new Error(`decryptDataBinBlock: length ${buf.length} is not a multiple of 4`);
  const substituted = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) substituted[i] = DATA_CIPHER_DECODE_TABLE[buf[i]!]!;

  const keystream = new LcgKeyStream(lba);
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i += 4) {
    const word = substituted.readUInt32LE(i);
    out.writeUInt32LE((word ^ keystream.next()) >>> 0, i);
  }
  return out;
}

/** Inverse of decryptDataBinBlock — kept for completeness/round-trip tests. */
export function encryptDataBinBlock(buf: Buffer, lba: number): Buffer {
  if (buf.length % 4 !== 0) throw new Error(`encryptDataBinBlock: length ${buf.length} is not a multiple of 4`);
  const keystream = new LcgKeyStream(lba);
  const xored = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i += 4) {
    const word = buf.readUInt32LE(i);
    xored.writeUInt32LE((word ^ keystream.next()) >>> 0, i);
  }
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = DATA_CIPHER_ENCODE_TABLE[xored[i]!]!;
  return out;
}

export interface DataBinFile {
  index: number;
  startLba: number;
  data: Buffer;
}

/**
 * Decrypts the DATA.BIN table of contents and every file it references.
 *
 * TOC layout: a u32 at offset 0 (once decrypted) gives the TOC size in
 * sectors; the TOC itself is an array of u32 LBAs, one per file plus a
 * final sentinel equal to the total file size in sectors. `file_count` is
 * the index of the entry equal to that sentinel.
 */
export function unpackDataBin(raw: Buffer, region: Region): DataBinFile[] {
  const tocSizeWord = decryptDataBinBlock(raw.subarray(0, 4), 0);
  const tocSizeSectors = tocSizeWord.readUInt32LE(0);
  const tocBytes = tocSizeSectors * SECTOR_SIZE;

  const tocDecrypted = decryptDataBinBlock(raw.subarray(0, tocBytes), 0);
  const tocEntryCount = tocBytes / 4;
  const toc = new Uint32Array(tocEntryCount);
  for (let i = 0; i < tocEntryCount; i++) toc[i] = tocDecrypted.readUInt32LE(i * 4);

  const totalSectors = raw.length / SECTOR_SIZE;
  const fileCount = toc.indexOf(totalSectors);
  if (fileCount === -1) {
    throw new Error(
      "unpackDataBin: could not find TOC sentinel matching file size — is this really a decrypted-container-shaped DATA.BIN?"
    );
  }

  const exceptions = exceptionsFor(region);
  const files: DataBinFile[] = [];
  for (let i = 0; i < fileCount; i++) {
    const startLba = toc[i]!;
    const endLba = toc[i + 1]!;
    const raw_ = raw.subarray(startLba * SECTOR_SIZE, endLba * SECTOR_SIZE);
    const data = exceptions.has(i) ? Buffer.from(raw_) : decryptDataBinBlock(raw_, startLba);
    files.push({ index: i, startLba, data });
  }
  return files;
}
