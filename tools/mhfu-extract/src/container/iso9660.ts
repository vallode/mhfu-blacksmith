/**
 * Minimal read-only ISO 9660 walker — just enough to pull a handful of
 * known-path files (PARAM.SFO, EBOOT.BIN, DATA.BIN) out of a UMD image.
 * Assumes the plain ISO 9660 primary volume descriptor (no Joliet/Rock
 * Ridge needed, since every path we care about is 8.3-safe).
 *
 * Layout reference: ECMA-119 / the well-known "yellow book" ISO 9660 spec.
 * PSP UMD layout reference: https://www.psdevwiki.com/psp/index.php/ISO
 */
import type { RandomAccessSource } from "./source.js";

const SECTOR_SIZE = 2048;
const PVD_LBA = 16;

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  lba: number;
  size: number;
}

function parseDirectoryRecord(
  buf: Buffer,
  offset: number,
): { entry: DirEntry; recordLength: number } | null {
  const recordLength = buf.readUInt8(offset);
  if (recordLength === 0) return null;

  const lba = buf.readUInt32LE(offset + 2); // little-endian half of the both-endian field
  const size = buf.readUInt32LE(offset + 10);
  const flags = buf.readUInt8(offset + 25);
  const isDirectory = (flags & 0x02) !== 0;
  const identifierLength = buf.readUInt8(offset + 32);
  let name = buf.toString("latin1", offset + 33, offset + 33 + identifierLength);

  // Strip the ";<version>" suffix ISO 9660 appends to file (not directory)
  // identifiers, e.g. "EBOOT.BIN;1" -> "EBOOT.BIN".
  const semi = name.indexOf(";");
  if (semi !== -1) name = name.slice(0, semi);

  return { entry: { name, isDirectory, lba, size }, recordLength };
}

export class Iso9660Reader {
  private rootEntry: DirEntry;

  constructor(private readonly source: RandomAccessSource) {
    const pvd = this.readSector(PVD_LBA);
    if (pvd.readUInt8(0) !== 1 || pvd.toString("latin1", 1, 6) !== "CD001") {
      throw new Error("Not an ISO 9660 image (bad primary volume descriptor)");
    }
    const rootRecordOffset = 156;
    const parsed = parseDirectoryRecord(pvd, rootRecordOffset);
    if (!parsed) throw new Error("Missing root directory record in PVD");
    this.rootEntry = parsed.entry;
  }

  private readSector(lba: number): Buffer {
    return this.source.read(lba * SECTOR_SIZE, SECTOR_SIZE);
  }

  private readDirectory(dir: DirEntry): DirEntry[] {
    const sectorCount = Math.ceil(dir.size / SECTOR_SIZE);
    const raw = this.source.read(dir.lba * SECTOR_SIZE, sectorCount * SECTOR_SIZE);
    const entries: DirEntry[] = [];

    for (let sector = 0; sector < sectorCount; sector++) {
      let offset = sector * SECTOR_SIZE;
      const sectorEnd = offset + SECTOR_SIZE;
      while (offset < sectorEnd) {
        const parsed = parseDirectoryRecord(raw, offset);
        if (!parsed) break; // padding to end of sector
        // Skip the "." and ".." self/parent entries (identifier length 1,
        // byte value 0x00 or 0x01).
        if (parsed.entry.name.length > 0) entries.push(parsed.entry);
        offset += parsed.recordLength;
      }
    }
    return entries;
  }

  listRoot(): DirEntry[] {
    return this.readDirectory(this.rootEntry);
  }

  /** Resolves a "/"-separated path (case-insensitive) to its directory entry. */
  stat(path: string): DirEntry {
    const parts = path.split("/").filter(Boolean);
    let current = this.rootEntry;
    let entries = this.readDirectory(current);

    for (const [i, part] of parts.entries()) {
      const match = entries.find((e) => e.name.toUpperCase() === part.toUpperCase());
      if (!match) throw new Error(`Path not found in ISO: ${path} (missing segment "${part}")`);
      current = match;
      if (i < parts.length - 1) {
        if (!current.isDirectory)
          throw new Error(`Path segment "${part}" in ${path} is not a directory`);
        entries = this.readDirectory(current);
      }
    }
    return current;
  }

  readFile(path: string): Buffer {
    const entry = this.stat(path);
    if (entry.isDirectory) throw new Error(`${path} is a directory, not a file`);
    return this.source.read(entry.lba * SECTOR_SIZE, entry.size);
  }
}
