import assert from "node:assert/strict";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import { OVL_HEADER_SIZE, parseOvl } from "../src/container/ovl.js";
import { evaluate, fieldArg, render, valueOf } from "../src/monsters/attack-usage.js";
import { CodeGraph } from "../src/monsters/code-graph.js";

const BASE = 0x09a5f200;
const [ZERO, V0, V1, A0, A1, A2, A3, T0, S0, S1, SP, RA] = [0, 2, 3, 4, 5, 6, 7, 8, 16, 17, 29, 31];

const i = (op: number, rs: number, rt: number, imm: number) =>
  ((op << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
const r = (rs: number, rt: number, rd: number, sa: number, funct: number) =>
  ((rs << 21) | (rt << 16) | (rd << 11) | (sa << 6) | funct) >>> 0;
const lui = (rt: number, imm: number) => i(0x0f, 0, rt, imm);
const addiu = (rt: number, rs: number, imm: number) => i(0x09, rs, rt, imm);
const andi = (rt: number, rs: number, imm: number) => i(0x0c, rs, rt, imm);
const lbu = (rt: number, imm: number, rs: number) => i(0x24, rs, rt, imm);
const lh = (rt: number, imm: number, rs: number) => i(0x21, rs, rt, imm);
const sb = (rt: number, imm: number, rs: number) => i(0x28, rs, rt, imm);
const sw = (rt: number, imm: number, rs: number) => i(0x2b, rs, rt, imm);
const addu = (rd: number, rs: number, rt: number) => r(rs, rt, rd, 0, 0x21);
const sll = (rd: number, rt: number, sa: number) => r(0, rt, rd, sa, 0x00);
/** `seb rd, rt` (SPECIAL3 bshfl). */
const seb = (rd: number, rt: number) =>
  ((0x1f << 26) | (rt << 16) | (rd << 11) | (0x10 << 6) | 0x20) >>> 0;
const jal = (target: number) => ((0x03 << 26) | ((target >>> 2) & 0x03ffffff)) >>> 0;
const j = (target: number) => ((0x02 << 26) | ((target >>> 2) & 0x03ffffff)) >>> 0;
const b = (offset: number) => i(0x04, ZERO, ZERO, offset);
const JR_RA = r(RA, 0, 0, 0, 0x08);
const NOP = 0;
const PROLOGUE = addiu(SP, SP, -16);

function ovl(size: number): Buffer {
  const buf = Buffer.alloc(OVL_HEADER_SIZE + size);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(BASE, 0x08);
  buf.writeUInt32LE(BASE + buf.length, 0x1c);
  buf.write("game_task.ovl", 0x20, "latin1");
  return buf;
}
const writeWords = (buf: Buffer, at: number, words: number[]) =>
  words.forEach((w, k) => buf.writeUInt32LE(w, at + k * 4));

test("valueOf reads a start-of-kind plus variant index back from the copier call", () => {
  // As game_task.ovl 0x118a58 on the EU disc: s16 start[kind] + variant, struct in a3.
  const buf = ovl(0x100);
  const fn = OVL_HEADER_SIZE;
  const start = BASE + 0xc0;
  const struct = BASE + 0xe0;
  writeWords(buf, fn, [
    lbu(V1, 0x0d, A0),
    lbu(V0, 0x8b, A0),
    seb(A3, V0),
    andi(V0, V1, 0xff),
    lui(V1, (start + 0x8000) >>> 16),
    sll(A2, V0, 1),
    addiu(V1, V1, start & 0xffff),
    addu(V1, V1, A2),
    seb(V0, A3),
    lh(V1, 0, V1),
    lui(A3, (struct + 0x8000) >>> 16),
    addiu(A3, A3, struct & 0xffff),
    j(BASE + 0x80),
    addu(A2, V0, V1),
  ]);
  const reader = new BinaryReader(buf);
  const site = fn + 12 * 4;
  const index = valueOf(reader, fn, site, A2, site + 4);
  assert.equal(render(index), `variant + s16[0x${start.toString(16)} + kind << 1]`);
  assert.deepEqual(valueOf(reader, fn, site, A3, site + 4), { k: "const", v: struct });
  // start = [1, 4, 7, 9, 10]: kind 1, variant 2 is record 6.
  const starts = [1, 4, 7, 9, 10];
  const mem = (address: number) => starts[(address - start) / 2] ?? null;
  assert.equal(evaluate(index, 1, 2, mem), 6);
  assert.equal(evaluate(index, 4, 0, mem), 10);
});

test("fieldArg follows a spawner's arguments through its init to the kind byte", () => {
  const buf = ovl(0x200);
  const at = (offset: number) => BASE + offset;
  const spawner = OVL_HEADER_SIZE;
  const init = OVL_HEADER_SIZE + 0x80;
  const store = OVL_HEADER_SIZE + 0xc0;
  // store(shell, owner, kind, variant): shell[0x0D] = kind, shell[0x8B] = variant.
  writeWords(buf, store, [sb(A2, 0x0d, A0), sb(A3, 0x8b, A0), JR_RA, NOP]);
  // init(shell, owner, x, kind, variant): store(shell, owner, kind, variant).
  writeWords(buf, init, [
    PROLOGUE,
    addu(S0, A3, ZERO),
    addu(S1, T0, ZERO),
    addu(A2, S0, ZERO),
    addu(A3, S1, ZERO),
    jal(at(store)),
    NOP,
    JR_RA,
    NOP,
  ]);
  // spawner(_, owner, x, kind, variant): allocate, vtable, an else path that
  // clears the shell (skipped by a branch), then init(shell, owner, x, kind, variant).
  writeWords(buf, spawner, [
    PROLOGUE,
    addu(S0, A3, ZERO),
    addu(S1, T0, ZERO),
    jal(at(0x1f0)),
    NOP,
    addu(A1, V0, ZERO),
    lui(V1, 0x089c),
    sw(V1, 0, A1),
    b(2),
    NOP,
    addu(A1, ZERO, ZERO),
    addu(A0, A1, ZERO),
    addu(A3, S0, ZERO),
    jal(at(init)),
    addu(T0, S1, ZERO),
    JR_RA,
    NOP,
  ]);
  // wrapper(_, owner, kind): shell = ctor(); store(shell, owner, kind, 0).
  const ctor = OVL_HEADER_SIZE + 0x100;
  const wrapper = OVL_HEADER_SIZE + 0x120;
  writeWords(buf, ctor, [PROLOGUE, JR_RA, NOP]);
  writeWords(buf, wrapper, [
    PROLOGUE,
    addu(S0, A2, ZERO),
    jal(at(ctor)),
    NOP,
    addu(A0, V0, ZERO),
    addu(A2, S0, ZERO),
    jal(at(store)),
    addu(A3, ZERO, ZERO),
    JR_RA,
    NOP,
  ]);
  const ovlFile = parseOvl(buf);
  const graph = new CodeGraph([{ name: "game_task.ovl", ovl: ovlFile, shared: true }], null);
  assert.equal(fieldArg(graph, "game_task.ovl", store, 0x0d, true, new Set()), 2);
  assert.equal(fieldArg(graph, "game_task.ovl", init, 0x0d, true, new Set()), 3);
  assert.equal(fieldArg(graph, "game_task.ovl", spawner, 0x0d, false, new Set()), 3);
  assert.equal(fieldArg(graph, "game_task.ovl", spawner, 0x8b, false, new Set()), 4);
  // The wrapper's shell is what the constructor returns.
  assert.equal(fieldArg(graph, "game_task.ovl", wrapper, 0x0d, false, new Set([at(ctor)])), 2);
  assert.equal(fieldArg(graph, "game_task.ovl", wrapper, 0x0d, false, new Set()), null);
});
