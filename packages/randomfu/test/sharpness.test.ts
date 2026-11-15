import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import {
  SHARPNESS_ENTRY_SIZE,
  WEAPON_BM_ENTRY_SIZE,
  resolveTableOffset,
} from "mhfu-extract/src/tables/offsets.js";
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import { applySettings, OPTIONS } from "../src/settings.js";
import { settingsWith } from "./settings-helper.js";
import { buildFixtureDisc, FIXTURE_WEAPONS, tempDir } from "./fixtures.js";

/**
 * The fixture's sharpness table is empty, so the tests give its first four
 * curves and the Blademaster weapons (ID, amount) pairs: Great Sword rarity
 * 1 weapons each a different one.
 */
const CURVES = [
  [80, 110, 220, 320, 380, 430, 450],
  [50, 100, 200, 300, 400, 450, 450],
  [100, 200, 250, 350, 400, 440, 450],
  [30, 60, 150, 260, 350, 420, 450],
];

async function load(): Promise<{ game: GameData; close: () => void }> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso);
  const eboot = game.eboot;
  const reader = new BinaryReader(eboot);
  const table = resolveTableOffset("sharpnessTable", reader, game.resolver);
  CURVES.forEach((curve, id) =>
    curve.forEach((v, c) => eboot.writeUInt16LE(v, table + id * SHARPNESS_ENTRY_SIZE + c * 2)),
  );
  const weapons = resolveTableOffset("weaponsBlademaster", reader, game.resolver);
  FIXTURE_WEAPONS.forEach((w, k) => {
    eboot[weapons + w.index * WEAPON_BM_ENTRY_SIZE + 8] = k % CURVES.length;
    eboot[weapons + w.index * WEAPON_BM_ENTRY_SIZE + 9] = k % 7;
  });
  return { game, close: () => source.close() };
}

function pairs(game: GameData, eboot: Buffer): Map<string, string[]> {
  const weapons = resolveTableOffset("weaponsBlademaster", new BinaryReader(eboot), game.resolver);
  const out = new Map<string, string[]>();
  for (const w of FIXTURE_WEAPONS) {
    const at = weapons + w.index * WEAPON_BM_ENTRY_SIZE;
    const group = `${w.type}:${w.rarity}`;
    out.set(group, [...(out.get(group) ?? []), `${eboot[at + 8]}/${eboot[at + 9]}`].sort());
  }
  return out;
}

const sharpness = (seed: string, mode: "shuffle" | "new") =>
  applySettings(settingsWith(seed, []), {
    "weapons.sharpness": true,
    "weapons.sharpnessMode": mode,
  });

test("sharpness: off by default, a shuffle", () => {
  const option = OPTIONS.find((o) => o.key === "weapons.sharpness")!;
  assert.equal(option.default, false);
  assert.equal(option.action, "shuffle");
});

test("shuffle: weapons of a type and rarity trade (ID, amount) pairs; curves stay", async () => {
  const { game, close } = await load();
  const reader = new BinaryReader(game.eboot);
  const table = resolveTableOffset("sharpnessTable", reader, game.resolver);
  const curves = (b: Buffer) => b.subarray(table, table + 40 * SHARPNESS_ENTRY_SIZE);
  let moved = 0;
  for (const seed of ["a", "b", "c", "d"]) {
    const result = randomize(game, sharpness(seed, "shuffle"));
    const edited = result.edits.eboot();
    assert.deepEqual(pairs(game, edited), pairs(game, game.eboot), seed);
    assert.ok(curves(edited).equals(curves(game.eboot)), "curves untouched");
    const report = result.reports.find((r) => r.title === "Weapon sharpness")!;
    moved += report.lines.length;
    for (const line of report.lines) assert.match(line.text, /^.+: (R\d+ ?)?.* -> .+$/);
  }
  assert.ok(moved > 0);
  close();
});

test("new: the curves weapons use are rewritten, monotone, in steps of 10, to their length", async () => {
  const { game, close } = await load();
  const reader = new BinaryReader(game.eboot);
  const table = resolveTableOffset("sharpnessTable", reader, game.resolver);
  const result = randomize(game, sharpness("new", "new"));
  const edited = result.edits.eboot();
  assert.deepEqual(pairs(game, edited), pairs(game, game.eboot));
  let changed = 0;
  for (let id = 0; id < CURVES.length; id++) {
    const curve = Array.from({ length: 7 }, (_, c) =>
      edited.readUInt16LE(table + id * SHARPNESS_ENTRY_SIZE + c * 2),
    );
    assert.equal(curve.at(-1), 450);
    for (let c = 0; c < 7; c++) {
      assert.equal(curve[c]! % 10, 0);
      if (c > 0) assert.ok(curve[c]! >= curve[c - 1]!, `curve ${id}: ${curve.join()}`);
    }
    assert.ok(curve[0]! > 0, "some red");
    if (curve.join() !== CURVES[id]!.join()) changed++;
  }
  assert.ok(changed > 0);
  // Entries no weapon uses stay.
  const unused = table + 10 * SHARPNESS_ENTRY_SIZE;
  assert.ok(
    edited
      .subarray(unused, unused + SHARPNESS_ENTRY_SIZE)
      .equals(game.eboot.subarray(unused, unused + SHARPNESS_ENTRY_SIZE)),
  );
  assert.ok(randomize(game, sharpness("new", "new")).edits.eboot().equals(edited), "deterministic");
  close();
});
