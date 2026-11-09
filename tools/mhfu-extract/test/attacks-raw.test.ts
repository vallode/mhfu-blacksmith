import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import { writeAttacksRaw } from "../src/cli/attacks-raw.js";
import { OVL_HEADER_SIZE, parseOvl } from "../src/container/ovl.js";
import {
  cribAttacks,
  dumpAttacksRaw,
  type AttackCrib,
  type AttackRawDump,
  type CribAttack,
  type SearchFile,
} from "../src/emit/attacks-raw.js";
import {
  ATTACK_RECORD_SIZE,
  findAttackTables,
  isAttackRecord,
  readAttackRecord,
} from "../src/monsters/attacks.js";
import { MONSTER_CHUNK_COUNT, MONSTER_CHUNK_SIZE } from "../src/monsters/hitzones.js";
import { monsterIdOf } from "../src/overlay/monsters.js";
import crib from "../src/overlay/attack-crib.json" with { type: "json" };
import { pac } from "./model-fixtures.js";

const GAME_TASK_BASE = 0x09a5a580;
const EM_BASE = 0x09d15100;

/**
 * Blangonga's first six records on the EU disc (`game_task.ovl` 0x1a8f98):
 * Arm Lunge, Body Slam, Claw Swipe twice, Pounce, Burrow.
 */
const BLANGONGA = [
  "00244102000000e028011000000000010500000019000000",
  "00104102000000e01001010000000001050000001e000000",
  "000e2302000000e01001020000000001050000000a000000",
  "000e2302000000e01001030000000001050000000a000000",
  "00163702000000e01001110000000001050000001e000000",
  "00104103001000e010810100000000010500000014000000",
].map((h) => Buffer.from(h, "hex"));

/** Deterministic noise. */
function noise(buf: Buffer, seed = 1): Buffer {
  let x = seed;
  for (let at = 0; at < buf.length; at++) {
    x = (x * 1103515245 + 12345) >>> 0;
    buf[at] = x >>> 24;
  }
  return buf;
}

function ovl(name: string, loadBase: number, dataSize: number, seed: number): Buffer {
  const buf = noise(Buffer.alloc(OVL_HEADER_SIZE + dataSize), seed);
  buf.fill(0, 0, OVL_HEADER_SIZE);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(loadBase, 0x08);
  buf.writeUInt32LE(loadBase + buf.length, 0x1c);
  buf.write(name, 0x20, "latin1");
  return buf;
}

function writeRecords(buf: Buffer, at: number, records: Buffer[]): void {
  records.forEach((r, i) => r.copy(buf, at + i * ATTACK_RECORD_SIZE));
}

test("readAttackRecord decodes Blangonga's Arm Lunge", () => {
  assert.deepEqual(readAttackRecord(new BinaryReader(BLANGONGA[0]!), 0), {
    damage: 65,
    reaction: 2,
    guard: 40,
    element: 1,
    index: 16,
    status: 0,
    statusValue: 0,
    stun: 25,
  });
  // Burrow is one of its ice attacks.
  assert.equal(readAttackRecord(new BinaryReader(BLANGONGA[5]!), 0).element, 0x81);
});

test("findAttackTables finds runs of records in noise", () => {
  const buf = noise(Buffer.alloc(0x400), 5);
  writeRecords(buf, 0x48, BLANGONGA);
  writeRecords(buf, 0x200, BLANGONGA.slice(0, 3));
  // A run broken by one non-zero byte where records always have zero.
  writeRecords(buf, 0x300, BLANGONGA.slice(0, 4));
  buf[0x300 + 2 * ATTACK_RECORD_SIZE + 0x15] = 7;
  assert.equal(isAttackRecord(buf, 0x48), true);
  assert.equal(isAttackRecord(buf, 0x48 + 4), false);
  assert.deepEqual(findAttackTables(buf), [{ offset: 0x48, count: 6 }]);
});

test("dumpAttacksRaw labels tables from the crib and lists pointers to records", () => {
  const BLANGONGA_ID = monsterIdOf("Blangonga")!;
  const chunks = OVL_HEADER_SIZE;
  const tableAt = chunks + MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE + 0x100;
  const task = ovl("game_task.ovl", GAME_TASK_BASE, tableAt - OVL_HEADER_SIZE + 0x200, 3);
  task.fill(0, chunks, chunks + MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE);
  writeRecords(task, tableAt, BLANGONGA);
  const second = GAME_TASK_BASE + tableAt + ATTACK_RECORD_SIZE;
  task.writeUInt32LE(second, chunks + BLANGONGA_ID * MONSTER_CHUNK_SIZE + 0x160);

  // em01.ovl: a table, a pointer to it from itself, and from em02.ovl (same addresses).
  const em1 = ovl("em01.ovl", EM_BASE, 0x200, 7);
  const em1Table = OVL_HEADER_SIZE + 0x40;
  writeRecords(em1, em1Table, BLANGONGA.slice(1, 5));
  em1.writeUInt32LE(EM_BASE + em1Table, OVL_HEADER_SIZE + 8);
  const em2 = ovl("em02.ovl", EM_BASE, 0x200, 9);
  em2.writeUInt32LE(EM_BASE + em1Table, OVL_HEADER_SIZE + 8);

  const gameTask = parseOvl(task);
  const files: SearchFile[] = [
    { name: "game_task.ovl", buf: task, ovl: gameTask },
    { name: "overlay/em01.ovl", buf: em1, ovl: parseOvl(em1), emId: 1 },
    { name: "overlay/em02.ovl", buf: em2, ovl: parseOvl(em2), emId: 2 },
  ];
  const testCrib: CribAttack[] = [
    { monster: "Blangonga", name: "Arm Lunge", damage: 65, stun: 25, guard: 40 },
    { monster: "Blangonga", name: "Claw Swipe", damage: 35, stun: 10, guard: 16 },
    { monster: "Blangonga", name: "Pounce", damage: 55, stun: 30, guard: 16 },
    // No stun given: damage and guard knockback are enough.
    { monster: "Blangonga", name: "Burrow", damage: 65, guard: 16 },
    // Wrong stun: not a match.
    { monster: "Rajang", name: "Punch", damage: 65, stun: 99, guard: 40 },
  ];
  const dump: AttackRawDump = dumpAttacksRaw(files, testCrib, { ovl: gameTask, offset: chunks });

  const [taskFile, em1File, em2File] = dump.files;
  assert.equal(taskFile!.tables.length, 1);
  const table = taskFile!.tables[0]!;
  assert.equal(table.offset, tableAt);
  assert.equal(table.vaddr, `0x${(GAME_TASK_BASE + tableAt).toString(16)}`);
  assert.equal(table.count, 6);
  assert.deepEqual(table.monster, { name: "Blangonga", attacks: 4 });
  assert.deepEqual(table.records[0]!.crib, ["Blangonga: Arm Lunge"]);
  assert.equal(table.records[0]!.hex, BLANGONGA[0]!.toString("hex"));
  assert.deepEqual(table.records[1]!.crib, ["Blangonga: Burrow"]);
  assert.deepEqual(table.records[1]!.refs, [
    {
      file: "game_task.ovl",
      offset: chunks + BLANGONGA_ID * MONSTER_CHUNK_SIZE + 0x160,
      chunk: { emId: BLANGONGA_ID, at: "0x160" },
    },
  ]);
  assert.equal(table.before.length, 0x80 * 2);

  // em02.ovl's pointer to the same address isn't em01's.
  assert.deepEqual(em1File!.tables[0]!.records[0]!.refs, [
    { file: "overlay/em01.ovl", offset: OVL_HEADER_SIZE + 8 },
  ]);
  assert.equal(em1File!.emId, 1);
  assert.deepEqual(em2File!.tables, []);
});

test("writeAttacksRaw searches the emNN.ovl files and model package entries", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "attacks-raw-"));
  try {
    const em = ovl("em51.ovl", EM_BASE, 0x400, 11);
    writeRecords(em, OVL_HEADER_SIZE + 0x100, BLANGONGA);
    const motions = noise(Buffer.alloc(0x400), 13);
    writeRecords(motions, 0x80, BLANGONGA.slice(0, 4));
    await mkdir(path.join(dir, "data-bin", "overlay"), { recursive: true });
    await mkdir(path.join(dir, "data-bin", "emmodel"), { recursive: true });
    await writeFile(path.join(dir, "data-bin", "overlay", "em51.ovl"), em);
    await writeFile(
      path.join(dir, "data-bin", "emmodel", "em51.pac"),
      pac([Buffer.alloc(0x10), motions]),
    );
    const task = ovl("game_task.ovl", GAME_TASK_BASE, MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE, 1);
    const sub = ovl("game_sub.ovl", 0x09c14280, 0x40, 2);

    await writeAttacksRaw(
      dir,
      dir,
      Buffer.alloc(0x40),
      { gameTask: parseOvl(task), gameSub: parseOvl(sub) },
      OVL_HEADER_SIZE,
    );
    const dump = JSON.parse(
      await readFile(path.join(dir, "raw", "attacks.json"), "utf-8"),
    ) as AttackRawDump;
    assert.deepEqual(
      dump.files.map((f) => [f.name, f.tables.map((t) => [t.offset, t.count, t.monster?.name])]),
      [
        ["eboot.bin", []],
        ["game_task.ovl", []],
        ["game_sub.ovl", []],
        ["overlay/em51.ovl", [[OVL_HEADER_SIZE + 0x100, 6, "Blangonga"]]],
        ["emmodel/em51.pac#0", []],
        ["emmodel/em51.pac#1", [[0x80, 4, "Blangonga"]]],
      ],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the committed crib names site monsters", () => {
  const attacks = cribAttacks(crib as AttackCrib);
  assert.equal(attacks.length, 283);
  for (const monster of Object.keys((crib as AttackCrib).monsters)) {
    assert.notEqual(monsterIdOf(monster), null, monster);
  }
});
