import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { FileSource } from "mhfu-extract/src/container/source.js";
import { OverlaySource, PatchableImage, SECTOR_SIZE } from "../src/disc/image.js";
import { openPatchableImage } from "../src/disc/node-file.js";
import { loadGame } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import { writeEdits } from "../src/write.js";
import { buildFixtureDisc, EBOOT_SIZE, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

/** The image an overlay describes, assembled from its segments. */
function assemble(overlay: OverlaySource, original: Buffer): Buffer {
  return Buffer.concat(
    overlay
      .segments()
      .map((s) => (s.kind === "original" ? original.subarray(s.start, s.end) : s.data)),
  );
}

test("OverlaySource reads through changed sectors and assembles the image", () => {
  const original = Buffer.alloc(SECTOR_SIZE * 6);
  for (let i = 0; i < original.length; i++) original[i] = i % 251;
  const file = path.join(tempDir(), "x.bin");
  writeFileSync(file, original);
  const overlay = new OverlaySource(new FileSource(file));

  const expected = Buffer.from(original);
  const write = (offset: number, data: Buffer) => {
    overlay.write(offset, data);
    data.copy(expected, offset);
  };
  write(10, Buffer.from("hello"));
  write(SECTOR_SIZE * 2 - 3, Buffer.alloc(SECTOR_SIZE + 6, 7)); // spans three sectors
  assert.ok(overlay.read(0, original.length).equals(expected));
  assert.ok(
    overlay
      .read(SECTOR_SIZE * 2 - 5, 20)
      .equals(expected.subarray(SECTOR_SIZE * 2 - 5, SECTOR_SIZE * 2 + 15)),
  );
  assert.equal(overlay.changedSectors, 4);
  assert.ok(assemble(overlay, original).equals(expected));

  // Growing past the end, then truncating.
  overlay.write(original.length + 100, Buffer.from("tail"));
  overlay.truncate(original.length + SECTOR_SIZE);
  const grown = Buffer.concat([expected, Buffer.alloc(SECTOR_SIZE)]);
  Buffer.from("tail").copy(grown, original.length + 100);
  assert.equal(overlay.totalBytes, grown.length);
  assert.ok(assemble(overlay, original).equals(grown));
  assert.ok(overlay.read(0, grown.length).equals(grown));
  overlay.close();
});

test("randomizing through an overlay gives exactly the image patching the file does", async () => {
  const dir = tempDir();
  const input = path.join(dir, "disc.iso");
  writeFileSync(input, buildFixtureDisc());
  const original = readFileSync(input);
  const settings = settingsWith(
    "same",
    ["quest-rewards", "monster-rewards", "gathering", "shops", "weapons", "armor", "recipes"],
    {
      "shops.pool": "any",
      "shops.countSpread": 0.5,
      "shops.prices": true,
    },
  );

  // On disk, as the CLI does it.
  const output = path.join(dir, "out.iso");
  writeFileSync(output, original);
  const disk = openPatchableImage(output);
  const game1 = await loadGame(disk.source, disk.iso, { eboot: {} });
  writeEdits(disk, game1, randomize(game1, settings).edits);
  disk.close();

  // In memory, as the browser does it, with the EBOOT given as a dump.
  const overlay = new OverlaySource(new FileSource(input));
  const image = new PatchableImage(overlay);
  const eboot = image.iso.readFile("/PSP_GAME/SYSDIR/EBOOT.BIN");
  assert.equal(eboot.length, EBOOT_SIZE);
  const game2 = await loadGame(overlay, image.iso, { eboot: { dump: eboot } });
  writeEdits(image, game2, randomize(game2, settings).edits);
  const fromOverlay = assemble(overlay, original);
  overlay.close();

  assert.ok(fromOverlay.equals(readFileSync(output)), "byte for byte the same");
  assert.ok(!fromOverlay.equals(original));
});

test("an EBOOT dump that isn't decrypted is refused", async () => {
  const dir = tempDir();
  const input = path.join(dir, "disc.iso");
  writeFileSync(input, buildFixtureDisc());
  const overlay = new OverlaySource(new FileSource(input));
  const image = new PatchableImage(overlay);
  await assert.rejects(
    loadGame(overlay, image.iso, { eboot: { dump: Buffer.from("~PSP encrypted") } }),
    /isn't decrypted/,
  );
  overlay.close();
});
