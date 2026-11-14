import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readData } from "../src/index.js";

test("readData takes the file's path whole or in segments", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "game-data-"));
  mkdirSync(path.join(dir, "weapons"));
  writeFileSync(path.join(dir, "weapons", "bow.json"), '{"weapons":[]}');
  assert.deepEqual(readData(dir, "weapons/bow.json"), { weapons: [] });
  assert.deepEqual(readData(dir, "weapons", "bow.json"), { weapons: [] });
});
