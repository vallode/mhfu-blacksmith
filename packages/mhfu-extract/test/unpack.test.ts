import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { encryptDataBinBlock } from "../src/container/databin.js";
import { runExtract } from "../src/cli/extract.js";
import { runUnpack } from "../src/cli/unpack.js";
import { buildIso, buildSfo, type IsoFile } from "./iso-fixture.js";

const SECTOR = 2048;

/** A DATA.BIN with a one-sector TOC and one sector per file, plain or through MHFU's cipher. */
function dataBin(contents: Buffer[], encrypt = false): Buffer {
  const toc = Buffer.alloc(SECTOR);
  for (let i = 0; i <= contents.length; i++) toc.writeUInt32LE(1 + i, i * 4);
  return Buffer.concat([
    encrypt ? encryptDataBinBlock(toc, 0) : toc,
    ...contents.map((c, i) => (encrypt ? encryptDataBinBlock(c, 1 + i) : c)),
  ]);
}

const ELF = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(60)]);

/** Unpacks a disc with these files beside PARAM.SFO and an already-decrypted EBOOT.BIN. */
async function unpack(discId: string, files: IsoFile[], override = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "mhfu-extract-unpack-"));
  const iso = path.join(dir, "disc.iso");
  writeFileSync(
    iso,
    buildIso([
      { path: "PSP_GAME/PARAM.SFO", data: buildSfo(discId) },
      { path: "PSP_GAME/SYSDIR/EBOOT.BIN", data: ELF },
      ...files,
    ]),
  );
  const out = path.join(dir, "out");
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return { dir, out, manifest: await runUnpack({ iso, out, ...override }) };
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

test("unpack reads an MHF2 disc's plain DATA.BIN and copies the rest of USRDIR", async () => {
  const entries = [Buffer.alloc(SECTOR, 0x11), Buffer.alloc(SECTOR, 0x22)];
  const { dir, out, manifest } = await unpack("ULJM05156", [
    { path: "PSP_GAME/USRDIR/DATA.BIN", data: dataBin(entries) },
    { path: "PSP_GAME/USRDIR/OTHER.BIN", data: Buffer.from("other") },
    { path: "PSP_GAME/USRDIR/SUB/NESTED.BIN", data: Buffer.from("nested") },
  ]);
  try {
    assert.equal(manifest.game, "mhp2");
    assert.equal(manifest.region, "jp");
    assert.equal(manifest.fileCount, 2);
    assert.equal(manifest.dataBinEncrypted, false);
    assert.equal(manifest.dataBinUnpacked, true);
    assert.equal(manifest.usrdirFiles, 2);
    assert.deepEqual(readFileSync(path.join(out, "data-bin", "_unindexed", "0.bin")), entries[0]);
    assert.deepEqual(readFileSync(path.join(out, "data-bin", "_unindexed", "1.bin")), entries[1]);
    assert.equal(readFileSync(path.join(out, "usrdir", "OTHER.BIN"), "latin1"), "other");
    assert.equal(readFileSync(path.join(out, "usrdir", "SUB", "NESTED.BIN"), "latin1"), "nested");
    assert.equal(existsSync(path.join(out, "usrdir", "DATA.BIN")), false);
    assert.deepEqual(readFileSync(path.join(out, "eboot.bin")), ELF);

    // Nothing past unpack reads MHF2 yet, and says so rather than misreading it.
    await assert.rejects(
      runExtract({ unpacked: out, out: path.join(dir, "extracted") }),
      /Monster Hunter Freedom 2 \(MHP2nd\) \(ULJM05156\)\. This command reads MHFU/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unpack copies an MHF1 DATA.BIN it can't read as it is", async () => {
  // MHFU's cipher: MHF1's DATA.BIN isn't expected to use it, so its TOC doesn't read.
  const raw = dataBin([Buffer.alloc(SECTOR, 0x33)], true);
  const { dir, out, manifest } = await unpack("ULUS10084", [
    { path: "PSP_GAME/USRDIR/DATA.BIN", data: raw },
  ]);
  try {
    assert.equal(manifest.game, "mhp");
    assert.equal(manifest.region, "us");
    assert.equal(manifest.fileCount, 0);
    assert.equal(manifest.dataBinUnpacked, false);
    assert.equal(manifest.usrdirFiles, 1);
    assert.deepEqual(readFileSync(path.join(out, "usrdir", "DATA.BIN")), raw);
    assert.equal(existsSync(path.join(out, "data-bin")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unpack still decrypts an MHFU DATA.BIN into named files", async () => {
  const { dir, manifest } = await unpack("ULJM05500", [
    { path: "PSP_GAME/USRDIR/DATA.BIN", data: dataBin([Buffer.alloc(SECTOR, 0x44)], true) },
  ]);
  try {
    assert.equal(manifest.game, "mhp2g");
    assert.equal(manifest.dataBinEncrypted, true);
    assert.equal(manifest.fileCount, 1);
    assert.equal(manifest.usrdirFiles, undefined);
    assert.equal(manifest.dataBinUnpacked, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unpack refuses an unknown disc ID unless told the game and region", async () => {
  const files = [{ path: "PSP_GAME/USRDIR/DATA.BIN", data: dataBin([Buffer.alloc(SECTOR)]) }];
  await assert.rejects(unpack("ULJM99999", files), /Unrecognized disc.*ULJM05156 \(mhp2 jp\)/);
  await assert.rejects(unpack("ULJM99999", files, { game: "mhp2" }), /pass both or neither/);
  const { dir, manifest } = await unpack("ULJM99999", files, { game: "mhp2", region: "jp" });
  try {
    assert.equal(manifest.game, "mhp2");
    assert.equal(manifest.discId, "ULJM99999");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
