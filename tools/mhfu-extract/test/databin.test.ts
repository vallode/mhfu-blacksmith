import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptDataBinBlock, encryptDataBinBlock, unpackDataBin } from "../src/container/databin.js";

test("encryptDataBinBlock / decryptDataBinBlock round-trip", () => {
  const original = Buffer.from(Array.from({ length: 64 }, (_, i) => i * 7 + 3));
  for (const lba of [0, 1, 17, 162189, 0xffff, 0x10000]) {
    const encrypted = encryptDataBinBlock(original, lba);
    const decrypted = decryptDataBinBlock(encrypted, lba);
    assert.deepEqual(decrypted, original, `round-trip failed for lba=${lba}`);
  }
});

test("decryptDataBinBlock rejects lengths not a multiple of 4", () => {
  assert.throws(() => decryptDataBinBlock(Buffer.alloc(5), 0));
});

test("unpackDataBin walks a synthetic TOC and decrypts each file", () => {
  const SECTOR = 2048;
  // 3 files of 1 sector each, plus TOC. TOC itself takes 1 sector (512 u32
  // slots is overkill for 4 entries, but keeps this simple/aligned).
  const tocSectors = 1;
  const fileSectors = 3;
  const totalSectors = tocSectors + fileSectors;

  // toc[0] does double duty as both "TOC size in sectors" AND file 0's start
  // LBA (file 0 always starts immediately after the TOC) — confirmed against
  // a real disc, see container/databin.ts's docstring.
  const toc = new Uint32Array(SECTOR / 4);
  toc[0] = tocSectors; // == file 0 start
  toc[1] = tocSectors + 1; // file 0 end / file 1 start
  toc[2] = tocSectors + 2; // file 1 end / file 2 start
  toc[3] = tocSectors + 3; // file 2 end == sentinel (totalSectors)

  const tocBuf = Buffer.alloc(SECTOR);
  for (let i = 0; i < toc.length; i++) tocBuf.writeUInt32LE(toc[i]!, i * 4);
  const encryptedToc = encryptDataBinBlock(tocBuf, 0);

  const fileContents = [Buffer.alloc(SECTOR, 0x11), Buffer.alloc(SECTOR, 0x22), Buffer.alloc(SECTOR, 0x33)];
  const encryptedFiles = fileContents.map((content, i) => encryptDataBinBlock(content, tocSectors + i));

  const raw = Buffer.concat([encryptedToc, ...encryptedFiles]);
  const files = unpackDataBin(raw, "jp");

  assert.equal(files.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(files[i]!.index, i);
    assert.equal(files[i]!.startLba, tocSectors + i);
    assert.deepEqual(files[i]!.data, fileContents[i]);
  }
});
