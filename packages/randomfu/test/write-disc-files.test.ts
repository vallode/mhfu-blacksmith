import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { Edits } from "../src/edits.js";
import { EBOOT_PATH, loadGame } from "../src/game/load.js";
import { writeEdits } from "../src/write.js";
import { buildFixtureDisc, finish, patchInMemory, tempDir } from "./fixtures.js";

test("writeEdits adds disc files, with an edited EBOOT, and reads them back", async () => {
  const original = buildFixtureDisc();
  const image = patchInMemory(original);
  const game = await loadGame(image.source, image.iso);
  const edits = new Edits(game);
  const eboot = edits.eboot();
  eboot.writeUInt8(eboot.readUInt8(eboot.length - 1) ^ 0xff, eboot.length - 1);
  const blob = Buffer.from("RFU1 a blob that isn't sector sized");
  edits.discFile("/PSP_GAME/USRDIR/RANDOMFU.BIN", blob);

  const summary = writeEdits(image, game, edits);
  assert.equal(summary.discFiles, 1);
  assert.equal(summary.eboot, "in place");

  // The finished image, as the web app assembles it from the overlay's segments.
  const file = path.join(tempDir(), "out.iso");
  writeFileSync(file, finish(image, original));
  const { iso, source } = openDiscImage(file);
  assert.ok(iso.readFile("/PSP_GAME/USRDIR/RANDOMFU.BIN").equals(blob));
  assert.ok(iso.readFile(EBOOT_PATH).equals(eboot));
  assert.equal(source.read(16 * 2048, 2048).readUInt32LE(80), source.totalBytes / 2048);
  source.close();
});
