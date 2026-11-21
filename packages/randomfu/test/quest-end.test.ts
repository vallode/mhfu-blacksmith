import assert from "node:assert/strict";
import { test } from "node:test";
import { linkBlob } from "../src/blob/link.js";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import {
  QUEST_END_FRAMES,
  STEPS,
  WORD,
  patchQuestEnd,
  questEndObjects,
  questEndWord,
  type QuestEnd,
} from "../src/patches/quest-end.js";
import { Cpu } from "./mips-cpu.js";

const VADDR = 0x08804000;
const CODE = 0x100;
/** EU's quest end steps (state 1's steps 0 to 2) and what they call. */
const STEPS_AT = 0x0886b324;
const STEP1 = STEPS_AT + 0x58;
const MESSAGE = 0x0885151c;
const SHOW = 0x088307bc;
const CHOOSE = 0x08872b40;
const TABLE = 0x089ac5a0;
/** Where the steps go on: the 20-second message, the one-minute message, the shared exit. */
const TWENTY = STEPS_AT + 0xdc;
const MINUTE = STEPS_AT + 0x140;
const EXIT = STEPS_AT + 0x484;
const QUEST = 0x09a05dc0;
const DRIVER = 0x08900000;
/** "Returning to village in 20 secs." and "... in 1 min.". */
const RETURN_20 = 0x14;
const RETURN_60 = 0x15;

function elfWith(at: number, words: readonly number[]): Buffer {
  const size = 0x80000;
  const elf = Buffer.alloc(CODE + size);
  elf.writeUInt32LE(0x464c457f, 0);
  elf.writeUInt32LE(0x34, 0x1c);
  elf.writeUInt16LE(1, 0x2c);
  elf.writeUInt32LE(1, 0x34);
  elf.writeUInt32LE(CODE, 0x38);
  elf.writeUInt32LE(VADDR, 0x3c);
  elf.writeUInt32LE(size, 0x44);
  words.forEach((w, k) => elf.writeUInt32LE(w >>> 0, CODE + at - VADDR + k * 4));
  return elf;
}

const codeAt = (elf: Buffer, at: number, n: number) =>
  Array.from({ length: n }, (_, k) => elf.readUInt32LE(CODE + at - VADDR + k * 4));

const j = (target: number) => ((0x02 << 26) | ((target >>> 2) & 0x03ffffff)) >>> 0;

/**
 * The steps' words on a CPU with a quest; where they go on is stood in for:
 * each message path stores the wait and gets its message, as the game's do.
 */
function quest(words: readonly number[], choose = 0) {
  const cpu = new Cpu();
  cpu.load(STEPS_AT, words);
  // The steps' calls change $ra, so these return to the test CPU's own return address.
  const back = [0x3c1f0bad, 0x03e00008, 0]; // lui $ra, 0x0BAD; jr $ra
  const jal = (target: number) => ((0x03 << 26) | ((target >>> 2) & 0x03ffffff)) >>> 0;
  // sw $v0, 0x710($s1); jal message; li $a1, id (the end messages' table's first two)
  const standIn = (id: number) => [0xae220710, jal(MESSAGE), 0x24050000 | id, ...back];
  cpu.load(TWENTY, standIn(RETURN_20));
  cpu.load(MINUTE, standIn(RETURN_60));
  cpu.load(EXIT, back);
  for (let k = 0; k < 32; k++) cpu.setU16(TABLE + k * 2, 0x14 + k);
  cpu.native.set(MESSAGE, (c) => c.reg[5]!);
  cpu.native.set(SHOW, () => 0);
  cpu.native.set(CHOOSE, () => choose);
  // Step 0 is entered with the quest's flags in $v0, step 1 with its countdown.
  cpu.load(DRIVER, [0x8e220028, j(STEPS_AT), 0, 0x8e220710, j(STEP1), 0]);
  /** Runs a step; returns the message it got, if any. */
  const run = (entry: number, flags: number) => {
    cpu.setU32(QUEST + 0x28, flags);
    cpu.reg[17] = QUEST;
    cpu.calls.length = 0;
    cpu.call(entry);
    return cpu.calls.find((c) => c.address === MESSAGE)?.args[1] ?? null;
  };
  /** Step 0: the banner's message and countdown. */
  const banner = (flags = 0x80002) => {
    cpu.setU8(QUEST + 1, 0);
    const message = run(DRIVER, flags);
    return { message, frames: cpu.u32(QUEST + 0x710), step: cpu.u8(QUEST + 1) };
  };
  /** Step 1's last frame: the wait it picks, and its message. */
  const wait = (flags: number) => {
    cpu.setU8(QUEST + 1, 1);
    cpu.setU32(QUEST + 0x710, 1);
    const message = run(DRIVER + 12, flags);
    return { frames: cpu.u32(QUEST + 0x710) | 0, message, step: cpu.u8(QUEST + 1) };
  };
  return { cpu, banner, wait };
}

/** Flags of a hunt (a minute), a gathering quest (20 s), and the two the choice call decides. */
const HUNT = 0x2;
const GATHERING = 0x80002;
const CHOSEN = 0x280002;

function patched(choice: QuestEnd, at = STEPS_AT, words: readonly number[] = STEPS) {
  const elf = elfWith(at, words);
  const word = patchQuestEnd(elf, choice);
  return { elf, word, words: codeAt(elf, at, words.length) };
}

test("the game's steps: a 5 s banner, then a minute, or 20 s on gathering quests", () => {
  const q = quest(STEPS);
  assert.deepEqual(q.banner(), { message: 0x20, frames: 150, step: 1 });
  assert.equal(q.banner(0x80012).message, 0x2e, "the other end message");
  assert.deepEqual(q.wait(HUNT), { frames: 1800, message: RETURN_60, step: 2 });
  assert.deepEqual(q.wait(GATHERING), { frames: 600, message: RETURN_20, step: 2 });
  assert.deepEqual(q.wait(CHOSEN), { frames: 1800, message: RETURN_60, step: 2 });
  assert.deepEqual(quest(STEPS, 1).wait(CHOSEN), { frames: 600, message: RETURN_20, step: 2 });
});

test("Normal keeps the game's waits", () => {
  const { words, word } = patched("normal");
  assert.equal(word, STEPS_AT + WORD);
  for (const choose of [0, 1]) {
    const game = quest(STEPS, choose);
    const ours = quest(words, choose);
    assert.deepEqual(ours.banner(), game.banner());
    assert.deepEqual(ours.banner(0x80012), game.banner(0x80012));
    for (const flags of [HUNT, GATHERING, CHOSEN]) {
      assert.deepEqual(ours.wait(flags), game.wait(flags), `flags ${flags.toString(16)}`);
    }
  }
});

test("Short waits 20 s after every quest, with the game's 20-second message", () => {
  const q = quest(patched("short").words);
  assert.deepEqual(q.banner(), { message: 0x20, frames: 150, step: 1 });
  for (const flags of [HUNT, GATHERING, CHOSEN]) {
    assert.deepEqual(q.wait(flags), { frames: 600, message: RETURN_20, step: 2 });
  }
});

test("Instant cuts the banner and the wait to a frame, with no message", () => {
  const q = quest(patched("instant").words);
  assert.deepEqual(q.banner(), { message: 0x20, frames: 1, step: 1 });
  for (const flags of [HUNT, GATHERING, CHOSEN]) {
    assert.deepEqual(q.wait(flags), { frames: 1, message: null, step: 2 });
  }
});

test("the blob changes the word, not the code", () => {
  const { words } = patched("normal");
  const q = quest(words);
  q.cpu.setU32(STEPS_AT + WORD, questEndWord("short"));
  assert.deepEqual(q.wait(HUNT), { frames: 600, message: RETURN_20, step: 2 });
  q.cpu.setU32(STEPS_AT + WORD, (300 << 16) | 90);
  assert.equal(q.banner().frames, 90);
  assert.deepEqual(q.wait(HUNT), { frames: 300, message: RETURN_20, step: 2 });
  q.cpu.setU32(STEPS_AT + WORD, (900 << 16) | 150);
  assert.deepEqual(q.wait(GATHERING), { frames: 900, message: RETURN_60, step: 2 });
});

test("the steps are found by their code, not their address", () => {
  // JP's are 8 bytes earlier, with other addresses in their loads and calls.
  const jp = [...STEPS];
  const jpAt = 0x0886b31c;
  jp[6] = 0x244295a0; // addiu $v0, $v0, lo(the message table)
  for (const k of [9, 13, 43, 49]) jp[k] = 0x3c02089c;
  for (const k of [11, 44]) jp[k] = 0x8c447508;
  for (const k of [15, 51]) jp[k] = 0x8c446cbc;
  jp[10] = jp[46] = 0x0e21450f;
  jp[14] = jp[50] = 0x0e20c280;
  jp[37] = 0x0e21cace;
  jp[47] = 0x944595a2;
  const { word, words } = patched("short", jpAt, jp);
  assert.equal(word, jpAt + WORD);
  assert.equal(words[7], 0x944595a0, "lhu $a1, JP's lo(table)($v0)");
  assert.equal(words[0x94 / 4 + 3], 0x0e21cace, "JP's choice call");
  assert.equal(words[WORD / 4], questEndWord("short"));
  const changed = [...STEPS];
  changed[17] = 0x24020097; // another banner length: not the code we know
  assert.match(String(patchQuestEnd(elfWith(STEPS_AT, changed), "short")), /doesn't match/);
});

// --- The blob ---

const BLOB = 0x099a1820;
const SAVE = 0x09999c60;
/** `struct rf_save_data`'s quest_end (`blob/rf.h`): the menu's choice + 1. */
const SAVED = SAVE + 0x666e0 + 18;

test("the blob sets the word to the save's choice, else the disc's", () => {
  const choices = Object.keys(QUEST_END_FRAMES) as QuestEnd[];
  const runtime = RUNTIME_OBJECTS.map((o) => ({
    name: o.name,
    data: Buffer.from(o.base64, "base64"),
  }));
  choices.forEach((disc, k) => {
    const blob = linkBlob([...runtime, ...questEndObjects()], BLOB, {
      rf_quest_end: STEPS_AT + WORD,
      rf_quest_end_choice: k + 1,
    });
    const cpu = new Cpu();
    cpu.write(BLOB, blob.image);
    const init = () => cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);
    init();
    assert.equal(cpu.u32(STEPS_AT + WORD), questEndWord(disc), `the disc's ${disc}`);
    choices.forEach((saved, s) => {
      cpu.setU8(SAVED, s + 1);
      init();
      assert.equal(cpu.u32(STEPS_AT + WORD), questEndWord(saved), `the save's ${saved}`);
    });
  });
});
