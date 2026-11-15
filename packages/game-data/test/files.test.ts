import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { gameDataDir, readData, stringsPath } from "../src/index.js";

test("readData takes the file's path whole or in segments", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "game-data-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, "mhfu", "weapons"), { recursive: true });
  writeFileSync(path.join(dir, "mhfu", "weapons", "bow.json"), '{"weapons":[]}');
  assert.deepEqual(readData(dir, "mhfu", "weapons/bow.json"), { weapons: [] });
  assert.deepEqual(readData(dir, "mhfu", "weapons", "bow.json"), { weapons: [] });
});

test("each game's data, strings included, is in data/<game>/", () => {
  assert.equal(stringsPath("data", "mhfu", "en"), path.join("data", "mhfu", "strings", "en.json"));
  assert.equal(gameDataDir("data", "mhfu"), path.join("data", "mhfu"));
});
