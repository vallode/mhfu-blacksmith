/**
 * The output disc image: a plain ISO copied from the user's ISO or CSO,
 * then patched in place.
 *
 * Files are rewritten where they are when they still fit in their sectors.
 * A file that has grown is moved to the end of the image, and its
 * directory record and the volume size are updated. Nothing else in the
 * image moves, so the ISO never needs a full rebuild.
 */
import { closeSync, fstatSync, ftruncateSync, openSync, readSync, writeSync } from "node:fs";
import { openDiscImage } from "../../../mhfu-extract/src/container/image.js";
import { Iso9660Reader, type DirEntry } from "../../../mhfu-extract/src/container/iso9660.js";
import type { RandomAccessSource } from "../../../mhfu-extract/src/container/source.js";

export const SECTOR_SIZE = 2048;
const PVD_OFFSET = 16 * SECTOR_SIZE;
/** Volume space size (sectors), both-endian u32, in the primary volume descriptor. */
const PVD_VOLUME_SIZE = 80;
/** Directory record fields, both-endian u32: extent LBA and data length. */
const RECORD_LBA = 2;
const RECORD_SIZE = 10;
const COPY_CHUNK = 4 * 1024 * 1024;

/** A read/write file source, so the ISO 9660 reader can read the image being patched. */
class ReadWriteFile implements RandomAccessSource {
  private readonly fd: number;

  constructor(path: string) {
    this.fd = openSync(path, "r+");
  }

  get totalBytes(): number {
    return fstatSync(this.fd).size;
  }

  read(offset: number, length: number): Buffer {
    const buf = Buffer.alloc(length);
    let done = 0;
    while (done < length) {
      const n = readSync(this.fd, buf, done, length - done, offset + done);
      if (n === 0) throw new RangeError(`short read at 0x${offset.toString(16)}`);
      done += n;
    }
    return buf;
  }

  write(offset: number, data: Buffer): void {
    let done = 0;
    while (done < data.length) {
      done += writeSync(this.fd, data, done, data.length - done, offset + done);
    }
  }

  truncate(length: number): void {
    ftruncateSync(this.fd, length);
  }

  close(): void {
    closeSync(this.fd);
  }
}

/** Copies `inputPath` (ISO or CSO) to `outputPath` as a plain ISO. */
export function copyAsIso(inputPath: string, outputPath: string): void {
  const { source } = openDiscImage(inputPath);
  const out = openSync(outputPath, "w");
  try {
    for (let offset = 0; offset < source.totalBytes; offset += COPY_CHUNK) {
      const chunk = source.read(offset, Math.min(COPY_CHUNK, source.totalBytes - offset));
      let done = 0;
      while (done < chunk.length) done += writeSync(out, chunk, done, chunk.length - done);
    }
  } finally {
    closeSync(out);
    source.close();
  }
}

function writeBothEndian32(buf: Buffer, offset: number, value: number): void {
  buf.writeUInt32LE(value, offset);
  buf.writeUInt32BE(value, offset + 4);
}

export interface ReplaceResult {
  path: string;
  moved: boolean;
  lba: number;
  size: number;
}

export class PatchableImage {
  private readonly file: ReadWriteFile;
  readonly iso: Iso9660Reader;

  constructor(path: string) {
    this.file = new ReadWriteFile(path);
    this.iso = new Iso9660Reader(this.file);
  }

  get source(): RandomAccessSource {
    return this.file;
  }

  stat(path: string): DirEntry {
    return this.iso.stat(path);
  }

  /** Overwrites bytes inside an existing file, which must not grow past its end. */
  writeInFile(entry: DirEntry, offsetInFile: number, data: Buffer): void {
    if (offsetInFile < 0 || offsetInFile + data.length > entry.size) {
      throw new RangeError(
        `write of ${data.length} bytes at 0x${offsetInFile.toString(16)} is outside ${entry.name} (${entry.size} bytes)`,
      );
    }
    this.file.write(entry.lba * SECTOR_SIZE + offsetInFile, data);
  }

  /** Replaces a whole file's contents, moving it to the end of the image if it no longer fits. */
  replaceFile(path: string, data: Buffer): ReplaceResult {
    const entry = this.stat(path);
    if (entry.isDirectory) throw new Error(`${path} is a directory`);
    const allocated = Math.ceil(entry.size / SECTOR_SIZE) * SECTOR_SIZE;
    const padded = Buffer.alloc(Math.ceil(data.length / SECTOR_SIZE) * SECTOR_SIZE);
    data.copy(padded);

    let lba = entry.lba;
    let moved = false;
    if (data.length <= allocated) {
      // Zero the rest of the old extent so no stale bytes are left behind.
      const extent = Buffer.alloc(allocated);
      data.copy(extent);
      this.file.write(entry.lba * SECTOR_SIZE, extent);
    } else {
      const end = Math.ceil(this.file.totalBytes / SECTOR_SIZE) * SECTOR_SIZE;
      lba = end / SECTOR_SIZE;
      this.file.write(end, padded);
      moved = true;
      this.setVolumeSize((end + padded.length) / SECTOR_SIZE);
    }

    const record = this.file.read(entry.recordOffset, 18);
    writeBothEndian32(record, RECORD_LBA, lba);
    writeBothEndian32(record, RECORD_SIZE, data.length);
    this.file.write(entry.recordOffset, record);
    return { path, moved, lba, size: data.length };
  }

  private setVolumeSize(sectors: number): void {
    const field = Buffer.alloc(8);
    writeBothEndian32(field, 0, sectors);
    this.file.write(PVD_OFFSET + PVD_VOLUME_SIZE, field);
    this.file.truncate(sectors * SECTOR_SIZE);
  }

  close(): void {
    this.file.close();
  }
}
