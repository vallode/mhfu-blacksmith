import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edits } from "../src/edits.js";
import {
  CARD_LENGTH,
  GETTER_CODE,
  GROUP_SUM_CODE,
  GROUP_SUM_WORDS,
  HUNTED_CODE,
  LINE_FORMAT,
  MAX_COUNT,
  findMonsterList,
  monsterListReport,
  patchMonsterList,
} from "../src/patches/monster-list.js";
import { jalTo } from "../src/patches/mips.js";
import { Cpu } from "./mips-cpu.js";

const VADDR = 0x08804000;
const CODE = 0x100;
const SIZE = 0x1000;
const SLAIN_GET = VADDR + 0x40;
const CAPTURED_GET = VADDR + 0x60;
const MESSAGE = VADDR + 0x80;
const SLAIN = VADDR + 0x100;
const CAPTURED = SLAIN + GROUP_SUM_WORDS * 4;
const HUNTED = CAPTURED + GROUP_SUM_WORDS * 4;
const CARD = VADDR + 0x400;
const PRINT = VADDR + 0x800;
const EXTRA = VADDR + 0x900;

/** The EU disc's globals, as the card's and the sums' immediates give them. */
const SAVE_POINTER = 0x089cc438;
const PRINTER_POINTER = 0x08a631a8;
const GROUPS = 0x0899bf40;
const SAVE = 0x09999c60;
const PRINTER = 0x09100000;
const LISTS = 0x09000000;
const SLAIN_COUNTS = 0x46e8;
const CAPTURED_COUNTS = 0x44cc;
const ENTRY = 0x09200000;

/**
 * The card's third line as on EU (entry in `$s0`, count in `$s2`), with the
 * calls pointed at this EBOOT's functions; `jp` gives JP's registers
 * (entry `$s1`, count `$s0`).
 */
function cardWords(jp = false): number[] {
  return [
    0x3c02089d,
    jp ? 0x92250003 : 0x92050003,
    jalTo(HUNTED),
    0x8c44c438,
    jp ? 0x3050ffff : 0x3052ffff,
    0x3c02089d,
    0x8c44c438,
    0x3c02089b,
    jalTo(MESSAGE),
    0x9445c63e,
    0x00403821,
    0x3c0208a6,
    0x97a30082,
    0x8c4431a8,
    0x87a50080,
    jp ? 0x02004021 : 0x02404021,
    0x24620020,
    jalTo(PRINT),
    0x7c023620,
  ];
}

const at = (vaddr: number) => CODE + vaddr - VADDR;

/** An EBOOT with the getters, the group sums, `hunted` and the card's line. */
function eboot({ jp = false, extraCall = false } = {}): Buffer {
  const elf = Buffer.alloc(CODE + SIZE);
  elf.writeUInt32LE(0x464c457f, 0);
  elf.writeUInt32LE(0x34, 0x1c);
  elf.writeUInt16LE(1, 0x2c);
  elf.writeUInt32LE(1, 0x34);
  elf.writeUInt32LE(CODE, 0x38);
  elf.writeUInt32LE(VADDR, 0x3c);
  elf.writeUInt32LE(SIZE, 0x44);
  const put = (vaddr: number, words: readonly number[]) =>
    words.forEach((w, k) => elf.writeUInt32LE(w >>> 0, at(vaddr) + k * 4));
  put(SLAIN_GET, [...GETTER_CODE.slice(0, 4), 0x94420000 | SLAIN_COUNTS]);
  put(CAPTURED_GET, [...GETTER_CODE.slice(0, 4), 0x94420000 | CAPTURED_COUNTS]);
  put(MESSAGE, [0x03e00008, 0]);
  const sum = (getter: number) => GROUP_SUM_CODE.map((w, k) => (k === 16 ? jalTo(getter) : w));
  put(SLAIN, sum(SLAIN_GET));
  put(CAPTURED, sum(CAPTURED_GET));
  put(
    HUNTED,
    HUNTED_CODE.map((w, k) => (k === 5 ? jalTo(SLAIN) : k === 9 ? jalTo(CAPTURED) : w)),
  );
  // The card goes on: here, back to the test (`Cpu.call`'s return address).
  put(CARD, [...cardWords(jp), 0x3c1f0bad, 0x03e00008, 0]);
  if (extraCall) put(EXTRA, [jalTo(SLAIN), 0]);
  return elf;
}

function patch(elf: Buffer): { out: Buffer; problem: string | null } {
  const out = Buffer.from(elf);
  const edits = { eboot: () => out } as unknown as Edits;
  return { out, problem: patchMonsterList(elf, edits) };
}

/** Group 5 is emIDs 7 and 8; group 6 is emID 9. */
function cpuFor(
  elf: Buffer,
  counts: Record<number, [slain: number, captured: number]>,
): { cpu: Cpu; prints: { args: number[]; text: string }[] } {
  const cpu = new Cpu();
  cpu.write(VADDR, elf.subarray(CODE, CODE + SIZE));
  cpu.setU32(SAVE_POINTER, SAVE);
  cpu.setU32(PRINTER_POINTER, PRINTER);
  cpu.setU32(GROUPS + 5 * 4, LISTS);
  cpu.write(LISTS, Buffer.from([7, 8, 0xff]));
  cpu.setU32(GROUPS + 6 * 4, LISTS + 4);
  cpu.write(LISTS + 4, Buffer.from([9, 0xff]));
  for (const [em, [slain, captured]] of Object.entries(counts)) {
    cpu.setU16(SAVE + SLAIN_COUNTS + Number(em) * 2, slain);
    cpu.setU16(SAVE + CAPTURED_COUNTS + Number(em) * 2, captured);
  }
  const prints: { args: number[]; text: string }[] = [];
  cpu.native.set(PRINT, (c) => {
    const r = (n: number) => c.reg[n]! >>> 0;
    prints.push({ args: [r(4), c.reg[5]!, c.reg[6]!, r(7), r(8), r(9)], text: c.string(r(7)) });
    return 0;
  });
  return { cpu, prints };
}

const COUNTS: Record<number, [number, number]> = { 7: [3, 2], 8: [1, 4], 9: [0, 0] };

test("monster list: finds the sums, the save's arrays and the card's line", () => {
  for (const jp of [false, true]) {
    const sites = findMonsterList(eboot({ jp }));
    assert.ok(typeof sites !== "string", String(sites));
    assert.deepEqual(sites, {
      slain: SLAIN,
      captured: CAPTURED,
      hunted: HUNTED,
      card: CARD,
      entry: jp ? 17 : 16,
      count: jp ? 16 : 18,
      groups: GROUPS,
      save: SAVE_POINTER,
      printer: PRINTER_POINTER,
      print: PRINT,
      slainCounts: SLAIN_COUNTS,
      capturedCounts: CAPTURED_COUNTS,
    });
  }
});

test("monster list: the card prints slain and captured and keeps the sum", () => {
  for (const jp of [false, true]) {
    const vanilla = eboot({ jp });
    const { out, problem } = patch(vanilla);
    assert.equal(problem, null);

    // The game: one count, message 90 (its text isn't in this EBOOT).
    const before = cpuFor(vanilla, COUNTS);
    before.cpu.reg[jp ? 17 : 16] = ENTRY;
    before.cpu.setU8(ENTRY + 3, 5);
    before.cpu.setU16(0x09fff000 + 0x80, 216);
    before.cpu.setU16(0x09fff000 + 0x82, 48);
    before.cpu.call(CARD);
    assert.equal(before.prints[0]!.args[4], 10);
    assert.equal(before.cpu.reg[jp ? 16 : 18], 10);

    const after = cpuFor(out, COUNTS);
    after.cpu.reg[jp ? 17 : 16] = ENTRY;
    after.cpu.setU8(ENTRY + 3, 5);
    after.cpu.setU16(0x09fff000 + 0x80, 216);
    after.cpu.setU16(0x09fff000 + 0x82, 48);
    after.cpu.call(CARD);
    assert.equal(after.prints.length, 1);
    const [printer, x, y, , slain, captured] = after.prints[0]!.args;
    assert.deepEqual([printer, x, y, slain, captured], [PRINTER, 216, 48 + 0x20, 4, 6]);
    assert.equal(after.prints[0]!.text, LINE_FORMAT);
    // The card still reads the sum, for whether it shows the record sizes.
    assert.equal(after.cpu.reg[jp ? 16 : 18], 10);
    // Nothing but the line's words changed in the card.
    assert.ok(
      out.subarray(at(CARD) + CARD_LENGTH * 4).equals(vanilla.subarray(at(CARD) + CARD_LENGTH * 4)),
    );
  }
});

test("monster list: hunted gives the game's sum, capped, for every caller", () => {
  const vanilla = eboot();
  const { out } = patch(vanilla);
  const cases: Record<number, [number, number]>[] = [
    COUNTS,
    { 7: [9000, 900], 8: [500, 0] },
    { 7: [MAX_COUNT, MAX_COUNT], 8: [MAX_COUNT, 1] },
    { 9: [0, 0] },
  ];
  for (const counts of cases) {
    for (const group of [5, 6]) {
      const game = cpuFor(vanilla, counts).cpu.call(HUNTED, [SAVE, group]) & 0xffff;
      const ours = cpuFor(out, counts).cpu.call(HUNTED, [SAVE, group]) & 0xffff;
      assert.equal(ours, game, `group ${group} of ${JSON.stringify(counts)}`);
    }
  }
  assert.equal(cpuFor(out, COUNTS).cpu.call(HUNTED, [SAVE, 0x105]) & 0xffff, 10);
});

test("monster list: each count is capped on the card", () => {
  const { out } = patch(eboot());
  const { cpu, prints } = cpuFor(out, { 7: [MAX_COUNT, 30], 8: [5, 1] });
  cpu.reg[16] = ENTRY;
  cpu.setU8(ENTRY + 3, 5);
  cpu.call(CARD);
  assert.deepEqual(prints[0]!.args.slice(4), [MAX_COUNT, 31]);
  assert.equal(cpu.reg[18], MAX_COUNT);
});

test("monster list: nothing is patched where the code differs or the sums have other callers", () => {
  const extra = patch(eboot({ extraCall: true }));
  assert.match(extra.problem!, /other callers/);

  const noCard = eboot();
  noCard.writeUInt32LE(0x02604021, at(CARD) + 15 * 4); // move t0, s3: not the count
  assert.match(patch(noCard).problem!, /card doesn't match/);

  const noSums = eboot();
  noSums.writeUInt32LE(0, at(SLAIN));
  assert.match(patch(noSums).problem!, /group counts don't match/);

  for (const elf of [eboot({ extraCall: true }), noCard, noSums]) {
    const { out } = patch(elf);
    assert.ok(out.equals(elf));
  }
  assert.match(monsterListReport("why").summary ?? "", /not applied \(why\)/);
  assert.equal(monsterListReport(null).summary ?? "", "Monster List: slain and captured");
});
