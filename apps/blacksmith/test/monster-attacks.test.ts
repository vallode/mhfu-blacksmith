/** The Attacks tab's rows from a monster's attack file. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MonsterAttack } from "../src/lib/models";
import { attackRows } from "../src/lib/monster-attacks";

const hit = (slot: number, power: number, more: Partial<MonsterAttack> = {}): MonsterAttack => ({
  slot,
  from: 0,
  to: 10,
  power,
  reaction: 1,
  stun: 0,
  capsules: [],
  ...more,
});

describe("attackRows", () => {
  test("one row per motion and set of numbers, motions in order, hardest hit first", () => {
    const rows = attackRows([
      hit(7, 10),
      hit(3, 20, { stun: 5, guard: 30 }),
      hit(3, 40, { guard: 30, elements: ["fire"] }),
      hit(3, 20, { stun: 5, guard: 30, from: 40, to: 50 }),
      hit(3, 20, { guard: 30, statuses: ["poison"], statusValue: 25 }),
    ]);
    assert.deepEqual(rows, [
      { slot: 3, hits: 1, damage: 40, stun: 0, guard: 30, elements: ["fire"] },
      { slot: 3, hits: 2, damage: 20, stun: 5, guard: 30 },
      { slot: 3, hits: 1, damage: 20, stun: 0, guard: 30, statuses: ["poison"], statusValue: 25 },
      { slot: 7, hits: 1, damage: 10, stun: 0 },
    ]);
  });
});
