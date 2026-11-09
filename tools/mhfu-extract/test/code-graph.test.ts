import assert from "node:assert/strict";
import { test } from "node:test";
import { OVL_HEADER_SIZE, parseOvl } from "../src/container/ovl.js";
import { dumpAttacksRaw, type SearchFile } from "../src/emit/attacks-raw.js";
import { ATTACK_RECORD_SIZE } from "../src/monsters/attacks.js";
import { CodeGraph } from "../src/monsters/code-graph.js";
import { MONSTER_CHUNK_COUNT, MONSTER_CHUNK_SIZE } from "../src/monsters/hitzones.js";
import { scanCode } from "../src/monsters/mips.js";

const GAME_TASK_BASE = 0x09a5f200;
const EM_BASE = 0x09d1a180;
const [A0, V0, V1, RA, SP] = [4, 2, 3, 31, 29];

// MIPS encodings.
const lui = (rt: number, imm: number) => ((0x0f << 26) | (rt << 16) | (imm & 0xffff)) >>> 0;
const addiu = (rt: number, rs: number, imm: number) =>
  ((0x09 << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
const lbu = (rt: number, imm: number, rs: number) =>
  ((0x24 << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
const jal = (target: number) => ((0x03 << 26) | ((target >>> 2) & 0x03ffffff)) >>> 0;
const JR_RA = ((RA << 21) | 0x08) >>> 0;
const NOP = 0;
const PROLOGUE = addiu(SP, SP, -16);

/** `lui reg, %hi(address)` and `addiu reg, reg, %lo(address)`. */
const loadAddress = (reg: number, address: number) => [
  lui(reg, (address + 0x8000) >>> 16),
  addiu(reg, reg, address & 0xffff),
];

function ovl(name: string, loadBase: number, dataSize: number): Buffer {
  const buf = Buffer.alloc(OVL_HEADER_SIZE + dataSize);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(loadBase, 0x08);
  buf.writeUInt32LE(loadBase + buf.length, 0x1c);
  buf.write(name, 0x20, "latin1");
  return buf;
}

const writeWords = (buf: Buffer, at: number, words: number[]) =>
  words.forEach((w, i) => buf.writeUInt32LE(w, at + i * 4));

test("scanCode follows lui/addiu pairs, loads, calls and prologues", () => {
  const buf = ovl("em01.ovl", EM_BASE, 0x100);
  // An address whose low half is negative as a signed immediate.
  const address = EM_BASE + 0x9ff0;
  const fn = OVL_HEADER_SIZE + 0x10;
  writeWords(buf, fn, [
    PROLOGUE,
    ...loadAddress(A0, address),
    lbu(V0, 2, A0),
    jal(EM_BASE + 0x200),
    NOP,
    // A call clears a0: no address here.
    lbu(V1, 4, A0),
    JR_RA,
    NOP,
  ]);
  const scan = scanCode(parseOvl(buf));
  assert.deepEqual(scan.prologues, [fn]);
  assert.deepEqual(scan.addresses.get(address), [{ offset: fn + 8, kind: "addiu" }]);
  assert.deepEqual(scan.addresses.get(address + 2), [{ offset: fn + 12, kind: "mem" }]);
  assert.equal(scan.addresses.get(address + 4), undefined);
  assert.deepEqual(scan.calls, [{ offset: fn + 16, target: EM_BASE + 0x200 }]);
});

/**
 * em01.ovl: a table of 5 records; function F builds record 3's address;
 * G calls F; a list of two pointers holds G (and an address elsewhere);
 * Rathian's chunk (emID 1) points at the list from +0x160.
 */
function fixture() {
  const chunks = OVL_HEADER_SIZE;
  const task = ovl("game_task.ovl", GAME_TASK_BASE, MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE);
  const em = ovl("em01.ovl", EM_BASE, 0x400);
  const tableAt = OVL_HEADER_SIZE + 0x200;
  for (let i = 0; i < 5; i++) {
    const at = tableAt + i * ATTACK_RECORD_SIZE;
    em[at + 0x02] = 20 + i;
    em[at + 0x07] = 0xe0;
    em[at + 0x08] = 30;
    em[at + 0x14] = 10;
  }
  const f = OVL_HEADER_SIZE + 0x20;
  const g = OVL_HEADER_SIZE + 0x60;
  const list = OVL_HEADER_SIZE + 0x100;
  writeWords(em, f, [
    PROLOGUE,
    ...loadAddress(A0, EM_BASE + tableAt + 3 * ATTACK_RECORD_SIZE),
    JR_RA,
    NOP,
  ]);
  writeWords(em, g, [PROLOGUE, jal(EM_BASE + f), NOP, JR_RA, NOP]);
  writeWords(em, list, [EM_BASE + g, 0x08900000]);
  task.writeUInt32LE(EM_BASE + list, chunks + 1 * MONSTER_CHUNK_SIZE + 0x160);
  return { task, em, chunks, tableAt, f, g, list };
}

test("CodeGraph leads from a table's user up to the chunk slot naming its monster", () => {
  const { task, em, chunks, tableAt, f, g, list } = fixture();
  const gameTask = parseOvl(task);
  const graph = new CodeGraph(
    [
      { name: "game_task.ovl", ovl: gameTask, shared: true },
      { name: "overlay/em01.ovl", ovl: parseOvl(em), shared: false },
    ],
    { ovl: gameTask, offset: chunks },
  );
  const uses = graph.usesOf("overlay/em01.ovl", tableAt, tableAt + 5 * ATTACK_RECORD_SIZE, 24);
  assert.deepEqual(uses, [
    { file: "overlay/em01.ovl", offset: f + 8, kind: "addiu", func: f, record: 3, byte: 0 },
  ]);
  const links = graph.monstersOf("overlay/em01.ovl", f);
  const hex = (n: number) => `0x${n.toString(16)}`;
  assert.deepEqual(
    links.map((l) => [l.emId, l.at, l.depth, l.path]),
    [
      [
        1,
        "0x160",
        3,
        [`em01.ovl:${hex(list)} list[0/2]`, `em01.ovl:${hex(g)} func`, `em01.ovl:${hex(f)} func`],
      ],
    ],
  );
});

test("dumpAttacksRaw gives each table's code users and their monsters", () => {
  const { task, em, chunks, tableAt, f } = fixture();
  const gameTask = parseOvl(task);
  const files: SearchFile[] = [
    { name: "game_task.ovl", buf: task, ovl: gameTask },
    { name: "overlay/em01.ovl", buf: em, ovl: parseOvl(em), emId: 1 },
  ];
  const dump = dumpAttacksRaw(files, [], { ovl: gameTask, offset: chunks });
  const table = dump.files[1]!.tables[0]!;
  assert.equal(table.offset, tableAt);
  assert.deepEqual(
    table.code?.functions.map((fn) => [fn.file, fn.offset, fn.records, fn.monsters[0]?.emId]),
    [["overlay/em01.ovl", f, [3], 1]],
  );
});
