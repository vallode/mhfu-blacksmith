import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendSegment,
  repoint,
  type OldTable,
  type TableName,
} from "../src/patches/weapon-tables.js";

const CODE = 0x08804000;
const OLD = 0x08960000; // the melee stats' old place, 0x1000 bytes
const NEW = 0x09d65500;
const table: OldTable = {
  name: "meleeStats",
  vaddr: OLD,
  bytes: 0x1000,
  copy: 0x1000,
  newBytes: 0x2000,
};
const address = { meleeStats: NEW } as Record<TableName, number>;

const V0 = 2;
const A1 = 5;
const T0 = 8;
const SP = 29;
const hi = (a: number) => (a + 0x8000) >>> 16;
const lo = (a: number) => a & 0xffff;
const lui = (rt: number, imm: number) => (0x3c000000 | (rt << 16) | imm) >>> 0;
const iType = (op: number, rs: number, rt: number, imm: number) =>
  ((op << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
const lhu = (rt: number, imm: number, rs: number) => iType(0x25, rs, rt, imm);
const lw = (rt: number, imm: number, rs: number) => iType(0x23, rs, rt, imm);
const lwc1 = (ft: number, imm: number, rs: number) => iType(0x31, rs, ft, imm);
const beq = (rs: number, rt: number, words: number) => iType(0x04, rs, rt, words);
const sltu = (rd: number, rs: number, rt: number) =>
  ((rs << 21) | (rt << 16) | (rd << 11) | 0x2b) >>> 0;
const JR_RA = 0x03e00008;
const NOP = 0;

/** Runs `repoint` over `code` at CODE; returns the words after, the count and any problems. */
function run(code: number[]) {
  const buf = Buffer.alloc(code.length * 4);
  code.forEach((w, k) => buf.writeUInt32LE(w, k * 4));
  const problems: string[] = [];
  const count = repoint(buf, 0, CODE, buf.length, [table], address, problems);
  const words = code.map((_, k) => buf.readUInt32LE(k * 4));
  return { words, count, problems };
}

const at = OLD + 0x234;
const moved = NEW + 0x234;

test("a lui and a load addressing an old table move to the new table", () => {
  const { words, count } = run([lui(V0, hi(at)), lhu(T0, lo(at), V0), JR_RA, NOP]);
  assert.equal(count, 1);
  assert.equal(words[0], lui(V0, hi(moved)));
  assert.equal(words[1], lhu(T0, lo(moved), V0));
});

test("the walk ends at a return: the next function's use of the register is left alone", () => {
  const next = lw(V0, lo(at) + 8, A1); // the next function reading its own argument
  const { words } = run([lui(A1, hi(at)), lhu(T0, lo(at), A1), JR_RA, NOP, next]);
  assert.equal(words[1], lhu(T0, lo(moved), A1));
  assert.equal(words[4], next);
});

test("code past a return that a branch reaches is still followed", () => {
  const { words } = run([
    lui(V0, hi(at)),
    beq(4, 0, 3), // to the lhu, past the early return
    NOP,
    JR_RA,
    NOP,
    lhu(T0, lo(at), V0),
  ]);
  assert.equal(words[0], lui(V0, hi(moved)));
  assert.equal(words[5], lhu(T0, lo(moved), V0));
});

test("an FPU load into $f2 doesn't end the trace of $2", () => {
  const { words } = run([lui(V0, hi(at)), lwc1(V0, 0x10, SP), lhu(T0, lo(at), V0), JR_RA, NOP]);
  assert.equal(words[0], lui(V0, hi(moved)));
  assert.equal(words[2], lhu(T0, lo(moved), V0));
});

test("a lui whose bare value is also used another way isn't moved", () => {
  const code = [lui(V0, hi(at)), lhu(T0, lo(at), V0), sltu(T0, V0, A1), JR_RA, NOP];
  const { words, count, problems } = run(code);
  assert.equal(count, 0);
  assert.equal(problems.length, 1);
  assert.deepEqual(words, code);
});

test("appendSegment adds a PT_LOAD and moves the program headers after it", () => {
  const elf = Buffer.alloc(0x123);
  elf.writeUInt32LE(0x464c457f, 0);
  elf.writeUInt32LE(0x34, 0x1c);
  elf.writeUInt16LE(1, 0x2c);
  elf.writeUInt32LE(1, 0x34);
  elf.writeUInt32LE(0xabcd, 0x38);
  const seg = Buffer.alloc(0x100, 7);
  const out = appendSegment(elf, seg, NEW);
  assert.deepEqual(
    out.subarray(0, elf.length),
    Buffer.concat([
      elf.subarray(0, 0x1c),
      out.subarray(0x1c, 0x20),
      elf.subarray(0x20, 0x2c),
      out.subarray(0x2c, 0x2e),
      elf.subarray(0x2e),
    ]),
  );
  const phoff = out.readUInt32LE(0x1c);
  assert.equal(out.readUInt16LE(0x2c), 2);
  assert.equal(phoff % 4, 0);
  assert.equal(out.readUInt32LE(phoff + 4), 0xabcd, "the old header, copied");
  const ph = phoff + 32;
  const field = (k: number) => out.readUInt32LE(ph + k * 4);
  // PT_LOAD, offset, vaddr, paddr, filesz, memsz
  assert.deepEqual([0, 2, 3, 4, 5].map(field), [1, NEW, NEW, 0x100, 0x100]);
  const offset = field(1);
  assert.equal(offset % 0x40, 0);
  assert.ok(offset >= elf.length);
  assert.deepEqual(out.subarray(offset, offset + 0x100), seg);
});
