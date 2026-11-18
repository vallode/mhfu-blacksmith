/**
 * A tiny ISO 9660 image and PARAM.SFO for tests, so `unpack` (and randomfu,
 * which reads discs the same way) can run on a made-up disc: no real disc
 * image is ever committed.
 */
const SECTOR = 2048;

export interface IsoFile {
  path: string; // e.g. "PSP_GAME/USRDIR/DATA.BIN"
  data: Buffer;
}

function both32(buf: Buffer, offset: number, value: number): void {
  buf.writeUInt32LE(value, offset);
  buf.writeUInt32BE(value, offset + 4);
}

function dirRecord(
  name: Buffer,
  lba: number,
  size: number,
  isDir: boolean,
  systemUse = Buffer.alloc(0),
): Buffer {
  const nameEnd = 33 + name.length + (name.length % 2 === 0 ? 1 : 0);
  const length = nameEnd + systemUse.length;
  const rec = Buffer.alloc(length);
  rec[0] = length;
  both32(rec, 2, lba);
  both32(rec, 10, size);
  rec[25] = isDir ? 2 : 0;
  rec.writeUInt16LE(1, 28);
  rec.writeUInt16BE(1, 30);
  rec[32] = name.length;
  name.copy(rec, 33);
  systemUse.copy(rec, nameEnd);
  return rec;
}

/** The XA system-use field UMD images give each file. */
export const UMD_FILE_XA = Buffer.from("00000000" + "0d555841" + "000000000000", "hex");

/**
 * Builds an image with one directory sector per directory and each file
 * sector-aligned. `umd` names files as UMD images do: no ";1", and an XA field.
 */
export function buildIso(files: IsoFile[], { umd = false } = {}): Buffer {
  const dirs = new Map<string, { lba: number; children: string[] }>();
  const dirOf = (p: string) => p.split("/").slice(0, -1).join("/");
  const ensureDir = (d: string): void => {
    if (dirs.has(d)) return;
    dirs.set(d, { lba: 0, children: [] });
    if (d !== "") {
      ensureDir(dirOf(d));
      dirs.get(dirOf(d))!.children.push(d);
    }
  };
  ensureDir("");
  for (const f of files) {
    ensureDir(dirOf(f.path));
    dirs.get(dirOf(f.path))!.children.push(f.path);
  }

  let next = 18;
  for (const d of dirs.values()) d.lba = next++;
  const fileLba = new Map<string, number>();
  for (const f of files) {
    fileLba.set(f.path, next);
    next += Math.max(1, Math.ceil(f.data.length / SECTOR));
  }

  const image = Buffer.alloc(next * SECTOR);
  const pvd = image.subarray(16 * SECTOR, 17 * SECTOR);
  pvd[0] = 1;
  pvd.write("CD001", 1, "latin1");
  pvd[6] = 1;
  both32(pvd, 80, next);
  dirRecord(Buffer.from([0]), dirs.get("")!.lba, SECTOR, true).copy(pvd, 156);
  const term = image.subarray(17 * SECTOR, 18 * SECTOR);
  term[0] = 255;
  term.write("CD001", 1, "latin1");

  const fileByPath = new Map(files.map((f) => [f.path, f]));
  for (const [d, { lba, children }] of dirs) {
    const parent = dirs.get(d === "" ? "" : dirOf(d))!;
    const records = [
      dirRecord(Buffer.from([0]), lba, SECTOR, true),
      dirRecord(Buffer.from([1]), parent.lba, SECTOR, true),
      ...children.map((child) => {
        const name = child.split("/").at(-1)!;
        const file = fileByPath.get(child);
        return file
          ? dirRecord(
              Buffer.from(umd ? name : `${name};1`, "latin1"),
              fileLba.get(child)!,
              file.data.length,
              false,
              umd ? UMD_FILE_XA : undefined,
            )
          : dirRecord(Buffer.from(name, "latin1"), dirs.get(child)!.lba, SECTOR, true);
      }),
    ];
    Buffer.concat(records).copy(image, lba * SECTOR);
  }
  for (const f of files) f.data.copy(image, fileLba.get(f.path)! * SECTOR);
  return image;
}

export function buildSfo(discId: string): Buffer {
  const key = Buffer.from("DISC_ID\0", "latin1");
  const value = Buffer.alloc(16);
  value.write(discId, 0, "utf8");
  const keyTable = 0x14 + 16;
  const dataTable = keyTable + 8;
  const buf = Buffer.alloc(dataTable + value.length);
  buf.writeUInt32LE(0x46535000, 0);
  buf.writeUInt32LE(0x101, 4);
  buf.writeUInt32LE(keyTable, 8);
  buf.writeUInt32LE(dataTable, 12);
  buf.writeUInt32LE(1, 16);
  buf.writeUInt16LE(0, 0x14);
  buf.writeUInt16LE(0x0204, 0x16);
  buf.writeUInt32LE(discId.length + 1, 0x18);
  buf.writeUInt32LE(16, 0x1c);
  buf.writeUInt32LE(0, 0x20);
  key.copy(buf, keyTable);
  value.copy(buf, dataTable);
  return buf;
}
