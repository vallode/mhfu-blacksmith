import assert from "node:assert/strict";
import { test } from "node:test";
import { OVL_HEADER_SIZE, parseOvl } from "../src/container/ovl.js";
import { emitShots } from "../src/emit/shots.js";
import { MOTION_ROW_SIZE, MotionTableError } from "../src/tables/motion-values.js";
import {
  readShots,
  SHOT_COUNT,
  SHOT_ENTRY_SIZE,
  SHOT_INIT_CODE,
  SHOT_KIND,
  type Shot,
} from "../src/tables/shots.js";

const BASE = 0x09a5f200;

interface FakeShot {
  mv?: number;
  bits?: number;
  value?: number;
  kind?: number;
  count?: number;
  flags?: number;
}

/**
 * A `game_task.ovl` holding the bullet init's code (the entries', flags' and
 * attack pointer's addresses in its `lui`/`addiu`s), the three tables after
 * it, and the attack rows' pointer after the rows, as on the EU disc.
 */
function shotTask(shots: FakeShot[], options: { copies?: number; rows?: number } = {}) {
  const codeAt = OVL_HEADER_SIZE + 0x40;
  const entriesAt = 0x400;
  const flagsAt = entriesAt + SHOT_COUNT * SHOT_ENTRY_SIZE;
  const rowsAt = flagsAt + SHOT_COUNT * 4;
  const rowCount = options.rows ?? SHOT_COUNT + 1;
  const pointerAt = rowsAt + rowCount * MOTION_ROW_SIZE;
  const buf = Buffer.alloc(pointerAt + 0x40);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(BASE, 0x08);
  buf.writeUInt32LE(BASE + buf.length, 0x1c);
  buf.write("game_task.ovl", 0x20, "latin1");
  const split = (addr: number) => {
    const lo = addr & 0xffff;
    return { hi: ((addr >>> 16) + (lo & 0x8000 ? 1 : 0)) & 0xffff, lo };
  };
  const entries = split(BASE + entriesAt);
  const flags = split(BASE + flagsAt);
  const pointer = split(BASE + pointerAt);
  const imm: Record<number, number> = {
    2: entries.hi,
    5: entries.lo,
    10: flags.hi,
    11: flags.lo,
    20: pointer.hi,
    24: pointer.lo,
  };
  for (let c = 0; c < (options.copies ?? 1); c++)
    SHOT_INIT_CODE.forEach(({ word, mask }, k) => {
      const w = (word & mask) | (imm[k] ?? 0);
      buf.writeUInt32LE(w >>> 0, codeAt + c * 0x80 + k * 4);
    });
  shots.forEach((s, id) => {
    const row = rowsAt + (id + 1) * MOTION_ROW_SIZE;
    buf[row + 2] = s.mv ?? 0;
    buf.writeUInt16LE(s.bits ?? 0, row + 12);
    buf[row + 14] = s.value ?? 0;
    buf[entriesAt + id * SHOT_ENTRY_SIZE + 34] = s.kind ?? 1;
    buf[entriesAt + id * SHOT_ENTRY_SIZE + 35] = s.count ?? 0;
    buf.writeUInt32LE(s.flags ?? 0x08, flagsAt + id * 4);
  });
  buf.writeUInt32LE(BASE + rowsAt, pointerAt);
  return parseOvl(buf);
}

/** Shot IDs as on the disc: Normal S 0–2, Pierce S 3–5, Pellet S 6–8, Crag S 9–11, … */
const SHOTS: FakeShot[] = Array.from({ length: SHOT_COUNT }, () => ({ flags: 0 }));
SHOTS[0] = { mv: 6 };
SHOTS[1] = { mv: 12 };
SHOTS[2] = { mv: 10, kind: 6, count: 4 };
SHOTS[3] = { mv: 10, kind: SHOT_KIND.pierce, count: 3 };
SHOTS[6] = { mv: 5, kind: SHOT_KIND.spread, count: 3, bits: 0x20, value: 5 };
SHOTS[9] = { mv: 3, kind: 3, count: 50 };
SHOTS[15] = { mv: 7, bits: 0x10, value: 45 };
SHOTS[19] = { mv: 1, kind: SHOT_KIND.pierce, count: 5, bits: 0x100, value: 64 };
SHOTS[20] = { mv: 30, kind: SHOT_KIND.spread, count: 5, flags: 0 };
SHOTS[26] = { mv: 0, bits: 0x01, value: 25, flags: 0x1009 };

test("shots are read through the bullet's init, by shot ID", () => {
  const { shots } = readShots(shotTask(SHOTS));
  assert.equal(shots.length, SHOT_COUNT);
  assert.deepEqual(shots[3], {
    shot: 3,
    motionValue: 10,
    element: null,
    kind: SHOT_KIND.pierce,
    count: 3,
    shotPath: true,
  });
  assert.deepEqual(shots[15]!.element, { column: "fire", value: 45 });
  assert.deepEqual(shots[19]!.element, { column: "dragon", value: 64 });
  assert.equal(shots[26]!.element, null, "status bits aren't an element");
  assert.equal(shots[20]!.shotPath, false);
});

test("no init, two inits, a short attack table or a second element is an error", () => {
  assert.throws(() => readShots(shotTask(SHOTS, { copies: 0 })), MotionTableError);
  assert.throws(() => readShots(shotTask(SHOTS, { copies: 2 })), MotionTableError);
  assert.throws(() => readShots(shotTask(SHOTS, { rows: SHOT_COUNT })), MotionTableError);
  const twoElements = SHOTS.map((s, i) => (i === 15 ? { ...s, bits: 0x30 } : s));
  assert.throws(() => readShots(shotTask(twoElements)), MotionTableError);
  const noNormal = SHOTS.map((s, i) => (i === 0 ? { flags: 0 } : s));
  assert.throws(() => readShots(shotTask(noNormal)), MotionTableError);
});

test("the shots that deal damage through the shot hitzone are emitted, Crag and Clust S left out", () => {
  const { shots } = readShots(shotTask(SHOTS));
  const out = emitShots(shots);
  assert.equal(out.bowgun_shot_multiplier, 1.15);
  assert.deepEqual(
    out.shots.map((s) => [s.ammo, s.level]),
    [
      ["Normal S", 1],
      ["Normal S", 2],
      ["Normal S", 3],
      ["Pierce S", 1],
      ["Pellet S", 1],
      ["Flame S", 1],
      ["Dragon S", 1],
    ],
  );
  const by = (shot: number) => out.shots.find((s) => s.shot === shot);
  assert.equal(by(2)!.hits, undefined, "a ricochet's count isn't hits");
  assert.equal(by(3)!.hits, 3);
  assert.deepEqual(by(6), {
    shot: 6,
    ammo: "Pellet S",
    level: 1,
    motion_value: 5,
    hits: 3,
    element: { type: "water", value: 5 },
  });
  assert.deepEqual(by(15)!.element, { type: "fire", value: 45, attack_scaled: true });
  assert.deepEqual(by(19)!.element, { type: "dragon", value: 64 });
});

test("a shot with no motion value or element is left out", () => {
  const shots: Shot[] = [
    { shot: 0, motionValue: 6, element: null, kind: 1, count: 0, shotPath: true },
    { shot: 28, motionValue: 0, element: null, kind: 0, count: 5, shotPath: true },
  ];
  assert.deepEqual(
    emitShots(shots).shots.map((s) => s.shot),
    [0],
  );
});
