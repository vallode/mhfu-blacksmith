import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { MONSTER_GAME_IDS, monsterRecordFor } from "../src/lib/monster-ids";

const root = path.resolve(__dirname, "..");
const siteMonsters = fs.readdirSync(path.join(root, "data/monsters")).flatMap((f) =>
  (
    JSON.parse(fs.readFileSync(path.join(root, "data/monsters", f), "utf-8")).monsters as {
      name: string;
    }[]
  ).map((m) => m.name),
);

test("every site monster has one game monster ID, and no ID is shared", () => {
  assert.deepEqual(Object.keys(MONSTER_GAME_IDS).sort(), [...siteMonsters].sort());
  const ids = Object.values(MONSTER_GAME_IDS);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id > 0 && id < 90));
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
