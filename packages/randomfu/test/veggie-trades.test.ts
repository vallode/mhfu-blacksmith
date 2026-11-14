import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { TRADE_ROW_SIZE, VEGGIE_TRADES_JP } from "mhfu-extract/src/tables/veggie-trades.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import { collectTradeSlots, elderName } from "../src/shuffles/veggie-trades.js";
import {
  buildFixtureDisc,
  FIXTURE_TRADES,
  GAME_TASK_INDEX,
  TASK_LOAD,
  tempDir,
} from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

const FILE = path.join(tempDir(), "disc.iso");
writeFileSync(FILE, buildFixtureDisc());

async function load(): Promise<{ game: GameData; close: () => void }> {
  const { source, iso } = openDiscImage(FILE);
  const game = await loadGame(source, iso, { eboot: null });
  return { game, close: () => source.close() };
}

/** Each Elder's rows as `randomize` left them, [give, common, rare]. */
function readTrades(task: Buffer): [number, number, number][][] {
  let at = VEGGIE_TRADES_JP - TASK_LOAD;
  return FIXTURE_TRADES.map((rows) => {
    const out = rows.map((): [number, number, number] => {
      const row: [number, number, number] = [
        task.readUInt16LE(at),
        task.readUInt16LE(at + 2),
        task.readUInt16LE(at + 4),
      ];
      at += TRADE_ROW_SIZE;
      return row;
    });
    at += 2;
    return out;
  });
}

const pairs = (rows: [number, number, number][]) =>
  rows.map(([, common, rare]) => `${common}/${rare}`).sort();

test("the Elders' trades are read from game_task.ovl, in list order", async () => {
  const { game, close } = await load();
  try {
    const slots = collectTradeSlots(game.gameTask);
    assert.equal(slots.length, 28);
    assert.deepEqual(
      slots.filter((s) => s.elder === 1).map((s) => [s.give, s.common, s.rare]),
      FIXTURE_TRADES[1],
    );
    assert.equal(elderName(0), "Forest and Hills");
    assert.equal(elderName(6), "Old Swamp");
  } finally {
    close();
  }
});

test("trades move within each Elder: rows keep what he takes, common and rare stay paired", async () => {
  const { game, close } = await load();
  try {
    const result = randomize(game, settingsWith("trades", ["veggie-trades"]));
    const after = readTrades(result.edits.files.get(GAME_TASK_INDEX)!);
    let moved = 0;
    after.forEach((rows, elder) => {
      const before = FIXTURE_TRADES[elder]!;
      assert.deepEqual(
        rows.map((r) => r[0]),
        before.map((r) => r[0]),
      );
      assert.deepEqual(pairs(rows), pairs(before));
      moved += rows.filter((r, i) => r[1] !== before[i]![1]).length;
    });
    assert.ok(moved > 0);
    const report = result.reports.find((r) => r.title === "Veggie Elder trades")!;
    assert.equal(report.lines.length, 28);
    assert.match(report.lines[0]!.where, /^Veggie Elder: Forest and Hills$/);
  } finally {
    close();
  }
});

test("with any Elder, trades move between Elders; nothing is lost", async () => {
  const { game, close } = await load();
  try {
    const result = randomize(
      game,
      settingsWith("trades-all", ["veggie-trades"], { "trades.mix": "all" }),
    );
    const after = readTrades(result.edits.files.get(GAME_TASK_INDEX)!);
    assert.deepEqual(pairs(after.flat()), pairs(FIXTURE_TRADES.flat()));
    const crossed = after.some((rows, elder) =>
      pairs(rows).some((p) => !pairs(FIXTURE_TRADES[elder]!).includes(p)),
    );
    assert.ok(crossed, "some trade moved to another Elder");
  } finally {
    close();
  }
});

test("off by default", async () => {
  const { game, close } = await load();
  try {
    const result = randomize(game, settingsWith("none", []));
    assert.equal(result.edits.files.get(GAME_TASK_INDEX), undefined);
  } finally {
    close();
  }
});
