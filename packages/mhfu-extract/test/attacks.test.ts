import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSiteAttacks,
  sweepMonsterAttacks,
  vtableOfCase,
  type AttackSpawn,
} from "../src/monsters/attacks.js";
import type { JointPositions } from "../src/monsters/hitboxes.js";
import { bitsToFloat, Cpu, floatToBits, Memory } from "../src/monsters/mips.js";

// A few MIPS encoders, enough to hand-assemble test code.
const R = { zero: 0, v0: 2, a0: 4, a1: 5, t0: 8, t1: 9, t2: 10, t3: 11, s0: 16, sp: 29, ra: 31 };
const imm = (op: number, rs: number, rt: number, value: number) =>
  ((op << 26) | (rs << 21) | (rt << 16) | (value & 0xffff)) >>> 0;
const addiu = (rt: number, rs: number, v: number) => imm(0x09, rs, rt, v);
const lui = (rt: number, v: number) => imm(0x0f, 0, rt, v);
const lw = (rt: number, offset: number, base: number) => imm(0x23, base, rt, offset);
const lh = (rt: number, offset: number, base: number) => imm(0x21, base, rt, offset);
const sw = (rt: number, offset: number, base: number) => imm(0x2b, base, rt, offset);
const sb = (rt: number, offset: number, base: number) => imm(0x28, base, rt, offset);
const bne = (rs: number, rt: number, skip: number) => imm(0x05, rs, rt, skip);
const beql = (rs: number, rt: number, skip: number) => imm(0x14, rs, rt, skip);
const jal = (target: number) => ((3 << 26) | ((target >>> 2) & 0x3ffffff)) >>> 0;
const jrRa = 0x03e00008;
const addu = (rd: number, rs: number, rt: number) =>
  ((rs << 21) | (rt << 16) | (rd << 11) | 0x21) >>> 0;
const mtc1 = (rt: number, fs: number) => ((0x11 << 26) | (4 << 21) | (rt << 16) | (fs << 11)) >>> 0;
const nop = 0;

/** A segment at `base` holding `words` at the given addresses. */
function segment(base: number, size: number, code: Record<number, number[]>) {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  for (const [at, words] of Object.entries(code))
    words.forEach((w, i) => view.setUint32(Number(at) - base + i * 4, w, true));
  return { base, bytes };
}

test("the interpreter runs delay slots, calls and branch-likely skips", () => {
  const base = 0x08900000;
  const memory = new Memory();
  const { bytes } = segment(base, 0x100, {
    [base]: [
      addu(R.t3, R.ra, R.zero),
      addiu(R.t0, R.zero, 0),
      addiu(R.t1, R.zero, 5),
      // loop: t0 += t1; t1 -= 1; while t1 != 0 (the add sits in the delay slot)
      addiu(R.t1, R.t1, -1),
      bne(R.t1, R.zero, -2),
      addu(R.t0, R.t0, R.t1),
      // a not-taken branch-likely skips its delay slot
      beql(R.t0, R.zero, 4),
      addiu(R.t0, R.t0, 100),
      jal(base + 0x40),
      nop,
      (R.t3 << 21) | 8, // jr $t3
      addu(R.v0, R.t0, R.v0),
    ],
    [base + 0x40]: [jrRa, addiu(R.v0, R.zero, 1000)],
  });
  memory.add(base, bytes);
  const cpu = new Cpu(memory);
  cpu.r[31] = 0x0c7ff000;
  cpu.run(base, 0x0c7ff000);
  // 4 + 3 + 2 + 1 + 0 = 10, then + 1000 from the call
  assert.equal(cpu.r[R.v0], 1010);
});

test("a call to an address without code returns 0, and rollback undoes writes", () => {
  const base = 0x08900000;
  const memory = new Memory();
  memory.add(base, new Uint8Array(0x40));
  memory.w32(base + 0x20, 7);
  memory.mark();
  memory.w32(base + 0x20, 9);
  memory.w8(base + 0x21, 1);
  memory.rollback();
  assert.equal(memory.u32(base + 0x20), 7);
  const cpu = new Cpu(memory);
  cpu.r[2] = 123;
  cpu.r[31] = 0x0c7ff000;
  cpu.run(0x08a00000, 0x0c7ff000);
  assert.equal(cpu.r[2], 0);
  assert.equal(bitsToFloat(floatToBits(1.5)), 1.5);
});

test("vtableOfCase reads the class a spawn case stores into the monster", () => {
  const base = 0x09b00000;
  const memory = new Memory();
  memory.add(
    base,
    segment(base, 0x40, {
      [base]: [nop, lui(R.t0, 0x089c), addiu(R.t0, R.t0, -0x4184), sw(R.t0, 0, R.s0)],
    }).bytes,
  );
  assert.equal(vtableOfCase(memory, base), 0x089bbe7c);
});

/**
 * A made-up game in which emID 1's class spawns one attack in motion 3 at
 * frame 30: the spawner asks FRAME_AT about frame 30 and, at frame 30, calls
 * a factory in game_task's factory range, whose object's init fills in a row
 * (2 ticks of delay, 5 of duration) and a shape list (a capsule on joint 1,
 * then one on a code-placed joint).
 */
function tinyGame() {
  const CLASS = 0x09c00000;
  const CASE = 0x09c01000;
  const OBJECT_VTABLE = 0x09c02000;
  const SHAPES = 0x09c04000;
  const SPAWNER = 0x09b70000;
  const FACTORY = 0x09b63000;
  const INIT = 0x09b71000;
  const thirty = floatToBits(30) >>> 16;
  const base = 0x09b60000;
  const image = segment(base, 0xb0000, {
    [0x09c0ccf8 + 4]: [CASE],
    [CASE]: [lui(R.t0, CLASS >>> 16), addiu(R.t0, R.t0, CLASS & 0xffff), sw(R.t0, 0, R.s0)],
    [CLASS + 0x80]: [SPAWNER],
    [SPAWNER]: [
      addiu(R.sp, R.sp, -16),
      sw(R.ra, 0, R.sp),
      sw(R.a0, 4, R.sp),
      lui(R.t0, thirty),
      mtc1(R.t0, 12),
      jal(0x08864348), // FRAME_AT
      nop,
      lw(R.a0, 4, R.sp),
      lh(R.t2, 0x324, R.a0),
      addiu(R.t3, R.zero, 1003),
      bne(R.t2, R.t3, 6),
      lw(R.t1, 0x90, R.a0), // part 0's frame
      lui(R.t0, thirty),
      bne(R.t1, R.t0, 3),
      nop,
      jal(FACTORY),
      nop,
      lw(R.ra, 0, R.sp),
      jrRa,
      addiu(R.sp, R.sp, 16),
    ],
    [FACTORY]: [
      addiu(R.sp, R.sp, -16),
      sw(R.ra, 0, R.sp),
      addiu(R.a1, R.zero, 0x100),
      jal(0x08859b44), // ALLOC
      nop,
      lui(R.t0, OBJECT_VTABLE >>> 16),
      addiu(R.t0, R.t0, OBJECT_VTABLE & 0xffff),
      sw(R.t0, 0, R.v0),
      lw(R.ra, 0, R.sp),
      jrRa,
      addiu(R.sp, R.sp, 16),
    ],
    [OBJECT_VTABLE + 0x20]: [INIT],
    [INIT]: [
      addiu(R.t0, R.zero, 2),
      sb(R.t0, 0x1c, R.a0), // delay
      addiu(R.t0, R.zero, 5),
      sb(R.t0, 0x1d, R.a0), // duration
      addiu(R.t0, R.zero, 20),
      sb(R.t0, 0x1e, R.a0), // power
      addiu(R.t0, R.zero, 7),
      sb(R.t0, 0x0d, R.a0), // row index
      lui(R.t0, SHAPES >>> 16),
      addiu(R.t0, R.t0, SHAPES & 0xffff),
      jrRa,
      sw(R.t0, 0x34, R.a0),
    ],
  });
  const view = new DataView(image.bytes.buffer);
  const shape = (i: number, joint: number, type: number, radius: number, end: number[]) => {
    const at = SHAPES - base + i * 0x28;
    view.setInt16(at, joint, true);
    view.setUint16(at + 2, type, true);
    view.setFloat32(at + 0x0c, radius, true);
    end.forEach((v, k) => view.setFloat32(at + 0x1c + k * 4, v, true));
  };
  shape(0, 1, 1, 10, [0, 5, 0]);
  shape(1, 0x7d, 1, 10, [0, 5, 0]);
  view.setInt16(SHAPES - base + 2 * 0x28, -1, true);
  return [image];
}

test("sweepMonsterAttacks follows the frames a spawner asks about and reads its objects", () => {
  const sweep = sweepMonsterAttacks(tinyGame(), new Map(), 1);
  assert.ok(!("error" in sweep));
  assert.equal(sweep.overlay, undefined);
  assert.equal(sweep.spawns.length, 1);
  const [spawn] = sweep.spawns;
  assert.equal(spawn!.slot, 3);
  assert.equal(spawn!.frame, 30);
  assert.equal(spawn!.rowIndex, 7);
  assert.deepEqual([...spawn!.row.subarray(0, 3)], [2, 5, 20]);
  assert.deepEqual(
    spawn!.shapes.map((s) => [s.joint, s.radius, s.end]),
    [
      [1, 10, [0, 5, 0]],
      [0x7d, 10, [0, 5, 0]],
    ],
  );
  assert.deepEqual(sweepMonsterAttacks(tinyGame(), new Map(), 2), {
    error: "no class vtable in its spawn case",
  });
});

test("buildSiteAttacks places shapes and turns ticks into motion frames", () => {
  const joints: JointPositions = {
    frames: new Map([[1, { origin: [10, 0, 0], scale: [1, 2, 1] }]]),
    rotated: new Set([2]),
  };
  const row = new Uint8Array(0x18);
  row.set([3, 4, 25, 1]);
  row[0x14] = 6;
  row[0x08] = 30;
  // Fire, and the always-set bit 0; poison 25.
  row[0x09] = 0x05;
  row[0x0c] = 0x02;
  row[0x0e] = 25;
  const spawn = (shapes: AttackSpawn["shapes"]): AttackSpawn => ({
    slot: 5,
    frame: 20,
    row,
    rowTable: 0,
    rowIndex: 0,
    shapeList: 0,
    shapes,
  });
  const capsule = { joint: 1, type: 1, radius: 8, start: [0, 0, 0], end: [0, 5, 0] } as const;
  const sphere = { joint: 1, type: 0, radius: 4, start: [1, 1, 1], end: [9, 9, 9] } as const;
  const { attacks, skipped } = buildSiteAttacks(
    [
      spawn([
        { ...capsule, start: [...capsule.start], end: [...capsule.end] },
        { ...sphere, start: [...sphere.start], end: [...sphere.end] },
        { ...capsule, joint: 0x7f, start: [0, 0, 0], end: [0, 0, 0] },
        { ...capsule, joint: 2, start: [0, 0, 0], end: [0, 0, 0] },
      ]),
      // The same attack again (two objects alike) shows once.
      spawn([{ ...capsule, start: [...capsule.start], end: [...capsule.end] }]),
      spawn([{ ...capsule, start: [...capsule.start], end: [...capsule.end] }]),
    ],
    joints,
  );
  assert.deepEqual(attacks.attacks, [
    {
      slot: 5,
      from: 26,
      to: 34,
      power: 25,
      reaction: 1,
      stun: 6,
      guard: 30,
      elements: ["fire"],
      statuses: ["poison"],
      statusValue: 25,
      capsules: [
        { joint: 1, radius: 8, start: [10, 0, 0], end: [10, 10, 0] },
        { joint: 1, radius: 4, start: [11, 2, 1], end: [11, 2, 1] },
      ],
    },
    {
      slot: 5,
      from: 26,
      to: 34,
      power: 25,
      reaction: 1,
      stun: 6,
      guard: 30,
      elements: ["fire"],
      statuses: ["poison"],
      statusValue: 25,
      capsules: [{ joint: 1, radius: 8, start: [10, 0, 0], end: [10, 10, 0] }],
    },
  ]);
  assert.deepEqual(skipped, [
    "motion 5 row 0: joint 127 is placed by code",
    "motion 5 row 0: joint 2 has a rotated bone in its chain",
  ]);
});
