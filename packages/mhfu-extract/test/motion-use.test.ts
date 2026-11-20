import assert from "node:assert/strict";
import { test } from "node:test";
import { Memory } from "../src/monsters/mips.js";
import { playedRecords, recordSlots } from "../src/monsters/motion-use.js";

// A few MIPS encoders, enough to hand-assemble test code.
const R = {
  zero: 0,
  v0: 2,
  v1: 3,
  a0: 4,
  a1: 5,
  a2: 6,
  a3: 7,
  t0: 8,
  s0: 16,
  s1: 17,
  sp: 29,
  ra: 31,
};
const imm = (op: number, rs: number, rt: number, value: number) =>
  ((op << 26) | (rs << 21) | (rt << 16) | (value & 0xffff)) >>> 0;
const addiu = (rt: number, rs: number, v: number) => imm(0x09, rs, rt, v);
const sltiu = (rt: number, rs: number, v: number) => imm(0x0b, rs, rt, v);
const lui = (rt: number, v: number) => imm(0x0f, 0, rt, v);
const lw = (rt: number, offset: number, base: number) => imm(0x23, base, rt, offset);
const lbu = (rt: number, offset: number, base: number) => imm(0x24, base, rt, offset);
const sw = (rt: number, offset: number, base: number) => imm(0x2b, base, rt, offset);
const beq = (rs: number, rt: number, skip: number) => imm(0x04, rs, rt, skip);
const jal = (target: number) => ((3 << 26) | ((target >>> 2) & 0x3ffffff)) >>> 0;
const j = (target: number) => ((2 << 26) | ((target >>> 2) & 0x3ffffff)) >>> 0;
const jr = (rs: number) => ((rs << 21) | 8) >>> 0;
const jrRa = jr(R.ra);
const move = (rd: number, rs: number) => ((rs << 21) | (rd << 11) | 0x21) >>> 0;
const sll = (rd: number, rt: number, sa: number) => ((rt << 16) | (rd << 11) | (sa << 6)) >>> 0;
const addu = (rd: number, rs: number, rt: number) =>
  ((rs << 21) | (rt << 16) | (rd << 11) | 0x21) >>> 0;
const nop = 0;

const PLAY_MOTION = 0x09ac5228;
const PLAY_RECORD = 0x09ac8ee0;
const CODE = 0x09b00000;
/** In the monster overlays' slot. */
const OVERLAY = 0x09d20000;

/** Memory holding `words` at the given addresses, in game_task's range or the overlay slot. */
function memoryWith(code: Record<number, number[]>): Memory {
  const memory = new Memory();
  for (const base of [CODE, OVERLAY]) {
    const bytes = new Uint8Array(0x10000);
    const view = new DataView(bytes.buffer);
    for (const [at, words] of Object.entries(code))
      if (Number(at) >= base && Number(at) < base + bytes.length)
        words.forEach((w, i) => view.setUint32(Number(at) - base + i * 4, w, true));
    memory.add(base, bytes);
  }
  // The players only need to exist; their code isn't followed.
  const players = new Uint8Array(0x8000);
  new DataView(players.buffer).setUint32(PLAY_MOTION - 0x09ac4000, jrRa, true);
  new DataView(players.buffer).setUint32(PLAY_RECORD - 0x09ac4000, jrRa, true);
  memory.add(0x09ac4000, players);
  return memory;
}

test("constant indices are followed through helpers, both branches and the fifth argument", () => {
  const method = CODE;
  const helper = CODE + 0x100;
  const fifth = CODE + 0x200;
  const memory = memoryWith({
    [method]: [
      addiu(R.sp, R.sp, -0x10),
      sw(R.ra, 0xc, R.sp),
      move(R.s0, R.a0),
      lbu(R.v0, 0x40, R.a0), // some state: either branch can run
      beq(R.v0, R.zero, 2),
      addiu(R.a1, R.zero, 7), // delay slot: on both paths
      addiu(R.a1, R.zero, 9), // only when not taken
      // join: a1 is 7 or 9
      jal(helper),
      move(R.a0, R.s0),
      move(R.a0, R.s0),
      jal(fifth),
      addiu(R.t0, R.zero, 21), // the fifth argument rides in t0
      lw(R.ra, 0xc, R.sp),
      jrRa,
      addiu(R.sp, R.sp, 0x10),
    ],
    // helper(monster, index): PLAY_MOTION(monster, index + 1)
    [helper]: [jal(PLAY_MOTION), addiu(R.a1, R.a1, 1), jrRa, nop],
    // fifth(monster, …, index in t0): PLAY_RECORD(monster, index)
    [fifth]: [jal(PLAY_RECORD), move(R.a1, R.t0), jrRa, nop],
  });
  const played = playedRecords(memory, [method]);
  assert.deepEqual(played.records, [8, 10, 21]);
  assert.deepEqual(played.unresolved, []);
  assert.equal(played.playerSites.length, 2);
});

test("switch cases through a jump table are all followed", () => {
  const method = CODE;
  const table = CODE + 0x800;
  const cases = [CODE + 0x100, CODE + 0x120, CODE + 0x140];
  const playCase = (index: number) => [jal(PLAY_MOTION), addiu(R.a1, R.zero, index), jrRa, nop];
  const memory = memoryWith({
    [method]: [
      lui(R.v1, table >>> 16),
      addiu(R.v1, R.v1, table & 0xffff),
      lbu(R.v0, 0x40, R.a0),
      sltiu(1, R.v0, 3),
      beq(1, R.zero, 6),
      nop,
      sll(R.v0, R.v0, 2),
      addu(R.v0, R.v0, R.v1),
      lw(R.v0, 0, R.v0),
      jr(R.v0),
      nop,
      jrRa,
      nop,
    ],
    [table]: cases,
    [cases[0]!]: playCase(3),
    [cases[1]!]: playCase(4),
    [cases[2]!]: playCase(5),
  });
  assert.deepEqual(playedRecords(memory, [method]).records, [3, 4, 5]);
});

test("a movement helper's records are read from the table it's handed", () => {
  const method = CODE;
  const helper = CODE + 0x100;
  const records = CODE + 0x800;
  const memory = memoryWith({
    [method]: [
      lui(R.a1, records >>> 16),
      jal(helper),
      addiu(R.a1, R.a1, records & 0xffff),
      jrRa,
      nop,
    ],
    // helper(monster, table): plays table+0x10 or table+0x14
    [helper]: [
      lbu(R.v0, 0x40, R.a0),
      beq(R.v0, R.zero, 3),
      lw(R.a2, 0x10, R.a1),
      lw(R.a2, 0x14, R.a1),
      nop,
      jal(PLAY_MOTION),
      move(R.a1, R.a2),
      jrRa,
      nop,
    ],
    [records + 0x10]: [33, 34],
  });
  assert.deepEqual(playedRecords(memory, [method]).records, [33, 34]);
});

test("other objects' constant plays count, but only the monster's state index is unresolved", () => {
  const method = CODE;
  const make = CODE + 0x100;
  const memory = memoryWith({
    [method]: [
      addiu(R.sp, R.sp, -0x10),
      sw(R.ra, 0xc, R.sp),
      move(R.s0, R.a0),
      // An effect object made by a call: its motion isn't the monster's.
      jal(make),
      nop,
      move(R.a0, R.v0),
      jal(PLAY_MOTION),
      addiu(R.a1, R.zero, 50),
      // A partner the monster points at: not the monster either.
      lw(R.a0, 0x200, R.s0),
      jal(PLAY_MOTION),
      addiu(R.a1, R.zero, 51),
      // The monster itself, with an index from its state.
      move(R.a0, R.s0),
      jal(PLAY_MOTION),
      lbu(R.a1, 0x41, R.s0),
      lw(R.ra, 0xc, R.sp),
      jrRa,
      addiu(R.sp, R.sp, 0x10),
    ],
    [make]: [jrRa, nop],
  });
  const played = playedRecords(memory, [method]);
  // Either object could be the monster after all.
  assert.deepEqual(played.records, [50, 51]);
  assert.deepEqual(played.unresolved, [method + 12 * 4]); // the third call
});

test("a tail call to a player is a play", () => {
  const method = CODE;
  const memory = memoryWith({ [method]: [addiu(R.a1, R.zero, 0x43), j(PLAY_MOTION), nop] });
  const played = playedRecords(memory, [method]);
  assert.deepEqual(played.records, [0x43]);
  assert.deepEqual(played.playerSites, [method + 4]);
});

test("a summary cut short by recursion isn't reused elsewhere", () => {
  const first = CODE;
  const second = CODE + 0x40;
  const a = CODE + 0x100;
  const b = CODE + 0x200;
  const memory = memoryWith({
    // first: a(monster, 3); second: b(monster, 9)
    [first]: [jal(a), addiu(R.a1, R.zero, 3), jrRa, nop],
    [second]: [jal(b), addiu(R.a1, R.zero, 9), jrRa, nop],
    // a(monster, index): b(monster, index), then plays index
    [a]: [
      move(R.s0, R.a0),
      jal(b),
      move(R.s1, R.a1),
      move(R.a0, R.s0),
      jal(PLAY_MOTION),
      move(R.a1, R.s1),
      jrRa,
      nop,
    ],
    // b(monster, index): a(monster, index), which is busy when reached from a
    [b]: [jal(a), nop, jrRa, nop],
  });
  assert.deepEqual(playedRecords(memory, [first, second]).records, [3, 9]);
});

test("a stack slot handed to a call may change", () => {
  const method = CODE;
  const pick = CODE + 0x100;
  const memory = memoryWith({
    [method]: [
      addiu(R.sp, R.sp, -0x20),
      sw(R.ra, 0x1c, R.sp),
      move(R.s0, R.a0),
      addiu(R.v0, R.zero, 4),
      sw(R.v0, 0x10, R.sp), // index = 4
      jal(pick), // pick(&index)
      addiu(R.a0, R.sp, 0x10),
      lw(R.a1, 0x10, R.sp),
      jal(PLAY_MOTION),
      move(R.a0, R.s0),
      lw(R.ra, 0x1c, R.sp),
      jrRa,
      addiu(R.sp, R.sp, 0x20),
    ],
    [pick]: [jrRa, nop],
  });
  const played = playedRecords(memory, [method]);
  assert.deepEqual(played.records, []);
  assert.deepEqual(played.unresolved, [method + 8 * 4]);
});

test("an overlay's own frameless helper is followed", () => {
  const method = OVERLAY;
  const helper = OVERLAY + 0x108;
  const memory = memoryWith({
    [method]: [
      addiu(R.sp, R.sp, -0x10),
      sw(R.ra, 0xc, R.sp),
      jal(helper),
      nop,
      lw(R.ra, 0xc, R.sp),
      jrRa,
      addiu(R.sp, R.sp, 0x10),
    ],
    // After another function's tail call, not a `jr $ra`; no stack frame.
    [helper - 8]: [j(PLAY_RECORD), nop, j(PLAY_RECORD), addiu(R.a1, R.zero, 12)],
  });
  assert.deepEqual(playedRecords(memory, [method]).records, [12]);
});

test("a branch out of the code is followed no further", () => {
  const method = CODE;
  const memory = memoryWith({ [method]: [beq(R.zero, R.zero, 0x5000), nop] });
  assert.deepEqual(playedRecords(memory, [method]).unresolved, [method]);
});

test("records map to slots; a table that can switch leaves the shared slots undecided", () => {
  const TABLE = 0x09bd0000;
  const SHARED = 0x09bd38f0;
  const bytes = new Uint8Array(0x4000);
  // Records 0-2 play slots 1, 2 and 7; record 1 can switch tables.
  bytes.set([1, 0xff, 0, 0, 0, 0, 0, 0, 2, 0xff, 0, 1, 0, 0, 0, 0, 7, 0xff, 0, 0], 0);
  // The shared table plays slots 20-30.
  for (let i = 0; i < 11; i++) bytes[SHARED - TABLE + 8 * i] = 20 + i;
  const memory = new Memory();
  memory.add(TABLE, bytes);
  assert.deepEqual(recordSlots(memory, TABLE, [0]), { used: [1], undecided: [] });
  assert.deepEqual(recordSlots(memory, TABLE, [2, 0, 0x400, -1]), {
    used: [1, 7],
    undecided: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
  });
});
