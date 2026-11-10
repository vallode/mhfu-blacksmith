/**
 * Disc image files on disk, for the CLI and the local settings page. The
 * browser app uses `OverlaySource` (image.ts) over the user's file instead.
 */
import { closeSync, fstatSync, ftruncateSync, openSync, readSync, writeSync } from "node:fs";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { PatchableImage, type WritableSource } from "./image.js";

const COPY_CHUNK = 4 * 1024 * 1024;

/** A file opened for reading and writing. */
export class ReadWriteFile implements WritableSource {
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

/** Opens an image file on disk for patching in place. */
export function openPatchableImage(path: string): PatchableImage {
  return new PatchableImage(new ReadWriteFile(path));
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
