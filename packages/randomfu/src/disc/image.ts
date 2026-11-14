/**
 * The output disc image, patched in place: on disk for the CLI
 * (`node-file.ts`), or as an in-memory layer over the user's file in the
 * browser (`OverlaySource`).
 *
 * Files are rewritten where they are when they still fit in their sectors.
 * A file that has grown is moved to the end of the image, and its
 * directory record and the volume size are updated. Nothing else in the
 * image moves, so the ISO never needs a full rebuild.
 */
import { Iso9660Reader, type DirEntry } from "mhfu-extract/src/container/iso9660.js";
import type { RandomAccessSource } from "mhfu-extract/src/container/source.js";

export const SECTOR_SIZE = 2048;
const PVD_OFFSET = 16 * SECTOR_SIZE;
/** Volume space size (sectors), both-endian u32, in the primary volume descriptor. */
const PVD_VOLUME_SIZE = 80;
/** Directory record fields, both-endian u32: extent LBA and data length. */
const RECORD_LBA = 2;
const RECORD_SIZE = 10;

/** A source that can also be written to and resized. */
export interface WritableSource extends RandomAccessSource {
  write(offset: number, data: Buffer): void;
  truncate(length: number): void;
}

/** One piece of a finished image: a byte range of the original, or new bytes. */
export type ImageSegment =
  { kind: "original"; start: number; end: number } | { kind: "data"; data: Buffer };

/**
 * Writes kept in memory over a read-only source: a 2 KB sector is copied in
 * the first time it's written. `segments()` describes the finished image as
 * ranges of the original plus the changed sectors, so it can be assembled
 * (for a download, say) without copying the original.
 */
export class OverlaySource implements WritableSource {
  private readonly sectors = new Map<number, Buffer>();
  private size: number;

  constructor(private readonly base: RandomAccessSource) {
    this.size = base.totalBytes;
  }

  get totalBytes(): number {
    return this.size;
  }

  private baseSector(index: number): Buffer {
    const sector = Buffer.alloc(SECTOR_SIZE);
    const start = index * SECTOR_SIZE;
    const end = Math.min(start + SECTOR_SIZE, this.base.totalBytes);
    if (end > start) this.base.read(start, end - start).copy(sector);
    return sector;
  }

  read(offset: number, length: number): Buffer {
    if (offset < 0 || offset + length > this.size) {
      throw new RangeError(`OverlaySource: read past the end at 0x${offset.toString(16)}`);
    }
    const out = Buffer.alloc(length);
    let done = 0;
    while (done < length) {
      const at = offset + done;
      const index = Math.floor(at / SECTOR_SIZE);
      const changed = this.sectors.get(index);
      if (changed) {
        const from = at - index * SECTOR_SIZE;
        const n = Math.min(SECTOR_SIZE - from, length - done);
        changed.copy(out, done, from, from + n);
        done += n;
        continue;
      }
      // A run of unchanged sectors: one read from the original.
      let end = (index + 1) * SECTOR_SIZE;
      while (end < offset + length && !this.sectors.has(end / SECTOR_SIZE)) end += SECTOR_SIZE;
      const n = Math.min(end, offset + length) - at;
      const fromBase = Math.min(n, Math.max(0, this.base.totalBytes - at));
      if (fromBase > 0) this.base.read(at, fromBase).copy(out, done);
      done += n;
    }
    return out;
  }

  write(offset: number, data: Buffer): void {
    let done = 0;
    while (done < data.length) {
      const at = offset + done;
      const index = Math.floor(at / SECTOR_SIZE);
      let sector = this.sectors.get(index);
      if (!sector) {
        sector = this.baseSector(index);
        this.sectors.set(index, sector);
      }
      const from = at - index * SECTOR_SIZE;
      const n = Math.min(SECTOR_SIZE - from, data.length - done);
      data.copy(sector, from, done, done + n);
      done += n;
    }
    this.size = Math.max(this.size, offset + data.length);
  }

  truncate(length: number): void {
    this.size = length;
    for (const index of [...this.sectors.keys()]) {
      if (index * SECTOR_SIZE >= length) this.sectors.delete(index);
    }
  }

  /** The finished image, in order: original ranges and changed bytes. */
  segments(): ImageSegment[] {
    const out: ImageSegment[] = [];
    const sectorCount = Math.ceil(this.size / SECTOR_SIZE);
    let i = 0;
    while (i < sectorCount) {
      const start = i * SECTOR_SIZE;
      if (this.sectors.has(i)) {
        const run: Buffer[] = [];
        while (i < sectorCount && this.sectors.has(i)) run.push(this.sectors.get(i++)!);
        const data = Buffer.concat(run);
        out.push({
          kind: "data",
          data: data.subarray(0, Math.min(data.length, this.size - start)),
        });
      } else {
        while (i < sectorCount && !this.sectors.has(i)) i++;
        const end = Math.min(i * SECTOR_SIZE, this.size);
        const baseEnd = Math.min(end, this.base.totalBytes);
        if (baseEnd > start) out.push({ kind: "original", start, end: baseEnd });
        // Past the original's end (only after a move to the end): zeros.
        if (end > Math.max(start, baseEnd)) {
          out.push({ kind: "data", data: Buffer.alloc(end - Math.max(start, baseEnd)) });
        }
      }
    }
    return out;
  }

  /** How many sectors are held in memory. */
  get changedSectors(): number {
    return this.sectors.size;
  }

  close(): void {
    this.base.close();
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
  readonly iso: Iso9660Reader;

  constructor(private readonly file: WritableSource) {
    this.iso = new Iso9660Reader(file);
  }

  get source(): WritableSource {
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

  /**
   * Writes a file at `path`: replaces it if it's there, otherwise appends
   * its data to the end of the image and adds a record for it to its
   * directory, which must have room in the sectors it already has. Records
   * stay sorted by name, as ISO 9660 wants.
   */
  writeFile(path: string, data: Buffer): ReplaceResult {
    const slash = path.lastIndexOf("/");
    const dirPath = path.slice(0, slash) || "/";
    const name = path.slice(slash + 1).toUpperCase();
    if (!/^[A-Z0-9_]{1,8}\.[A-Z0-9_]{0,3}$/.test(name)) {
      throw new Error(`${name} isn't an 8.3 name`);
    }
    try {
      this.stat(path);
      return this.replaceFile(path, data);
    } catch (error) {
      if (!String(error).includes("Path not found")) throw error;
    }
    const dir = dirPath === "/" ? this.rootDirectory() : this.stat(dirPath);
    if (!dir.isDirectory) throw new Error(`${dirPath} isn't a directory`);

    // Read every record of the directory, sector by sector.
    const sectors = Math.ceil(dir.size / SECTOR_SIZE);
    const extent = this.file.read(dir.lba * SECTOR_SIZE, sectors * SECTOR_SIZE);
    const records: Buffer[] = [];
    for (let s = 0; s < sectors; s++) {
      let at = s * SECTOR_SIZE;
      while (at < (s + 1) * SECTOR_SIZE && extent[at]! > 0) {
        records.push(Buffer.from(extent.subarray(at, at + extent[at]!)));
        at += extent[at]!;
      }
    }
    const fileRecord = records.find((r) => (r[25]! & 0x02) === 0);
    if (!fileRecord) throw new Error(`${dirPath} has no file to copy a record from`);

    const end = Math.ceil(this.file.totalBytes / SECTOR_SIZE) * SECTOR_SIZE;
    const lba = end / SECTOR_SIZE;
    const padded = Buffer.alloc(Math.ceil(data.length / SECTOR_SIZE) * SECTOR_SIZE);
    data.copy(padded);
    this.file.write(end, padded);
    this.setVolumeSize((end + padded.length) / SECTOR_SIZE);

    // Shaped like the directory's other files: UMD images name files without
    // the ";1" version (and PPSSPP matches names exactly), and give each an
    // XA system-use field after the name, both copied here.
    const copyName = fileRecord.toString("latin1", 33, 33 + fileRecord[32]!);
    const identifier = Buffer.from(copyName.includes(";") ? `${name};1` : name, "latin1");
    const nameEnd = (n: number) => 33 + n + ((33 + n) % 2);
    const systemUse = fileRecord.subarray(nameEnd(fileRecord[32]!), fileRecord[0]!);
    const length = nameEnd(identifier.length) + systemUse.length;
    const record = Buffer.alloc(length);
    record[0] = length;
    writeBothEndian32(record, RECORD_LBA, lba);
    writeBothEndian32(record, RECORD_SIZE, data.length);
    fileRecord.copy(record, 18, 18, 25); // recording date
    record.writeUInt16LE(1, 28); // volume sequence number, both-endian
    record.writeUInt16BE(1, 30);
    record[32] = identifier.length;
    identifier.copy(record, 33);
    systemUse.copy(record, nameEnd(identifier.length));

    // "." and ".." first, then by name.
    const nameOf = (r: Buffer) => r.toString("latin1", 33, 33 + r[32]!);
    const [self, parent, ...rest] = records;
    rest.push(record);
    rest.sort((x, y) => (nameOf(x) < nameOf(y) ? -1 : nameOf(x) > nameOf(y) ? 1 : 0));
    const packed = Buffer.alloc(sectors * SECTOR_SIZE);
    let at = 0;
    for (const r of [self!, parent!, ...rest]) {
      const sectorEnd = Math.floor(at / SECTOR_SIZE) * SECTOR_SIZE + SECTOR_SIZE;
      if (at + r.length > sectorEnd) at = sectorEnd; // records don't cross sectors
      if (at + r.length > packed.length) throw new Error(`${dirPath} has no room for ${name}`);
      r.copy(packed, at);
      at += r.length;
    }
    this.file.write(dir.lba * SECTOR_SIZE, packed);
    return { path, moved: true, lba, size: data.length };
  }

  private rootDirectory(): DirEntry {
    const pvd = this.file.read(PVD_OFFSET, SECTOR_SIZE);
    return {
      name: "",
      isDirectory: true,
      lba: pvd.readUInt32LE(156 + RECORD_LBA),
      size: pvd.readUInt32LE(156 + RECORD_SIZE),
      recordOffset: PVD_OFFSET + 156,
    };
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
