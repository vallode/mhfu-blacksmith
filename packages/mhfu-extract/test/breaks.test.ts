import assert from "node:assert/strict";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import { OVL_HEADER_SIZE, parseOvl } from "../src/container/ovl.js";
import { monsterBreaks, type MonsterTables } from "../src/emit/monsters.js";
import {
  BREAK_RECORD_SIZE,
  PART_DURABILITY_POINTER_OFFSET,
  PART_DURABILITY_RECORD_SIZE,
  locateBreakTable,
  readBreakTable,
  readSpeciesTable,
  type BreakRecord,
} from "../src/monsters/breaks.js";
import {
  MONSTER_CHUNK_COUNT,
  MONSTER_CHUNK_SIZE,
  readFlinchThresholds,
} from "../src/monsters/hitzones.js";
import { MONSTER_OVERLAY } from "../src/overlay/monsters.js";

const LOAD_BASE = 0x09a5a580;

function gameTask(): { buf: Buffer; chunks: number; durability: number } {
  const chunks = OVL_HEADER_SIZE;
  const durability = chunks + MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE;
  const buf = Buffer.alloc(durability + 3 * PART_DURABILITY_RECORD_SIZE + 4 * BREAK_RECORD_SIZE);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(LOAD_BASE, 0x08);
  buf.writeUInt32LE(LOAD_BASE + buf.length, 0x1c);
  return { buf, chunks, durability };
}

function record(
  buf: Buffer,
  at: number,
  [emId, part, flinches, flag, joint, breakType]: number[],
): void {
  buf.writeUInt8(emId!, at);
  buf.writeUInt8(part!, at + 1);
  buf.writeUInt8(flinches!, at + 2);
  buf.writeUInt8(flag!, at + 3);
  buf.writeInt16LE(joint!, at + 4);
  buf.writeUInt16LE(breakType!, at + 6);
}

test("the break table starts after the last part durability record and ends at emID 0", () => {
  const { buf, chunks, durability } = gameTask();
  // Rathian points at the second record, Rathalos at the third (the last).
  for (const [emId, index] of [
    [1, 1],
    [11, 2],
  ] as const)
    buf.writeUInt32LE(
      LOAD_BASE + durability + index * PART_DURABILITY_RECORD_SIZE,
      chunks + emId * MONSTER_CHUNK_SIZE + PART_DURABILITY_POINTER_OFFSET,
    );
  const table = durability + 3 * PART_DURABILITY_RECORD_SIZE;
  record(buf, table, [11, 1, 1, 0, 7, 2]);
  record(buf, table + BREAK_RECORD_SIZE, [17, 6, 2, 1, -1, 0xffff]);

  const ovl = parseOvl(buf);
  assert.equal(locateBreakTable(ovl, chunks), table);
  assert.deepEqual(readBreakTable(ovl, table), [
    { emId: 11, part: 1, flinches: 1, brokenHitzones: false, joint: 7, breakType: 2 },
    { emId: 17, part: 6, flinches: 2, brokenHitzones: true, joint: null, breakType: null },
  ]);

  // A record out of range means it isn't the table.
  record(buf, table, [11, 200, 1, 0, 7, 2]);
  assert.equal(readBreakTable(parseOvl(buf), table), null);
});

test("no part durability pointers, no break table", () => {
  const { buf, chunks } = gameTask();
  assert.equal(locateBreakTable(parseOvl(buf), chunks), null);
});

test("readSpeciesTable finds the emID -> species pointer table", () => {
  const base = 0x08801a4c;
  const table = 0x40;
  const records = table + MONSTER_CHUNK_COUNT * 4;
  const buf = Buffer.alloc(records + MONSTER_CHUNK_COUNT * 4);
  for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
    // Pink Rathian (37) shares Rathian's record.
    const own = emId === 37 ? 1 : emId;
    buf.writeUInt8(own, records + own * 4);
    buf.writeUInt32LE(base + records + own * 4, table + emId * 4);
  }
  const species = readSpeciesTable(new BinaryReader(buf), base)!;
  assert.equal(species.length, MONSTER_CHUNK_COUNT);
  assert.equal(species[1], 1);
  assert.equal(species[37], 1);
  assert.equal(species[11], 11);
  // At the wrong base address nothing has a majority.
  assert.equal(readSpeciesTable(new BinaryReader(buf), base + 0x10), null);
});

const tables = (breaks: BreakRecord[], species?: number[]): MonsterTables => ({
  chunks: [],
  carves: [],
  capBreak: [],
  breaks,
  species,
});
const drops = (emId: number) => MONSTER_OVERLAY.find((m) => m.id === emId)!.drops!;
const rec = (emId: number, part: number, flinches: number, breakType: number | null) => ({
  emId,
  part,
  flinches,
  brokenHitzones: false,
  joint: null,
  breakType,
});

test("monsterBreaks names table records after the break drop groups, by species", () => {
  const records = [
    rec(1, 1, 1, 2),
    rec(1, 2, 1, 2),
    rec(1, 6, 2, 1),
    // A visual break and another species' record stay out.
    rec(1, 7, 1, null),
    rec(11, 6, 2, 1),
  ];
  const expected = [
    { name: "head", parts: [6], flinches: 2 },
    { name: "wing", parts: [1, 2], flinches: 1 },
  ];
  assert.deepEqual(monsterBreaks(tables(records), 1, drops(1)), expected);
  // Pink Rathian (37) uses Rathian's records through the species table.
  const species = Array.from({ length: MONSTER_CHUNK_COUNT }, (_, i) => (i === 37 ? 1 : i));
  assert.deepEqual(monsterBreaks(tables(records, species), 37, drops(37)), expected);
  // Without the species table, it has none of its own.
  assert.deepEqual(monsterBreaks(tables(records), 37, drops(37)), []);
});

test("monsterBreaks adds the species' code-set breaks from overlay/breaks.json", () => {
  const species = Array.from({ length: MONSTER_CHUNK_COUNT }, (_, i) =>
    i === 86 ? 48 : i === 87 ? 67 : i,
  );
  assert.deepEqual(monsterBreaks(tables([], species), 86, drops(86)), [
    { name: "shell", parts: [2], flinches: null },
    { name: "claw", parts: [5, 6], flinches: 2, all_parts: true },
  ]);
  assert.deepEqual(monsterBreaks(tables([]), 88, drops(88)), [
    { name: "head", parts: [0], flinches: 4, below_hp: 0.5 },
    { name: "chest - requires fire element", parts: [2], flinches: 2, damage: "fire" },
  ]);
  // Terra Shogun gets only the entries limited to it.
  assert.deepEqual(monsterBreaks(tables([], species), 87, drops(87)), [
    { name: "claw", parts: [5, 6], flinches: 1 },
  ]);
  // No break table, no breaks.
  assert.deepEqual(monsterBreaks({ ...tables([]), breaks: undefined }, 88, drops(88)), []);
});

test("readFlinchThresholds reads a part per u16 up to the record's count", () => {
  const buf = Buffer.alloc(OVL_HEADER_SIZE + 0x40);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(LOAD_BASE, 0x08);
  buf.writeUInt32LE(LOAD_BASE + buf.length, 0x1c);
  const at = OVL_HEADER_SIZE;
  [130, 100, 100, 100, 100, 100, 80, 80, 0xffff].forEach((v, i) =>
    buf.writeUInt16LE(v, at + i * 2),
  );
  buf.writeUInt16LE(8, at + 18);
  const ovl = parseOvl(buf);
  assert.deepEqual(
    readFlinchThresholds(ovl, LOAD_BASE + at),
    [130, 100, 100, 100, 100, 100, 80, 80],
  );
  // A missing part reads as null; a count over 9 isn't a record.
  buf.writeUInt16LE(0xffff, at + 2);
  buf.writeUInt16LE(9, at + 18);
  assert.deepEqual(readFlinchThresholds(ovl, LOAD_BASE + at), [
    130,
    null,
    100,
    100,
    100,
    100,
    80,
    80,
    null,
  ]);
  buf.writeUInt16LE(10, at + 18);
  assert.equal(readFlinchThresholds(ovl, LOAD_BASE + at), null);
  assert.equal(readFlinchThresholds(ovl, 0x08900000), null);
});
