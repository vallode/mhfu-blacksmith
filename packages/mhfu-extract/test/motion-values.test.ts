import assert from "node:assert/strict";
import { test } from "node:test";
import { OVL_HEADER_SIZE, parseOvl } from "../src/container/ovl.js";
import { emitMotionValues, MotionValuesError } from "../src/emit/motion-values.js";
import { weaponMoves } from "../src/overlay/weapon-moves.js";
import {
  demonModeValue,
  HITZONE_WEIGHTS_CODE,
  MOTION_ROW_SIZE,
  MOTION_TABLE_CALL,
  MotionTableError,
  readHitzoneWeights,
  readMotionTable,
  WEAPON_CLASS_COUNT,
} from "../src/tables/motion-values.js";

const BASE = 0x09a5f200;

/**
 * A `game_task.ovl` holding the builder's copier call (with the pointer's
 * address in its `lui`/`addiu`), then a table of `values` (row 0 empty)
 * followed by the pointer to it, as on the EU disc.
 */
function gameTask(
  values: number[],
  options: { calls?: number; badPointer?: boolean; shapes?: number[] } = {},
) {
  const callAt = OVL_HEADER_SIZE + 0x40;
  const tableAt = 0x400;
  const pointerAt = tableAt + (values.length + 1) * MOTION_ROW_SIZE;
  const buf = Buffer.alloc(pointerAt + 0x40);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(BASE, 0x08);
  buf.writeUInt32LE(BASE + buf.length, 0x1c);
  buf.write("game_task.ovl", 0x20, "latin1");
  const pointer = BASE + pointerAt;
  // addiu sign-extends its immediate, so lui takes the carry.
  const lo = pointer & 0xffff;
  const hi = ((pointer >>> 16) + (lo & 0x8000 ? 1 : 0)) & 0xffff;
  for (let c = 0; c < (options.calls ?? 1); c++) {
    MOTION_TABLE_CALL.forEach(({ word, mask }, k) => {
      let w = word & mask;
      if (k === 2) w |= hi;
      if (k === 5) w |= 0x0026d9d0; // jal <copier>
      if (k === 6) w |= lo;
      buf.writeUInt32LE(w >>> 0, callAt + c * 0x40 + k * 4);
    });
  }
  values.forEach((mv, i) => {
    const row = tableAt + (i + 1) * MOTION_ROW_SIZE;
    buf[row] = 0x50; // delay, which the reader ignores
    buf[row + 2] = mv;
    buf[row + 3] = 1;
    buf[row + 10] = options.shapes?.[i] ?? 0;
  });
  // Two hitbox shapes, on joints 18 and 14, their pointers padded up to the table.
  if (options.shapes) {
    buf[0x200] = 18;
    buf[0x210] = 14;
    buf.writeUInt32LE(BASE + 0x200, tableAt - 0x10);
    buf.writeUInt32LE(BASE + 0x210, tableAt - 0x0c);
  }
  buf.writeUInt32LE(options.badPointer ? BASE + tableAt + 5 : BASE + tableAt, pointerAt);
  return parseOvl(buf);
}

/** The EU disc's weights, in weapon class order. */
const WEIGHTS = [
  [100, 0],
  [100, 100],
  [0, 100],
  [100, 72],
  [112, 0],
  [100, 100],
  [100, 0],
  [100, 0],
  [0, 100],
  [97, 0],
  [100, 0],
].map(([cut, impact]) => ({ cut: cut!, impact: impact! }));

const TABLES = {
  classes: WEIGHTS,
  spiritGlow: { weaponClass: 7, cut: 112 },
  charge: { weaponClass: 3, cut: 112, impact: 81 },
};

/** A `game_task.ovl` holding the weights' setter and, after it, `weights` as two bytes per class. */
function weightsTask(
  weights: { cut: number; impact: number }[],
  options: { copies?: number; glowClass?: number } = {},
) {
  const codeAt = OVL_HEADER_SIZE + 0x40;
  const tableAt = 0x400;
  const buf = Buffer.alloc(tableAt + 0x40);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(BASE, 0x08);
  buf.writeUInt32LE(BASE + buf.length, 0x1c);
  buf.write("game_task.ovl", 0x20, "latin1");
  const split = (addr: number) => {
    const lo = addr & 0xffff;
    return { hi: ((addr >>> 16) + (lo & 0x8000 ? 1 : 0)) & 0xffff, lo };
  };
  const cut = split(BASE + tableAt);
  const impact = split(BASE + tableAt + 1);
  for (let c = 0; c < (options.copies ?? 1); c++)
    HITZONE_WEIGHTS_CODE.forEach(({ word, mask }, k) => {
      let w = word & mask;
      if (k === 1) w |= cut.hi;
      if (k === 2) w |= impact.hi;
      if (k === 3) w |= cut.lo;
      if (k === 7) w |= impact.lo;
      if (k === 10) w |= options.glowClass ?? 7;
      if (k === 21) w |= 112;
      if (k === 24) w |= 3;
      if (k === 33) w |= 112;
      if (k === 35) w |= 81;
      buf.writeUInt32LE(w >>> 0, codeAt + c * 0x100 + k * 4);
    });
  weights.forEach((w, i) => {
    buf[tableAt + i * 2] = w.cut;
    buf[tableAt + i * 2 + 1] = w.impact;
  });
  return parseOvl(buf);
}

test("hitzone weights are read through their setter, one pair per weapon class", () => {
  assert.deepEqual(readHitzoneWeights(weightsTask(WEIGHTS)), {
    classes: WEIGHTS,
    spiritGlow: { weaponClass: 7, cut: 112 },
    charge: { weaponClass: 3, cut: 112, impact: 81 },
  });
  assert.throws(
    () => readHitzoneWeights(weightsTask(WEIGHTS, { glowClass: 11 })),
    MotionTableError,
  );
  assert.equal(WEIGHTS.length, WEAPON_CLASS_COUNT);
  assert.throws(() => readHitzoneWeights(weightsTask(WEIGHTS, { copies: 0 })), MotionTableError);
  assert.throws(() => readHitzoneWeights(weightsTask(WEIGHTS, { copies: 2 })), MotionTableError);
  const empty = WEIGHTS.map((w, i) => (i === 4 ? { cut: 0, impact: 0 } : w));
  assert.throws(() => readHitzoneWeights(weightsTask(empty)), MotionTableError);
});

test("the table is found through the builder's call and runs up to its pointer", () => {
  const table = readMotionTable(gameTask([46, 36, 48]));
  assert.deepEqual(
    table.rows.map((r) => r.motionValue),
    [0, 46, 36, 48],
  );
  assert.equal(table.rows[2]!.row, 2);
  assert.equal(table.rows[2]!.reaction, 1);
});

test("no call, two calls, or a pointer that doesn't end the table is an error", () => {
  assert.throws(() => readMotionTable(gameTask([46], { calls: 0 })), MotionTableError);
  assert.throws(() => readMotionTable(gameTask([46], { calls: 2 })), MotionTableError);
  assert.throws(() => readMotionTable(gameTask([46], { badPointer: true })), MotionTableError);
});

test("Demon Mode is the game's single-precision 1.35, truncated", () => {
  // The values the Dual Blades' table gives, against the community's Demon Mode list.
  assert.deepEqual(
    [18, 10, 8, 6, 12, 15, 25, 30, 19, 7].map(demonModeValue),
    [24, 13, 10, 8, 16, 20, 33, 40, 25, 9],
  );
});

test("moves take their hits' values from the table, and Dual Blades their Demon Mode values", () => {
  const table = readMotionTable(gameTask([46, 18, 6], { shapes: [0, 0, 1] }));
  assert.deepEqual(
    table.rows.map((r) => r.joint),
    [18, 18, 18, 14],
  );
  const out = emitMotionValues(
    table,
    {
      "great-sword": [
        { move: "upswing", hits: [{ row: 1 }] },
        { move: "charge-3", cutWeight: 130, hits: [{ row: 1 }] },
      ],
      "dual-blades": [{ move: "dance", demon: true, hits: [{ row: 2 }, { row: 3, count: 8 }] }],
      "long-sword": [{ move: "thrust", hits: [{ row: 1 }] }],
      lance: [{ move: "charge", fullSpeed: true, hits: [{ row: 1 }] }],
    },
    TABLES,
  );
  assert.deepEqual(out.weapons.lance, [
    {
      move: "charge",
      hitzone_weights: { cut: 100, impact: 72 },
      charge_hitzone_weights: { cut: 112, impact: 81 },
      hits: [{ row: 1, motion_value: 46 }],
    },
  ]);
  assert.throws(
    () =>
      emitMotionValues(
        table,
        { hammer: [{ move: "x", fullSpeed: true, hits: [{ row: 1 }] }] },
        TABLES,
      ),
    MotionValuesError,
  );
  assert.deepEqual(out.weapons["long-sword"], [
    {
      move: "thrust",
      hitzone_weights: { cut: 100, impact: 0 },
      glow_hitzone_weights: { cut: 112, impact: 0 },
      hits: [{ row: 1, motion_value: 46 }],
    },
  ]);
  assert.deepEqual(out.weapons["great-sword"], [
    {
      move: "upswing",
      hitzone_weights: { cut: 100, impact: 0 },
      hits: [{ row: 1, motion_value: 46 }],
    },
    {
      move: "charge-3",
      hitzone_weights: { cut: 130, impact: 0 },
      hits: [{ row: 1, motion_value: 46 }],
    },
  ]);
  assert.deepEqual(out.weapons["dual-blades"], [
    {
      move: "dance",
      demon: true,
      hitzone_weights: { cut: 100, impact: 0 },
      hits: [
        { row: 2, motion_value: 18, demon_mode: 24, blade: 1 },
        { row: 3, motion_value: 6, demon_mode: 8, blade: 2, count: 8 },
      ],
    },
  ]);
  assert.throws(
    () => emitMotionValues(table, { hammer: [{ move: "x", hits: [{ row: 9 }] }] }, TABLES),
    MotionValuesError,
  );
});

test("every move in the overlay names rows, once per weapon type", () => {
  const moves = weaponMoves();
  assert.ok(moves["great-sword"]?.length);
  for (const [type, list] of Object.entries(moves)) {
    const keys = list.map((m) => m.move);
    assert.equal(new Set(keys).size, keys.length, type);
    for (const m of list) {
      assert.ok(m.hits.length > 0, `${type} ${m.move}`);
      for (const h of m.hits) assert.ok(Number.isInteger(h.row) && h.row > 0, `${type} ${m.move}`);
    }
  }
});
