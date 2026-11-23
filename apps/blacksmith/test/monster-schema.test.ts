/**
 * Compact monster bundle decoding (lib/schema.ts): the hitzone rows' flinch
 * thresholds the data build works out.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeMonster, decodeMonsterListItem, type Dictionaries } from "../src/lib/schema";
import { encodeTolerances } from "../src/lib/monster-status";
import type { MonsterTolerances } from "../src/lib/types";

const dict = {
  strings: ["Head", "Tail", "180", "100–160"],
  material_ids: [],
} as unknown as Dictionaries;
const values = [45, 45, 40, 0, 10, 20, 15, 30, 100];

test("decodeMonster reads each hitzone row's flinch threshold by part", () => {
  const monster = decodeMonster(
    dict,
    {
      n: "Rathalos",
      s: "rathalos",
      hz: [
        [0, values],
        [1, values],
      ],
      hf: [2, 3],
    },
    "flying-wyvern",
  );
  assert.deepEqual(monster.hitzone_flinch, { Head: "180", Tail: "100–160" });
});

test("decodeMonster leaves out rows without a flinch threshold", () => {
  const monster = decodeMonster(
    dict,
    {
      n: "Rathalos",
      s: "rathalos",
      hz: [
        [0, values],
        [1, values],
      ],
      hf: [null, 3],
    },
    "flying-wyvern",
  );
  assert.deepEqual(monster.hitzone_flinch, { Tail: "100–160" });
});

test("decodeMonster keeps flinch thresholds when no row has one", () => {
  const monster = decodeMonster(
    dict,
    { n: "Felyne", s: "felyne", hz: [[0, values]], hf: [null] },
    "lynian",
  );
  assert.deepEqual(monster.hitzone_flinch, {});
});

test("decodeMonster has no flinch thresholds when the bundle has none", () => {
  const monster = decodeMonster(dict, { n: "Kelbi", s: "kelbi", hz: [[0, values]] }, "herbivore");
  assert.equal(monster.hitzone_flinch, undefined);
});

test("decodeMonster reads the size range, in percent", () => {
  const monster = decodeMonster(
    dict,
    { n: "Kushala Daora", s: "kushala-daora", bs: 1577, sz: [90, 133] },
    "elder-dragon",
  );
  assert.deepEqual(monster.size_range, { min: 90, max: 133 });
  assert.equal(
    decodeMonster(dict, { n: "Kirin", s: "kirin" }, "elder-dragon").size_range,
    undefined,
  );
});

test("decodeMonsterListItem reads the capturable flag", () => {
  assert.deepEqual(decodeMonsterListItem({ n: "Rathian", s: "rathian", ca: 1 }), {
    slug: "rathian",
    name: "Rathian",
    capturable: true,
  });
  assert.equal(decodeMonsterListItem({ n: "Remobra", s: "remobra" }).capturable, false);
  assert.deepEqual(
    decodeMonsterListItem({ n: "Rathian", s: "rathian", cr: [80, 115, 120] }).crowns,
    {
      mini: 80,
      silver: 115,
      gold: 120,
    },
  );
  assert.equal(decodeMonsterListItem({ n: "Remobra", s: "remobra" }).crowns, undefined);
});

test("decodeMonster reads the status tolerances the data build encodes", () => {
  const tolerances: MonsterTolerances = {
    paralysis: { initial: 110, increase: 75, recovery: 5, recovery_time: 300, duration: 300 },
    sleep: null,
    ko: { initial: 120, increase: 75, recovery: 5, recovery_time: 300, duration: 300 },
    poison: {
      initial: 200,
      increase: 75,
      recovery: 10,
      recovery_time: 150,
      damage: 20,
      damage_interval: 150,
      total_time: 1800,
    },
  };
  const monster = decodeMonster(
    dict,
    { n: "Rathalos", s: "rathalos", tl: encodeTolerances(tolerances) },
    "flying-wyvern",
  );
  assert.deepEqual(monster.tolerances, tolerances);
});
