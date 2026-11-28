import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { huntTotals, MONSTER_GAME_IDS, monsterRecordFor } from "../src/lib/monster-ids";
import { getSmallMonsterIds } from "../src/lib/monsters";
import { DATA_DIR, GAME, GAME_DATA_DIR } from "../src/lib/paths";
import { readData, readRawData } from "game-data";

const siteMonsters = fs.readdirSync(path.join(GAME_DATA_DIR, "monsters")).flatMap((f) =>
  (
    readData(DATA_DIR, GAME, "monsters", f).monsters as {
      name: string;
    }[]
  ).map((m) => m.name),
);

/** Every monster in data/mhfu/monsters, with the disc's small flag (raw, so it keeps IDs). */
const monsterData = fs.readdirSync(path.join(GAME_DATA_DIR, "monsters")).flatMap(
  (f) =>
    readRawData(DATA_DIR, GAME, "monsters", f).monsters as {
      id: number;
      small?: boolean;
    }[],
);

/** Every spawn in the quests, which the game marks as small or large (raw, so monsters stay IDs). */
const quests = fs.readdirSync(path.join(GAME_DATA_DIR, "quests")).flatMap(
  (f) =>
    readRawData(DATA_DIR, GAME, "quests", f).quests as {
      large_monsters: { monster: number }[];
      small_monsters: { monster: number }[];
    }[],
);

test("every site monster has one game monster ID, and no ID is shared", () => {
  assert.deepEqual(Object.keys(MONSTER_GAME_IDS).sort(), [...siteMonsters].sort());
  const ids = Object.values(MONSTER_GAME_IDS);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id > 0 && id < 90));
});

test("data/mhfu/monsters marks exactly the monsters quests spawn only as small monsters", () => {
  const marked = monsterData
    .filter((m) => m.small)
    .map((m) => m.id)
    .sort((a, b) => a - b);
  const large = new Set(quests.flatMap((q) => q.large_monsters.map((m) => m.monster)));
  const small = new Set(quests.flatMap((q) => q.small_monsters.map((m) => m.monster)));
  const expected = monsterData
    .map((m) => m.id)
    .filter((id) => small.has(id))
    .sort((a, b) => a - b);

  assert.deepEqual(marked, expected);
  assert.ok(expected.every((id) => !large.has(id)));
});

test("getSmallMonsterIds lists the monsters data marks small", () => {
  const marked = monsterData
    .filter((m) => m.small)
    .map((m) => m.id)
    .sort((a, b) => a - b);
  assert.deepEqual(getSmallMonsterIds(), marked);
});

test("huntTotals splits kills by size and keeps captures together", () => {
  const record = (id: number, kills: number, captures = 0) => ({
    id,
    kills,
    captures,
    largest: 0,
    smallest: 0,
  });
  const small = new Set([3, 12]); // Kelbi and Aptonoth
  assert.deepEqual(huntTotals([], small), { large: 0, small: 0, captured: 0 });
  assert.deepEqual(
    // Rathian and Velocidrome are large; 72 (a second Yama Tsukami the
    // site has no page for) counts as large.
    huntTotals(
      [record(1, 3, 2), record(3, 40), record(12, 10), record(27, 1, 1), record(72, 5)],
      small,
    ),
    { large: 9, small: 50, captured: 3 },
  );
});

test("monsterRecordFor: the record, zeros without one, null without tables or an ID", () => {
  const rathian = { id: 1, kills: 3, captures: 2, largest: 110, smallest: 95 };
  assert.deepEqual(monsterRecordFor([rathian], "Rathian"), rathian);
  assert.deepEqual(monsterRecordFor([rathian], "Rathalos"), {
    id: 11,
    kills: 0,
    captures: 0,
    largest: 0,
    smallest: 0,
  });
  assert.equal(monsterRecordFor(undefined, "Rathian"), null);
  assert.equal(monsterRecordFor([rathian], "Not A Monster"), null);
});
