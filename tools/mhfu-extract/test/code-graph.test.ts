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
const [A0, A1, A2, A3, V0, V1, RA, SP] = [4, 5, 6, 7, 2, 3, 31, 29];

// MIPS encodings.
const lui = (rt: number, imm: number) => ((0x0f << 26) | (rt << 16) | (imm & 0xffff)) >>> 0;
const addiu = (rt: number, rs: number, imm: number) =>
  ((0x09 << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
const sb = (rt: number, imm: number, rs: number) =>
  ((0x28 << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
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
  // a0 holds the address as the call is made; nothing else is known.
  assert.deepEqual(scan.calls, [
    {
      offset: fn + 16,
      target: EM_BASE + 0x200,
      args: [address, null, null, null, null, null, null, null],
    },
  ]);
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
  const end = tableAt + 5 * ATTACK_RECORD_SIZE;
  const uses = graph.usesOf("overlay/em01.ovl", tableAt, end, tableAt, 24);
  assert.deepEqual(uses, [
    {
      file: "overlay/em01.ovl",
      offset: f + 8,
      kind: "addiu",
      func: f,
      rel: 72,
      record: 3,
      byte: 0,
    },
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
  // H builds an address 0x30 before the table (a struct the table is part of)
  // and calls K.
  const h = OVL_HEADER_SIZE + 0x90;
  const k = OVL_HEADER_SIZE + 0xc0;
  writeWords(em, h, [
    PROLOGUE,
    ...loadAddress(V0, EM_BASE + tableAt - 0x30),
    jal(EM_BASE + k),
    NOP,
    JR_RA,
    NOP,
  ]);
  writeWords(em, k, [JR_RA, NOP]);
  const gameTask = parseOvl(task);
  const files: SearchFile[] = [
    { name: "game_task.ovl", buf: task, ovl: gameTask },
    { name: "overlay/em01.ovl", buf: em, ovl: parseOvl(em), emId: 1 },
  ];
  const dump = dumpAttacksRaw(files, [], { ovl: gameTask, offset: chunks });
  const table = dump.files[1]!.tables[0]!;
  assert.equal(table.offset, tableAt);
  // Inside the table first, then the nearest outside it.
  assert.deepEqual(
    table.code?.uses.map((u) => [u.offset, u.rel, u.record, u.byte]),
    [
      [f + 8, 72, 3, 0],
      [h + 8, -0x30, -2, 0],
    ],
  );
  // The instruction words around a use: the use is the ninth.
  const words = table.code!.uses[1]!.words;
  assert.equal(
    words[8],
    em
      .readUInt32LE(h + 8)
      .toString(16)
      .padStart(8, "0"),
  );
  assert.equal(words.length, 17);
  assert.deepEqual(
    table.code?.functions.map((fn) => [fn.file, fn.offset, fn.records, fn.monsters[0]?.emId]),
    [
      ["overlay/em01.ovl", f, [3], 1],
      ["overlay/em01.ovl", h, [-2], undefined],
    ],
  );
  // Nothing else in em01.ovl's code builds an address.
  assert.deepEqual(table.code?.nearest, {});
  // The decoder's counts per overlay.
  assert.deepEqual(
    dump.scan?.find((s) => s.file === "overlay/em01.ovl"),
    { file: "overlay/em01.ovl", prologues: 3, calls: 2, callsResolved: 2, addresses: 2 },
  );
  // Each user's code, and the code of what it calls.
  assert.equal(table.code!.functions[1]!.code.slice(0, 8), em.subarray(h, h + 4).toString("hex"));
  assert.deepEqual(
    dump.callees?.map((c) => [c.file, c.offset, c.calledBy]),
    [["overlay/em01.ovl", k, [`overlay/em01.ovl:0x${h.toString(16)}`]]],
  );
});

test("storers and callSites find a spawner and the constants it is called with", () => {
  const chunks = OVL_HEADER_SIZE;
  const task = ovl(
    "game_task.ovl",
    GAME_TASK_BASE,
    MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE + 0x100,
  );
  const em = ovl("em01.ovl", EM_BASE, 0x100);
  // game_task.ovl: S(shell, attack, struct, owner) fills in bytes 0x0D, 0x26 and 0x15.
  const spawner = chunks + MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE;
  writeWords(task, spawner, [
    PROLOGUE,
    sb(A1, 0x0d, A0),
    sb(A2, 0x26, A0),
    sb(A3, 0x15, A0),
    JR_RA,
    NOP,
  ]);
  // em01.ovl: M spawns attack 5 with struct 2, setting a3 in the delay slot.
  const m = OVL_HEADER_SIZE + 0x10;
  writeWords(em, m, [
    PROLOGUE,
    addiu(A1, 0, 5),
    addiu(A2, 0, 2),
    jal(GAME_TASK_BASE + spawner),
    addiu(A3, 0, 7),
    JR_RA,
    NOP,
  ]);
  const gameTask = parseOvl(task);
  const files: SearchFile[] = [
    { name: "game_task.ovl", buf: task, ovl: gameTask },
    { name: "overlay/em01.ovl", buf: em, ovl: parseOvl(em), emId: 1 },
  ];
  const graph = new CodeGraph(
    files.map((f) => ({ name: f.name, ovl: f.ovl!, shared: f.name === "game_task.ovl" })),
    { ovl: gameTask, offset: chunks },
  );
  assert.deepEqual(graph.storers([0x0d, 0x15, 0x26], 2)[0], {
    file: "game_task.ovl",
    offset: spawner,
    fields: [0x0d, 0x15, 0x26],
    callers: 1,
  });
  assert.deepEqual(graph.callSites("game_task.ovl", spawner), [
    {
      file: "overlay/em01.ovl",
      offset: m + 12,
      func: m,
      args: [null, 5, 2, 7, null, null, null, null],
    },
  ]);
  const dump = dumpAttacksRaw(files, [], { ovl: gameTask, offset: chunks });
  assert.deepEqual(
    dump.spawns?.[0]?.sites.map((site) => site.args.slice(0, 4)),
    [[null, "0x5", "0x2", "0x7"]],
  );
});
