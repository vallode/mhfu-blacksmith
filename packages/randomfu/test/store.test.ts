import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { parseOvl } from "mhfu-extract/src/container/ovl.js";
import { findEquipmentStore } from "mhfu-extract/src/shops/equipment.js";
import { findStarterGear } from "mhfu-extract/src/shops/starter.js";
import { TABLE_COUNTS } from "mhfu-extract/src/tables/offsets.js";
import { loadGame } from "whetstone/src/game/load.js";
import { randomize } from "../src/randomize.js";
import {
  ADD_TO_BOX,
  buildEditTask,
  buildFixtureDisc,
  buildLobbyTask,
  FIXTURE_ARMOR,
  FIXTURE_ARMOR_CREATE,
  FIXTURE_RECIPES,
  FIXTURE_STARTER,
  FIXTURE_STARTER_WORN,
  FIXTURE_STORE_LISTS,
  FIXTURE_STORE_TABLE,
  tempDir,
} from "whetstone/test/fixtures.js";
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
  const game = await loadGame(source, iso);
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

test("findStarterGear reads the add-to-box calls with constant arguments", () => {
  const edit = buildEditTask();
  const gear = findStarterGear(parseOvl(edit.buf))!;
  assert.equal(gear.routine, ADD_TO_BOX, "not the routine called once with a weapon");
  assert.deepEqual(
    gear.entries.map((e) => [e.category, e.id]),
    FIXTURE_STARTER,
    "every constant call, and none whose arguments a register, another call or a branch decides",
  );
  assert.deepEqual(
    gear.entries.map((e) => e.worn),
    FIXTURE_STARTER_WORN,
  );
  assert.deepEqual(
    gear.entries.map((e) => e.at),
    edit.idAt,
  );
  for (const e of gear.entries) assert.equal(edit.buf.readUInt16LE(e.at), e.id);
  // Without a weapon there's nothing to take.
  const none = Buffer.from(edit.buf);
  for (let at = 0x80; at < none.length; at += 4) {
    const word = none.readUInt32LE(at);
    if (word === 0x24050005 || word === 0x24050006) none.writeUInt32LE(0x24050001, at); // a weapon -> head armor
  }
  assert.equal(findStarterGear(parseOvl(none)), null);
});

test("a new hunter's equipment box follows the weapons and armor shuffles, as the store does", async () => {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso);
  const { storeAt } = buildLobbyTask();
  const { idAt } = buildEditTask();
  // The store's new ID for each (category, old ID) it sold.
  const storeNow = (lobby: Buffer) => {
    const now = new Map<string, number>();
    for (const [name, entries] of Object.entries(FIXTURE_STORE_LISTS)) {
      entries.forEach(([category, id], k) =>
        now.set(`${category}:${id}`, lobby.readUInt16LE(storeAt[name]! + k * 4 + 2)),
      );
    }
    return now;
  };
  let movedAny = false;
  for (const seed of ["a", "b", "c", "d"]) {
    const result = randomize(game, settingsWith(seed, ["weapons", "armor"]));
    const store = storeNow(result.edits.overlay(game.lobbyTask));
    const box = result.edits.overlay(game.editTask!);
    FIXTURE_STARTER.forEach(([category, id], k) => {
      const now = box.readUInt16LE(idAt[k]!);
      assert.equal(now, store.get(`${category}:${id}`), `${seed}: ${category}:${id}`);
      if (now !== id) movedAny = true;
    });
    const report = result.reports.find((r) => r.title === "Starting equipment")!;
    assert.equal(report.lines.length, FIXTURE_STARTER.length, "one line per piece");
    assert.equal(
      report.lines.filter((l) => l.text.endsWith(" (worn)")).length,
      FIXTURE_STARTER_WORN.filter(Boolean).length,
      "worn pieces say so",
    );
  }
  assert.ok(movedAny, "some seed changes the starting equipment");

  // Without the weapons and armor shuffles, the box is left alone.
  const other = randomize(game, settingsWith("a", ["recipes"]));
  assert.ok(!other.reports.some((r) => r.title === "Starting equipment"));
  assert.ok(!other.edits.files.has(game.editTask!.index), "not even copied");
  source.close();
});

test("armor.start draws a new hunter's armor from what a new hunter can wear, apart from the shuffle", async () => {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso);
  const { idAt } = buildEditTask();
  const slotOf = { 0: "leg", 1: "head", 2: "chest", 3: "arm", 4: "waist" } as const;
  // Pieces some create entry makes, by slot.
  const made = new Set([
    ...FIXTURE_RECIPES.map((r) => `head:${r.index}`),
    ...Object.entries(FIXTURE_ARMOR_CREATE).flatMap(([slot, entries]) =>
      entries.map(([, piece]) => `${slot}:${piece}`),
    ),
  ]);
  // For Blademasters and both sexes: bits 1, 2 and 4.
  const wearable = (slot: string, id: number) =>
    made.has(`${slot}:${id}`) &&
    FIXTURE_ARMOR.some((a) => a.slot === slot && a.index === id && (a.hunterType & 7) === 7);
  const seen = new Set<string>();
  for (const start of ["rank", "any"] as const) {
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      for (const shuffles of [[], ["armor"], ["weapons", "armor"]] as const) {
        const settings = settingsWith(seed, [...shuffles], { "armor.start": start });
        const result = randomize(game, settings);
        const box = result.edits.overlay(game.editTask!);
        FIXTURE_STARTER.forEach(([category, id], k) => {
          const now = box.readUInt16LE(idAt[k]!);
          if (category > 4) {
            if (shuffles.length === 0) assert.equal(now, id, "weapons stay without their shuffle");
            return;
          }
          const slot = slotOf[category as keyof typeof slotOf];
          assert.ok(wearable(slot, now), `${seed} ${start}: ${slot} ${id} -> ${now}`);
          seen.add(`${slot}:${now}`);
        });
        const report = result.reports.find((r) => r.title === "Starting equipment")!;
        const armorLines = report.lines.filter((l) => l.where.startsWith("Armor:"));
        assert.equal(armorLines.length, 3, "one line per armor ID in the box");
        assert.ok(armorLines.every((l) => / -> /.test(l.text)));
        assert.match(report.notes.join(" "), /doesn't follow the armor shuffle/);
        assert.equal(
          result.reports.some((r) => r.title === "Smithy store"),
          shuffles.length > 0,
          "the store is reported only when a shuffle moves it",
        );
        if (shuffles.length > 0) {
          // The draw has its own stream: the smithy shuffles as without it.
          const alone = randomize(game, settingsWith(seed, [...shuffles]));
          assert.ok(result.edits.eboot().equals(alone.edits.eboot()));
        }
      }
    }
  }
  // The leg (worn) draws from all three legs; the heads from the five for anyone.
  for (const piece of ["leg:1", "leg:2", "leg:3", "head:1", "head:5"]) {
    assert.ok(seen.has(piece), piece);
  }
  source.close();
});
