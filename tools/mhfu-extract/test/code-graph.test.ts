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
const sbOp = (rt: number, imm: number, rs: number) =>
  ((0x28 << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
const j = (target: number) => ((0x02 << 26) | ((target >>> 2) & 0x03ffffff)) >>> 0;
const sw = (rt: number, imm: number, rs: number) =>
  ((0x2b << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
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

test("dumpAttacksRaw finds constructors, their vtables' attack tables and their callers", () => {
  const chunks = OVL_HEADER_SIZE;
  const after = chunks + MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE;
  const task = ovl("game_task.ovl", GAME_TASK_BASE, after - OVL_HEADER_SIZE + 0x400);
  const em = ovl("em01.ovl", EM_BASE, 0x100);
  const at = (offset: number) => GAME_TASK_BASE + offset;
  // A table of 5 records, and U, a setup function building record 1's address.
  const table = after + 0x200;
  for (let i = 0; i < 5; i++) {
    task[table + i * ATTACK_RECORD_SIZE + 0x02] = 20 + i;
    task[table + i * ATTACK_RECORD_SIZE + 0x07] = 0xe0;
  }
  const u = after;
  const x = after + 0x20;
  const y = after + 0x40;
  const init = after + 0x60;
  const ctor = after + 0x80;
  const ctor2 = after + 0xc0;
  // The record copier C (record byte k to shell byte 0x1C + k) and its entry E.
  const copier = after + 0x200 + 5 * ATTACK_RECORD_SIZE + 0x10;
  const entry = copier - 0x10;
  writeWords(task, copier, [
    PROLOGUE,
    ...Array.from({ length: 12 }, (_, k) => [lbu(A3, k, V0), sbOp(A3, 0x1c + k, A0)]).flat(),
    JR_RA,
    NOP,
  ]);
  writeWords(task, entry, [sw(A3, 200, A0), j(at(copier)), NOP]);
  // U: reads a per-kind array, builds a record's address, calls E with kind 2.
  const kinds = after + 0x1c0;
  writeWords(task, kinds, [0x11223344]);
  writeWords(task, u, [
    PROLOGUE,
    ...loadAddress(V0, at(kinds)),
    ...loadAddress(A0, at(table + ATTACK_RECORD_SIZE)),
    addiu(A2, 0, 2),
    jal(at(entry)),
    NOP,
    JR_RA,
    NOP,
  ]);
  for (const f of [x, y, init]) writeWords(task, f, [PROLOGUE, JR_RA, NOP]);
  // The vtable: U, X, Y.
  const vtable = after + 0x180;
  writeWords(task, vtable, [at(u), at(x), at(y)]);
  // C: obj->vtable = vtable; init(obj, ...).
  writeWords(task, ctor, [
    PROLOGUE,
    ...loadAddress(V1, at(vtable)),
    sw(V1, 0, A0),
    jal(at(init)),
    NOP,
    JR_RA,
    NOP,
  ]);
  // C2: a vtable in the EBOOT.
  const EBOOT_BASE = 0x08804000;
  const eboot = Buffer.alloc(0x100);
  writeWords(eboot, 0x40, [at(x), at(y), at(init)]);
  writeWords(task, ctor2, [
    PROLOGUE,
    ...loadAddress(V1, EBOOT_BASE + 0x40),
    sw(V1, 0, A0),
    jal(at(init)),
    NOP,
    JR_RA,
    NOP,
  ]);
  // em01.ovl: M calls C with attack 5; W calls M with 9 in a3.
  const m = OVL_HEADER_SIZE + 0x10;
  const w = OVL_HEADER_SIZE + 0x40;
  writeWords(em, m, [PROLOGUE, addiu(A2, 0, 5), jal(at(ctor)), NOP, JR_RA, NOP]);
  writeWords(em, w, [PROLOGUE, addiu(A3, 0, 9), jal(EM_BASE + m), NOP, JR_RA, NOP]);

  const gameTask = parseOvl(task);
  const files: SearchFile[] = [
    { name: "game_task.ovl", buf: task, ovl: gameTask },
    { name: "overlay/em01.ovl", buf: em, ovl: parseOvl(em), emId: 1 },
  ];
  const dump = dumpAttacksRaw(
    files,
    [],
    { ovl: gameTask, offset: chunks },
    { buf: eboot, base: EBOOT_BASE },
  );
  const hex = (n: number) => `0x${n.toString(16)}`;
  const [first, second] = dump.spawners!;
  // The spawner reaching a table comes first.
  assert.equal(first!.func, ctor);
  assert.equal(first!.vtable, hex(at(vtable)));
  assert.equal(first!.vtableIn, "game_task.ovl");
  assert.deepEqual(first!.slots[0], {
    slot: 0,
    value: hex(at(u)),
    file: "game_task.ovl",
    offset: u,
    tables: [`game_task.ovl@${hex(table)}`],
  });
  assert.deepEqual(first!.init, { file: "game_task.ovl", offset: init, callees: [] });
  assert.ok(dump.code?.[`game_task.ovl:${hex(init)}`]);
  assert.deepEqual(
    first!.sites.map((site) => [site.file, site.func, site.args.slice(0, 3)]),
    [["overlay/em01.ovl", m, [null, null, "0x5"]]],
  );
  // The copier, its entry, and U's call to the entry with its class and data.
  assert.deepEqual(dump.setters?.copiers, [
    { file: "game_task.ovl", offset: copier, entry: false },
    { file: "game_task.ovl", offset: entry, entry: true },
  ]);
  const setter = dump.setters!.sites.find((site) => site.func === u)!;
  assert.equal(setter.kind, "jal");
  assert.equal(setter.target, `game_task.ovl:${hex(entry)}`);
  assert.equal(setter.args[2], "0x2");
  assert.deepEqual(setter.classes, [hex(at(vtable))]);
  assert.ok(dump.code?.[setter.codeKey]);
  assert.equal(dump.data?.[`game_task.ovl:${hex(kinds)}`]?.slice(0, 8), "44332211");
  // The spawn chain: the constructor's code, the caller's code, and calls into the caller.
  assert.equal(
    dump.code?.[first!.codeKey!]?.slice(0, 8),
    task.subarray(ctor, ctor + 4).toString("hex"),
  );
  assert.equal(first!.sites[0]!.codeKey, `overlay/em01.ovl:${hex(m)}`);
  assert.deepEqual(
    first!.sites[0]!.callers?.map((c) => [c.file, c.func, c.kind, c.args[3]]),
    [["overlay/em01.ovl", w, "jal", "0x9"]],
  );
  assert.equal(second!.func, ctor2);
  assert.equal(second!.vtableIn, "eboot");
  assert.equal(second!.slots[2]!.offset, init);
  assert.equal(second!.slots[0]!.tables, undefined);
});
