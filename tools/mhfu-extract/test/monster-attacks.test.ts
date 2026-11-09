import assert from "node:assert/strict";
import { test } from "node:test";
import type { AttackRawDump, UsedRecord } from "../src/emit/attacks-raw.js";
import { emitMonsterAttacks } from "../src/emit/monster-attacks.js";

const used = (table: string, index: number, record: Partial<UsedRecord["record"]>): UsedRecord => ({
  table,
  index,
  kinds: [index],
  calls: 1,
  callers: [],
  record: {
    offset: 0,
    hex: "",
    damage: 0,
    reaction: 0,
    guard: 0,
    elementBits: 1,
    elements: [],
    index: 0,
    statusBits: 0,
    statuses: [],
    statusValue: 0,
    stun: 0,
    ...record,
  },
});

test("emitMonsterAttacks lists each named family's records in table order", () => {
  const dump = {
    files: [],
    usage: {
      classes: [],
      notes: {},
      unresolved: 0,
      families: {
        "overlay/em14.ovl": [
          used("overlay/em14.ovl@0x15660", 3, { damage: 40, guard: 20, stun: 5 }),
          used("game_task.ovl@0x1a02a0", 7, { damage: 0, guard: 10 }),
          used("overlay/em14.ovl@0x15660", 1, {
            damage: 25,
            guard: 15,
            elements: ["fire", "0x8"],
            statuses: ["poison"],
            statusValue: 25,
          }),
        ],
        "game_task.ovl:we00": [used("game_task.ovl@0x19ccf8", 1, { damage: 10 })],
      },
    },
  } as AttackRawDump;
  const out = emitMonsterAttacks(dump, {
    families: { "overlay/em14.ovl": ["Diablos", "Monoblos"], "overlay/em15.ovl": ["Khezu"] },
  });
  assert.deepEqual(out, {
    families: [
      {
        code: "overlay/em14.ovl",
        monsters: ["Diablos", "Monoblos"],
        attacks: [
          { record: "game_task.ovl@0x1a02a0#7", damage: 0, guard: 10 },
          {
            record: "overlay/em14.ovl@0x15660#1",
            damage: 25,
            guard: 15,
            elements: ["fire"],
            statuses: ["poison"],
            statusValue: 25,
          },
          { record: "overlay/em14.ovl@0x15660#3", damage: 40, guard: 20, stun: 5 },
        ],
      },
    ],
  });
});
