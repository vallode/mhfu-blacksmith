import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { decryptQuest } from "mhfu-extract/src/quests/mib.js";
import { DataBin } from "../src/disc/databin.js";
import { copyAsIso, openPatchableImage } from "../src/disc/node-file.js";
import { openQuestFile } from "../src/disc/quest-file.js";
import {
  buildCso,
  buildDataBin,
  buildIso,
  buildQuestEntry,
  buildQuestPayload,
  FIXTURE_QUESTS,
  JP_RAW,
  SECTOR,
  tempDir,
} from "./fixtures.js";

function writeTemp(name: string, data: Buffer): string {
  const file = path.join(tempDir(), name);
  writeFileSync(file, data);
  return file;
}

test("copyAsIso decompresses a CSO to the same image", () => {
  const iso = buildIso([{ path: "A/B.BIN", data: Buffer.from("hello") }]);
  const out = path.join(tempDir(), "out.iso");
  copyAsIso(writeTemp("in.cso", buildCso(iso)), out);
  assert.ok(readFileSync(out).equals(iso));
});

test("replaceFile rewrites a file in place when it still fits", () => {
  const iso = buildIso([
    { path: "D/A.BIN", data: Buffer.alloc(3000, 1) },
    { path: "D/B.BIN", data: Buffer.alloc(100, 2) },
  ]);
  const file = writeTemp("img.iso", iso);
  const image = openPatchableImage(file);
  const before = image.stat("/D/A.BIN");
  const result = image.replaceFile("/D/A.BIN", Buffer.alloc(3500, 9));
  image.close();
  assert.equal(result.moved, false);

  const { iso: reader, source } = openDiscImage(file);
  assert.ok(reader.readFile("/D/A.BIN").equals(Buffer.alloc(3500, 9)));
  assert.equal(reader.stat("/D/A.BIN").lba, before.lba);
  assert.ok(reader.readFile("/D/B.BIN").equals(Buffer.alloc(100, 2)));
  assert.equal(source.totalBytes, iso.length);
  source.close();
});

test("replaceFile moves a grown file to the end and updates the volume size", () => {
  const iso = buildIso([
    { path: "D/A.BIN", data: Buffer.alloc(100, 1) },
    { path: "D/B.BIN", data: Buffer.alloc(100, 2) },
  ]);
  const file = writeTemp("img.iso", iso);
  const image = openPatchableImage(file);
  const result = image.replaceFile("/D/A.BIN", Buffer.alloc(5000, 7));
  image.close();
  assert.equal(result.moved, true);
  assert.equal(result.lba, iso.length / SECTOR);

  const { iso: reader, source } = openDiscImage(file);
  assert.ok(reader.readFile("/D/A.BIN").equals(Buffer.alloc(5000, 7)));
  assert.ok(reader.readFile("/D/B.BIN").equals(Buffer.alloc(100, 2)));
  const pvd = source.read(16 * SECTOR, SECTOR);
  assert.equal(pvd.readUInt32LE(80), source.totalBytes / SECTOR);
  assert.equal(pvd.readUInt32BE(84), source.totalBytes / SECTOR);
  source.close();
});

test("DataBin reads files lazily and re-encrypts them to the same bytes", () => {
  const files = new Map<number, Buffer>([
    [0, Buffer.from("first")],
    [3, Buffer.alloc(5000, 3)],
    [22, Buffer.from("stored raw")],
  ]);
  const raw = buildDataBin(25, files, JP_RAW);
  const bin = new DataBin((o, l) => raw.subarray(o, o + l), raw.length, "jp");
  assert.equal(bin.fileCount, 25);
  assert.equal(bin.lengthOf(3), 3 * SECTOR);
  assert.equal(bin.read(0).toString("latin1", 0, 5), "first");
  assert.equal(bin.read(22).toString("latin1", 0, 10), "stored raw");
  for (const index of [0, 3, 22, 24]) {
    const onDisc = raw.subarray(bin.offsetOf(index), bin.offsetOf(index) + bin.lengthOf(index));
    assert.ok(bin.encode(index, bin.read(index)).equals(onDisc), `file ${index}`);
  }
  assert.throws(() => bin.encode(0, Buffer.alloc(SECTOR * 2)), /change size/);
  assert.throws(() => bin.read(25), RangeError);
});

test("a quest re-seals to its exact bytes, padding included, and carries edits", () => {
  const payload = buildQuestPayload(FIXTURE_QUESTS[0]!);
  assert.equal(payload.length % 2, 1, "fixture payload should be odd-sized");
  const entry = buildQuestEntry(payload, 2);
  const quest = openQuestFile(entry, "jp");
  assert.ok(quest.payload.equals(payload));
  assert.ok(quest.seal(Buffer.from(payload)).equals(entry));

  const edited = Buffer.from(payload);
  edited[payload.length - 1] = 0x77;
  const sealed = quest.seal(edited);
  assert.equal(sealed.length, entry.length);
  assert.ok(decryptQuest(sealed, "jp").equals(edited));
  assert.ok(sealed.subarray(0, 8).equals(entry.subarray(0, 8)), "keeps the seeds");

  // It can grow into its sector padding, and no further; it can't shrink.
  assert.equal(quest.capacity, 2 * SECTOR - 8 - 24);
  const grown = Buffer.concat([edited, Buffer.from("more")]);
  const resealed = quest.seal(grown);
  assert.equal(resealed.length, entry.length);
  assert.ok(decryptQuest(resealed, "jp").equals(grown));
  assert.ok(quest.seal(Buffer.alloc(quest.capacity, 1)).length === entry.length);
  assert.throws(() => quest.seal(Buffer.alloc(quest.capacity + 2)), /at most/);
  assert.throws(() => quest.seal(edited.subarray(0, 10)), /at most/);
});
