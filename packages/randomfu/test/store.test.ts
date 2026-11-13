import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { parseOvl } from "mhfu-extract/src/container/ovl.js";
import { findEquipmentStore } from "mhfu-extract/src/shops/equipment.js";
import { TABLE_COUNTS } from "mhfu-extract/src/tables/offsets.js";
import { loadGame } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import {
  buildFixtureDisc,
  buildLobbyTask,
  FIXTURE_STORE_LISTS,
  FIXTURE_STORE_TABLE,
  tempDir,
} from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

const STORE_TABLE_AT = 0x780;

/** The fixture's lobby_task.ovl with its store table's pointers zeroed. */
function withoutStore(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  out.fill(0, STORE_TABLE_AT, STORE_TABLE_AT + FIXTURE_STORE_TABLE.length * 4);
  return out;
}

test("findEquipmentStore reads the store's table and lists", () => {
  const lobby = buildLobbyTask();
  const store = findEquipmentStore(parseOvl(lobby.buf))!;
  assert.equal(store.at, STORE_TABLE_AT);
  assert.deepEqual(
    store.lists.map((l) => l.offset),
    FIXTURE_STORE_TABLE.map((name) => lobby.storeAt[name]),
  );
  assert.deepEqual(
    store.lists.map((l) => l.entries.map((e) => [e.category, e.id])),
    FIXTURE_STORE_TABLE.map((name) => FIXTURE_STORE_LISTS[name]),
  );
});

test("findEquipmentStore: null without a store, or when an ID is past its table", () => {
  const lobby = buildLobbyTask();
  assert.equal(findEquipmentStore(parseOvl(withoutStore(lobby.buf))), null);

  // A Blademaster weapon ID one past the table: not a store list, so no store.
  const bad = Buffer.from(lobby.buf);
  bad.writeUInt16LE(TABLE_COUNTS.weaponsBlademaster, lobby.storeAt.weapons1! + 2);
  assert.equal(findEquipmentStore(parseOvl(bad)), null);
});

test("without a store on the disc, the shuffles leave the overlay alone and say so", async () => {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: {} });
  const lobby = buildLobbyTask();
  game.lobbyTask = { ...game.lobbyTask, ovl: parseOvl(withoutStore(lobby.buf)) };

  const result = randomize(game, settingsWith("a", ["weapons", "armor"]));
  const report = result.reports.find((r) => r.title === "Smithy store")!;
  assert.deepEqual(report.lines, []);
  assert.match(report.notes.join(" "), /wasn't found/);
  const after = result.edits.overlay(game.lobbyTask);
  for (const name of Object.keys(FIXTURE_STORE_LISTS)) {
    const at = lobby.storeAt[name]!;
    const end = at + FIXTURE_STORE_LISTS[name]!.length * 4;
    assert.ok(after.subarray(at, end).equals(lobby.buf.subarray(at, end)), name);
  }
  source.close();
});
