/** Grouping of monster attack records, and the committed attack data against the monster list. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { groupAttacks } from "../src/lib/monster-attacks";
import { DATA_DIR } from "../src/lib/paths";
import { readData } from "game-data";

describe("groupAttacks", () => {
  test("groups identical records, sorted by damage descending", () => {
    const rows = groupAttacks([
      { damage: 0, guard: 10 },
      { damage: 20, guard: 30, stun: 10 },
      { damage: 10, guard: 30 },
      { damage: 20, guard: 30, stun: 10 },
      { damage: 10, guard: 30, statuses: ["poison"], statusValue: 25 },
      { damage: 20, guard: 30, stun: 10 },
    ]);
    assert.deepEqual(rows, [
      { damage: 20, guard: 30, count: 3, stun: 10 },
      { damage: 10, guard: 30, count: 1 },
      { damage: 10, guard: 30, count: 1, statuses: ["poison"], statusValue: 25 },
      { damage: 0, guard: 10, count: 1 },
    ]);
  });
});

describe("data/monster-attacks.json", () => {
  test("every family monster exists and is in one family only", () => {
    const names = new Set<string>();
    for (const f of fs.readdirSync(path.join(DATA_DIR, "monsters"))) {
      for (const m of readData<{ monsters: { name: string }[] }>(DATA_DIR, "monsters", f).monsters)
        names.add(m.name);
    }
    const seen = new Set<string>();
    const { families } = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, "monster-attacks.json"), "utf8"),
    );
    for (const fam of families) {
      for (const name of fam.monsters) {
        assert.ok(names.has(name), `unknown monster ${name}`);
        assert.ok(!seen.has(name), `${name} in two families`);
        seen.add(name);
      }
    }
  });
});
