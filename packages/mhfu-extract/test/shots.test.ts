import assert from "node:assert/strict";
import { test } from "node:test";
import { OVL_HEADER_SIZE, parseOvl } from "../src/container/ovl.js";
import { emitShots } from "../src/emit/shots.js";
import { MOTION_ROW_SIZE, MotionTableError } from "../src/tables/motion-values.js";
import {
  CLUST_SPAWN_CODE,
  CRAG_EXPLOSION_CODE,
  EXPLOSION_ATTACK_CODE,
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

/** Crag S's explosions by level (IDs 8, 14, 15 on the disc): power and fire. */
const CRAG_BLASTS: [number, number, number][] = [
  [8, 20, 30],
  [14, 30, 45],
  [15, 40, 60],
];
/** Clust S's bomblets by level, and the bomblet's attack (shot ID 32). */
const CLUST_COUNTS = [3, 4, 5];
const BOMBLET = { shot: 32, mv: 32, fire: 2 };

interface TaskOptions {
  /** Copies of the bullet init, the Crag S explosion, the explosion attack and the Clust S burst code. */
  copies?: number;
  cragCopies?: number;
  blastCopies?: number;
  clustCopies?: number;
  /** Shot attack rows, and explosion attack rows. */
  rows?: number;
  blastRows?: number;
  /** The explosions' and the bomblet's (shot ID 32's) flags. */
  blastFlags?: number;
  bombletFlags?: number;
  /** Whether the bomblet spawner reads a shot ID and count. */
  spawnerReads?: boolean;
  /** Clust S Lv1's bomblet entry. */
  bomblet?: { shot: number; count: number };
}

/**
 * A `game_task.ovl` holding the bullet init's code (the entries', flags' and
 * attack pointer's addresses in its `lui`/`addiu`s), the three tables after
 * it, and the attack rows' pointer after the rows, as on the EU disc; and
 * the Crag S explosion, explosion attack and Clust S burst code with their
 * tables. The entries and flags run on past shot 31, as on the disc.
 */
function shotTask(shots: FakeShot[], options: TaskOptions = {}) {
  const codeAt = OVL_HEADER_SIZE + 0x40;
  const cragAt = codeAt + 0x200;
  const blastAt = cragAt + 0x200;
  const clustAt = blastAt + 0x80;
  const spawnerAt = clustAt + 0x40;
  const entriesAt = 0x800;
  const flagsAt = entriesAt + (SHOT_COUNT + 2) * SHOT_ENTRY_SIZE;
  const rowsAt = flagsAt + (SHOT_COUNT + 2) * 4;
  const rowCount = options.rows ?? SHOT_COUNT + 2;
  const pointerAt = rowsAt + rowCount * MOTION_ROW_SIZE;
  const bombletsAt = pointerAt + 0x10;
  const blastRowsAt = bombletsAt + 0x10;
  const blastPointerAt = blastRowsAt + (options.blastRows ?? 17) * MOTION_ROW_SIZE;
  const buf = Buffer.alloc(blastPointerAt + 0x40);
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
  const place = (
    at: number,
    code: readonly { word: number; mask: number }[],
    words: Record<number, number>,
  ) =>
    code.forEach(({ word, mask }, k) =>
      buf.writeUInt32LE(((word & mask) | (words[k] ?? word & ~mask)) >>> 0, at + k * 4),
    );
  // The Crag S code's IDs are the disc's, in its masked words already.
  for (let c = 0; c < (options.cragCopies ?? 1); c++)
    place(cragAt + c * 0x100, CRAG_EXPLOSION_CODE, {});
  const blasts = split(BASE + blastPointerAt);
  for (let c = 0; c < (options.blastCopies ?? 1); c++)
    place(blastAt + c * 0x40, EXPLOSION_ATTACK_CODE, {
      2: options.blastFlags ?? 0x04,
      5: blasts.hi,
      9: blasts.lo,
    });
  const bomblets = split(BASE + bombletsAt);
  for (let c = 0; c < (options.clustCopies ?? 1); c++)
    place(clustAt + c * 0x20, CLUST_SPAWN_CODE, {
      1: bomblets.hi,
      3: bomblets.lo,
      6: ((BASE + spawnerAt) >>> 2) & 0x03ffffff,
    });
  if (options.spawnerReads ?? true) {
    buf.writeUInt32LE(0x90b10000, spawnerAt + 9 * 4);
    buf.writeUInt32LE(0x84b00002, spawnerAt + 10 * 4);
  }
  CLUST_COUNTS.forEach((n, level) => {
    const { shot, count } = (level === 0 && options.bomblet) || { shot: BOMBLET.shot, count: n };
    buf[bombletsAt + level * 4] = shot;
    buf.writeInt16LE(count, bombletsAt + level * 4 + 2);
  });
  buf.writeUInt32LE(options.bombletFlags ?? 0, flagsAt + BOMBLET.shot * 4);
  for (const [id, power, fire] of CRAG_BLASTS) {
    if (id + 1 >= (options.blastRows ?? 17)) continue;
    const row = blastRowsAt + (id + 1) * MOTION_ROW_SIZE;
    buf[row + 2] = power;
    buf.writeUInt16LE(0x10, row + 12);
    buf[row + 14] = fire;
  }
  buf.writeUInt32LE(BASE + blastRowsAt, blastPointerAt);
  if (BOMBLET.shot + 1 < rowCount) {
    const row = rowsAt + (BOMBLET.shot + 1) * MOTION_ROW_SIZE;
    buf[row + 2] = BOMBLET.mv;
    buf.writeUInt16LE(0x10, row + 12);
    buf[row + 14] = BOMBLET.fire;
  }
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
SHOTS[11] = { mv: 3, kind: 5, count: 50 };
SHOTS[12] = { mv: 6, kind: SHOT_KIND.cluster, count: 0 };
SHOTS[14] = { mv: 6, kind: SHOT_KIND.cluster, count: 2 };
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
    explosion: null,
  });
  assert.deepEqual(shots[15]!.element, { column: "fire", value: 45 });
  assert.deepEqual(shots[19]!.element, { column: "dragon", value: 64 });
  assert.equal(shots[26]!.element, null, "status bits aren't an element");
  assert.equal(shots[20]!.shotPath, false);
});

test("Crag S explodes by its level and Clust S bursts into its level's bomblets", () => {
  const { shots } = readShots(shotTask(SHOTS));
  const fire = (value: number) => ({ column: "fire", value });
  assert.deepEqual(shots[9]!.explosion, {
    power: 20,
    attackScaled: false,
    element: fire(30),
    count: 1,
  });
  assert.equal(shots[11]!.explosion!.power, 40);
  assert.deepEqual(shots[12]!.explosion, {
    power: 32,
    attackScaled: true,
    element: fire(2),
    count: 3,
  });
  assert.equal(shots[14]!.explosion!.count, 5);
  assert.equal(shots[0]!.explosion, null);
});

test("explosion code or tables that look wrong leave the explosions out, not the shots", () => {
  const cases: [string, FakeShot[], TaskOptions][] = [
    ["no Crag S code", SHOTS, { cragCopies: 0 }],
    ["two Crag S codes", SHOTS, { cragCopies: 2 }],
    ["no explosion attack code", SHOTS, { blastCopies: 0 }],
    ["two explosion attack codes", SHOTS, { blastCopies: 2 }],
    ["no Clust S code", SHOTS, { clustCopies: 0 }],
    ["two Clust S codes", SHOTS, { clustCopies: 2 }],
    ["a spawner reading something else", SHOTS, { spawnerReads: false }],
    ["a short explosion table", SHOTS, { blastRows: 16 }],
    ["explosions on the shot path", SHOTS, { blastFlags: 0x0c }],
    ["explosions on the melee path", SHOTS, { blastFlags: 0x44 }],
    ["bomblets on the shot path", SHOTS, { bombletFlags: 0x08 }],
    ["bomblets on the melee path", SHOTS, { bombletFlags: 0x40 }],
    ["a bomblet that's a shot", SHOTS, { bomblet: { shot: 3, count: 3 } }],
    ["no bomblets", SHOTS, { bomblet: { shot: 32, count: 0 } }],
    [
      "a bomblet entry past the table",
      SHOTS.map((s, i) => (i === 12 ? { ...s, count: 200 } : s)),
      {},
    ],
  ];
  for (const [what, shots, options] of cases) {
    const read = readShots(shotTask(shots, options));
    assert.ok(read.explosionError, what);
    assert.ok(
      read.shots.every((s) => s.explosion === null),
      what,
    );
    assert.equal(read.shots[3]!.motionValue, 10, what);
  }
  assert.equal(readShots(shotTask(SHOTS)).explosionError, null);
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

test("the shots that deal damage through the shot hitzone are emitted, with their explosions", () => {
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
      ["Crag S", 1],
      ["Crag S", 3],
      ["Clust S", 1],
      ["Clust S", 3],
      ["Flame S", 1],
      ["Dragon S", 1],
    ],
  );
  const without = emitShots(readShots(shotTask(SHOTS, { cragCopies: 0 })).shots);
  assert.ok(
    without.shots.every((s) => s.ammo !== "Crag S" && s.ammo !== "Clust S"),
    "Crag and Clust S are left out without their explosions",
  );
  assert.equal(without.shots.length, out.shots.length - 4);
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
  assert.deepEqual(by(9)!.explosion, { power: 20, element: { type: "fire", value: 30 } });
  assert.deepEqual(by(12)!.explosion, {
    power: 32,
    attack_scaled: true,
    hits: 3,
    element: { type: "fire", value: 2 },
  });
});

test("a shot with no motion value or element is left out", () => {
  const shots: Shot[] = [
    { shot: 0, motionValue: 6, element: null, kind: 1, count: 0, shotPath: true, explosion: null },
    { shot: 28, motionValue: 0, element: null, kind: 0, count: 5, shotPath: true, explosion: null },
  ];
  assert.deepEqual(
    emitShots(shots).shots.map((s) => s.shot),
    [0],
  );
});
