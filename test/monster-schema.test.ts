/**
 * Compact monster bundle decoding (lib/schema.ts): the hitzone rows' flinch
 * thresholds the data build works out.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeMonster, type Dictionaries } from "../src/lib/schema";

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
