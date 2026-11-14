import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edits } from "../src/edits.js";
import {
  CARD_BYTES,
  CARD_SUMMARIES,
  CARD_SUMMARY_BYTES,
  CARD_TABLE,
  CARDS,
  COMPACT_WORDS,
  GAME_CARDS,
  GuildCardSpace,
  assembleCompaction,
  findCardBounds,
} from "../src/patches/guild-card-space.js";
import { Cpu } from "./mips-cpu.js";

const CODE = 0x08901a60;
const SAVE_POINTER = 0x089cc438;
const SAVE = 0x09999c60;
const KEPT = 3;

function machine(kept = KEPT) {
  const cpu = new Cpu();
  const code = assembleCompaction(CODE, SAVE_POINTER, kept);
  cpu.load(CODE, code);
  cpu.setU32(SAVE_POINTER, SAVE);
  return { cpu, code };
}

const card = (slot: number) => SAVE + CARDS + slot * CARD_BYTES;
const summary = (slot: number) => SAVE + CARD_SUMMARIES + slot * CARD_SUMMARY_BYTES;
const table = (slot: number) => SAVE + CARD_TABLE + slot * 4;

test("the compaction frees most of the game's 351 words", () => {
  const { code } = machine();
  assert.ok(code.length <= 80, `${code.length} words`);
  assert.ok(COMPACT_WORDS - code.length >= 270);
});

for (const kept of [KEPT, 10]) {
  test(`compaction packs used cards, summaries and table entries into the first ${kept} slots`, () => {
    const { cpu } = machine(kept);
    const used = kept === KEPT ? [1, 2] : [1, 4, 5, 9];
    for (const slot of used) {
      cpu.fill(card(slot), CARD_BYTES, slot + 1);
      cpu.fill(summary(slot), CARD_SUMMARY_BYTES, slot + 101);
      cpu.setU32(table(slot), 0x1000 + slot);
    }
    // The freed slots past the kept ones (blob space) must not be touched.
    const freed = SAVE + CARDS + kept * CARD_BYTES;
    cpu.fill(freed, (GAME_CARDS - kept) * CARD_BYTES, 0xab);

    cpu.call(CODE);

    used.forEach((slot, k) => {
      assert.deepEqual(cpu.bytes(card(k), CARD_BYTES), Buffer.alloc(CARD_BYTES, slot + 1));
      assert.deepEqual(
        cpu.bytes(summary(k), CARD_SUMMARY_BYTES),
        Buffer.alloc(CARD_SUMMARY_BYTES, slot + 101),
      );
      assert.equal(cpu.u32(table(k)), 0x1000 + slot);
    });
    for (let k = used.length; k < kept; k++) {
      assert.equal(cpu.u16(card(k)), 0, `slot ${k} is empty`);
      assert.deepEqual(cpu.bytes(summary(k), CARD_SUMMARY_BYTES), Buffer.alloc(CARD_SUMMARY_BYTES));
      assert.equal(cpu.u32(table(k)), 0);
    }
    assert.deepEqual(
      cpu.bytes(freed, (GAME_CARDS - kept) * CARD_BYTES),
      Buffer.alloc((GAME_CARDS - kept) * CARD_BYTES, 0xab),
    );
  });
}

test("compaction with every kept slot full or empty changes nothing", () => {
  for (const full of [true, false]) {
    const { cpu } = machine();
    if (full) for (let k = 0; k < KEPT; k++) cpu.fill(card(k), CARD_BYTES, k + 1);
    const before = cpu.bytes(SAVE + CARDS, KEPT * CARD_BYTES);
    cpu.call(CODE);
    assert.deepEqual(cpu.bytes(SAVE + CARDS, KEPT * CARD_BYTES), before);
  }
});

test("card loops are found by their bound and stride", () => {
  const code = Buffer.alloc(64);
  const put = (at: number, w: number) => code.writeUInt32LE(w >>> 0, at);
  put(8, 0x2a020060); // slti v0, s0, 96
  put(12, 0x1440fef3);
  put(16, 0x26731078); // addiu s3, s3, 4216
  put(32, 0x2e220060); // sltiu v0, s1, 96
  put(36, 0x26101078); // addiu s0, s0, 4216
  put(48, 0x2a020060);
  put(52, 0x24761078); // addiu s6, v1, 4216: not a step
  assert.deepEqual(findCardBounds(code), [8, 32]);
  assert.deepEqual(findCardBounds(code, 0, 16), [32]);
});

test("the cave and the freed slots are handed out in order, and never twice", () => {
  const eboot = Buffer.alloc(0x2000);
  const edits = { eboot: () => eboot } as unknown as Edits;
  const segment = { offset: 0x100, vaddr: CODE - 0x100, size: 0x1f00 };
  const caveStart = CODE + 75 * 4;
  const caveEnd = CODE + COMPACT_WORDS * 4;
  const space = new GuildCardSpace(KEPT, SAVE_POINTER, SAVE, caveStart, caveEnd, segment, edits);

  const first = space.allocateCave(10);
  const second = space.allocateCave(20);
  assert.equal(first, caveStart);
  assert.equal(second, caveStart + 40);
  assert.throws(() => space.allocateCave(COMPACT_WORDS));
  space.writeCave(second, [0x12345678]);
  assert.equal(eboot.readUInt32LE(0x100 + (second - (CODE - 0x100))), 0x12345678);
  assert.throws(() => space.writeCave(caveEnd, [0]));

  assert.deepEqual(space.allocateSlots(1), {
    start: CARDS + KEPT * CARD_BYTES,
    end: CARDS + (KEPT + 1) * CARD_BYTES,
  });
  assert.deepEqual(space.allocateSlots(null), {
    start: CARDS + (KEPT + 1) * CARD_BYTES,
    end: CARDS + GAME_CARDS * CARD_BYTES,
  });
  assert.throws(() => space.allocateSlots(1));
});
