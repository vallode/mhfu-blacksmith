import assert from "node:assert/strict";
import { test } from "node:test";
import { getMonsterLogMonsters } from "../src/lib/monsters";
import { loggedMonsterCount, monsterLog, type MonsterLogMonster } from "../src/lib/monster-log";
import { monsterGameId } from "../src/lib/monster-ids";
import type { MonsterRecord } from "../src/lib/save-store";

const monster = (
  name: string,
  {
    category = "flying-wyvern",
    small = false,
    baseSize,
    crowns,
  }: {
    category?: MonsterLogMonster["category"];
    small?: boolean;
    baseSize?: number;
    crowns?: MonsterLogMonster["crowns"];
  } = {},
): MonsterLogMonster => ({
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  category,
  small,
  ...(baseSize !== undefined && { baseSize }),
  ...(crowns && { crowns }),
});

const record = (id: number, kills = 0, captures = 0, largest = 0, smallest = 0): MonsterRecord => ({
  id,
  kills,
  captures,
  largest,
  smallest,
});

const names = (groups: ReturnType<typeof monsterLog>) =>
  groups.map((group) => group.rows.map((row) => row.monster.name));

test("monsterLog keeps the monsters with a record, large first, in the data's order", () => {
  const monsters = [
    monster("Rathian", {
      baseSize: 1000,
      crowns: { mini: 90, silver: 110, gold: 120 },
    }),
    monster("Kelbi", { category: "herbivore", small: true }),
    monster("Rathalos"),
    monster("Velociprey", { small: true }),
  ];
  const groups = monsterLog(monsters, [
    record(16, 7),
    record(11, 1),
    record(3, 41),
    record(1, 5, 2, 120, 90),
  ]);
  assert.deepEqual(names(groups), [
    ["Rathian", "Rathalos"],
    ["Kelbi", "Velociprey"],
  ]);
  assert.deepEqual(
    groups.map(({ small, kills, captures }) => [small, kills, captures]),
    [
      [false, 6, 2],
      [true, 48, 0],
    ],
  );
  assert.deepEqual(
    groups[0]!.rows.map(({ kills, captures, largest, smallest }) => [
      kills,
      captures,
      largest,
      smallest,
    ]),
    [
      [5, 2, 120, 90],
      [1, 0, 0, 0],
    ],
  );
});

test("a size-only record still makes a row", () => {
  const monsters = [
    monster("Rathian", {
      baseSize: 1000,
      crowns: { mini: 90, silver: 110, gold: 120 },
    }),
    monster("Kelbi", { category: "herbivore", small: true }),
  ];
  const groups = monsterLog(monsters, [record(1, 0, 0, 130)]);
  assert.deepEqual(names(groups), [["Rathian"], []]);
  assert.deepEqual(groups[0]!.rows[0], {
    monster: monsters[0],
    kills: 0,
    captures: 0,
    largest: 130,
    smallest: 0,
  });
  assert.deepEqual(
    groups.map(({ kills, captures }) => [kills, captures]),
    [
      [0, 0],
      [0, 0],
    ],
  );
});

test("monsterLog leaves out records that say nothing, and records with no site monster", () => {
  const monsters = [monster("Rathian"), monster("Rathalos")];
  const groups = monsterLog(monsters, [record(1), record(10, 3), record(999, 9, 9, 9, 9)]);
  assert.deepEqual(names(groups), [[], []]);
  assert.deepEqual(
    groups.map(({ kills, captures }) => [kills, captures]),
    [
      [0, 0],
      [0, 0],
    ],
  );
});

test("monsterLog is empty without the save's monster tables", () => {
  const monsters = [monster("Rathian"), monster("Kelbi", { category: "herbivore", small: true })];
  assert.deepEqual(monsterLog(monsters, undefined), [
    { small: false, rows: [], kills: 0, captures: 0 },
    { small: true, rows: [], kills: 0, captures: 0 },
  ]);
});

test("loggedMonsterCount counts the site's monsters with a record", () => {
  const records = [
    record(1, 1),
    record(10, 2),
    record(999),
    record(11),
    record(3, 0, 4),
    record(76, 0, 0, 0, 100),
  ];
  assert.equal(loggedMonsterCount(records), 3);
  assert.equal(loggedMonsterCount([]), 0);
  assert.equal(loggedMonsterCount(undefined), null);
});

test("the log's monsters come from data/monsters, all with a game ID and their sizes", () => {
  const monsters = getMonsterLogMonsters();
  assert.ok(monsters.length > 0);
  assert.ok(
    monsters.every((m) => monsterGameId(m.name) !== undefined),
    "every site monster has an ID for the save's tables",
  );
  const giadrome = monsters.find((m) => m.name === "Giadrome");
  assert.deepEqual(
    [giadrome?.category, giadrome?.small, giadrome?.baseSize, !!giadrome?.crowns],
    ["bird-wyvern", false, 738.4, true],
  );
  const kelbi = monsters.find((m) => m.name === "Kelbi");
  assert.deepEqual(
    [kelbi?.category, kelbi?.small, kelbi?.baseSize],
    ["herbivore", true, undefined],
  );
});
