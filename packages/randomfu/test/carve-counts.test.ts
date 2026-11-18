import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { loadGame } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import { collectCarveCounts } from "../src/shuffles/carve-counts.js";
import { buildFixtureDisc, patchInMemory, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

async function run(changes: Record<string, string | number>) {
  const file = path.join(tempDir(), "disc.iso");
  const original = buildFixtureDisc();
  writeFileSync(file, original);
  const image = patchInMemory(original);
  const game = await loadGame(image.source, image.iso);
  const before = collectCarveCounts(game.gameSub.ovl);
  const result = randomize(game, settingsWith("counts", [], changes));
  const buf = result.edits.overlay(game.gameSub);
  const after = before.map((c) => ({ ...c, body: buf[c.offset]!, tail: buf[c.offset + 1]! }));
  return { before, after, result, openDiscImage };
}

test("carve counts are left alone by default", async () => {
  const { before, after } = await run({});
  assert.deepEqual(after, before);
});

test("shuffling carve counts keeps each kind's counts and never touches zeros", async () => {
  const { before, after, result } = await run({ "carveCounts.mode": "shuffle" });
  for (const kind of ["body", "tail"] as const) {
    assert.deepEqual(after.map((c) => c[kind]).sort(), before.map((c) => c[kind]).sort());
    before.forEach((c, i) => assert.equal(c[kind] === 0, after[i]![kind] === 0));
  }
  assert.ok(result.reports.some((r) => r.title === "Carve counts"));
});

test("randomizing carve counts rolls 1 to the maximum, skipping zeros", async () => {
  const { before, after } = await run({ "carveCounts.mode": "randomize", "carveCounts.max": 2 });
  before.forEach((c, i) => {
    for (const kind of ["body", "tail"] as const) {
      const now = after[i]![kind];
      if (c[kind] === 0) assert.equal(now, 0);
      else assert.ok(now >= 1 && now <= 2, `${c.emId} ${kind}: ${now}`);
    }
  });
});
