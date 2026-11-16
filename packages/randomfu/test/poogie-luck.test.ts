import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Edits } from "../src/edits.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { HOOK, assemblePickHook, writePickHook, type PickSite } from "../src/patches/game-hooks.js";
import { SAVE_DATA } from "../src/patches/guild-card-space.js";
import type { Segment } from "../src/patches/mips.js";
import {
  PICKER_SIGNATURE,
  PICKER_WORDS,
  QUEST_REWARD_SIGNATURE,
  QUEST_REWARD_WORDS,
  SAVE_POINTER_SIGNATURE,
  assembleQuestRewardWalk,
  poogieObjects,
  preparePoogieLuck,
} from "../src/patches/poogie-luck.js";
import { Cpu } from "./mips-cpu.js";

const VADDR = 0x08804000;
const CODE = 0x100;
const PICKER = VADDR + 0x400;
const SAVE_CODE = VADDR + 0xa00;
const QUEST_REWARDS = VADDR + 0xc00;
const SAVE = 0x089cc438;
const RNG_CONTEXT = 0x08a631a0;
const RNG = 0x088900c4;

const hi = (address: number) => (address + 0x8000) >>> 16;
const lo = (address: number) => address & 0xffff;

/** A minimal EBOOT ELF whose one segment holds the code the patch looks for. */
function fakeEboot(options: { pickers?: number } = {}): Buffer {
  const elf = Buffer.alloc(CODE + 0x1000);
  elf.writeUInt32LE(0x464c457f, 0);
  elf.writeUInt32LE(0x34, 0x1c); // phoff
  elf.writeUInt16LE(1, 0x2c); // phnum
  elf.writeUInt32LE(1, 0x34); // PT_LOAD
  elf.writeUInt32LE(CODE, 0x38);
  elf.writeUInt32LE(VADDR, 0x3c);
  elf.writeUInt32LE(0x1000, 0x44);
  const put = (vaddr: number, words: readonly number[]) =>
    words.forEach((w, k) => elf.writeUInt32LE(w >>> 0, CODE + vaddr - VADDR + k * 4));

  for (let p = 0; p < (options.pickers ?? 1); p++) {
    const at = PICKER + p * 0x200;
    put(at, PICKER_SIGNATURE);
    // The RNG context load and call the patch reads its addresses from.
    put(at + 0x64, [
      0x3c020000 | hi(RNG_CONTEXT),
      0x8c440000 | lo(RNG_CONTEXT),
      0x0c000000 | (RNG >>> 2),
    ]);
    put(at + (PICKER_WORDS - 2) * 4, [0x03e00008, 0x27bd0020]);
  }
  put(SAVE_CODE, [
    0x3c020000 | hi(SAVE),
    0x8c420000 | lo(SAVE),
    ...SAVE_POINTER_SIGNATURE.slice(2),
  ]);
  elf.writeUInt32LE(0x3c010006, CODE + SAVE_CODE - VADDR + 8);
  put(QUEST_REWARDS, QUEST_REWARD_SIGNATURE);
  return elf;
}

function editsFor(elf: Buffer): { edits: Edits; copy: () => Buffer | null } {
  let copy: Buffer | null = null;
  const edits = { eboot: () => (copy ??= Buffer.from(elf)) } as unknown as Edits;
  return { edits, copy: () => copy };
}

const words = (buffer: Buffer, vaddr: number, n: number) =>
  Array.from({ length: n }, (_, k) => buffer.readUInt32LE(CODE + vaddr - VADDR + k * 4));

test("Poogie's luck finds the picker, the RNG and the save, and patches nothing until the loader is in", () => {
  const elf = fakeEboot();
  const { edits, copy } = editsFor(elf);
  const luck = preparePoogieLuck(elf, edits);
  assert.ok(typeof luck !== "string");
  assert.deepEqual(luck.externs, {
    rf_pick_rand: RNG,
    rf_pick_rng: RNG_CONTEXT,
    rf_poogie_test_rolls: 1,
  });
  assert.equal(luck.pick.picker, PICKER);
  assert.deepEqual(luck.pick.prologue, PICKER_SIGNATURE.slice(0, 2));
  assert.equal(copy(), null, "nothing written yet");

  const skipped = luck.finish(false);
  assert.match(skipped.summary!, /not applied \(the code loader isn't in this image\)/);
  assert.equal(copy(), null);

  const report = luck.finish(true);
  assert.equal(report.summary, "Poogie: on");
  assert.match(report.notes[0]!, /Pet Poogie.*three times after 50 happy hunts and four after 200/);
  const out = copy()!;
  const walk = assembleQuestRewardWalk({ save: SAVE, picker: PICKER });
  assert.ok(walk.length <= QUEST_REWARD_WORDS);
  const written = words(out, QUEST_REWARDS, QUEST_REWARD_WORDS);
  assert.deepEqual(written.slice(0, walk.length), walk);
  assert.ok(written.slice(walk.length).every((w) => w === 0));
  const jals = walk
    .filter((w) => w >>> 26 === 0x03)
    .map((w) => ((w & 0x03ffffff) << 2) | 0x08000000);
  assert.deepEqual(jals, [PICKER]);
  // The game's code after the walk still reads the pick through $a2.
  assert.equal(words(out, QUEST_REWARDS + QUEST_REWARD_WORDS * 4, 1)[0], 0x94c40000);
  // Nothing else changes: the picker itself is the code loader's to hook.
  const start = CODE + QUEST_REWARDS - VADDR;
  out.fill(0, start, start + QUEST_REWARD_WORDS * 4);
  elf.fill(0, start, start + QUEST_REWARD_WORDS * 4);
  assert.ok(out.equals(elf));
});

test("the test build's lucky picks roll 1025 times, and its report says it isn't for play", () => {
  const elf = fakeEboot();
  const luck = preparePoogieLuck(elf, editsFor(elf).edits, { guaranteed: true });
  assert.ok(typeof luck !== "string");
  assert.equal(luck.externs.rf_poogie_test_rolls, 1025);
  const report = luck.finish(true);
  assert.match(report.summary!, /test build/);
  assert.match(report.notes.join(" "), /Not for play/);
});

test("Poogie's luck says why when a signature is missing or ambiguous", () => {
  assert.match(
    String(preparePoogieLuck(fakeEboot({ pickers: 0 }), editsFor(fakeEboot()).edits)),
    /doesn't match/,
  );
  assert.match(
    String(preparePoogieLuck(fakeEboot({ pickers: 2 }), editsFor(fakeEboot()).edits)),
    /doesn't match/,
  );
  const noRewards = fakeEboot();
  noRewards.fill(0, CODE + QUEST_REWARDS - VADDR, CODE + QUEST_REWARDS - VADDR + 8);
  assert.match(String(preparePoogieLuck(noRewards, editsFor(noRewards).edits)), /doesn't match/);
});

test("hook 5 points the picker's first two words at its stub", () => {
  const eboot = Buffer.alloc(16, 0xaa);
  const segment: Segment = { offset: 4, vaddr: 0x08804400, size: 12 };
  writePickHook(eboot, segment, { picker: 0x08804400, prologue: [0, 0] }, 0x08901d00);
  assert.equal(eboot.readUInt32LE(4), 0x08000000 | (0x08901d00 >>> 2));
  assert.equal(eboot.readUInt32LE(8), 0, "a nop in the delay slot");
  assert.equal(eboot.readUInt32LE(0), 0xaaaaaaaa);
  assert.equal(eboot.readUInt32LE(12), 0xaaaaaaaa);
});

/*
 * The blob in the test CPU: the game's picker (a stand-in that returns
 * GAME_PICK), its first words pointed at hook 5's stub, the RNG answered from
 * `rolls`, and the save struct with its flags and randomfu's save data.
 */
const BLOB = 0x099a1820;
const SAVE_STRUCT = 0x09999c60;
const SAVE_VAR = 0x089cc438;
const RNG_STATE = 0x08a70000;
const GAME_PICKER = 0x08804400;
const PICK_STUB = 0x08901d00;
const WALK = 0x08805000;
const LIST = 0x09100000;
const LIST_HEADER = 0x09100400;
const QTY = 0x09100800;
const GAME_PICK = 0x1234;
/** The stand-in: the game's prologue, then `lw $ra; li $v0, GAME_PICK; jr $ra; addiu $sp`. */
const GAME_PICKER_CODE = [
  0x27bdffe0,
  0xafbf0018,
  0x8fbf0018,
  0x34020000 | GAME_PICK,
  0x03e00008,
  0x27bd0020,
];
const HAPPY_FLAG = 0x1ac;
const TUMBLE_FLAG = 0x1ab;
const DATA = SAVE_STRUCT + SAVE_DATA;
const MAGIC = 0x31534652;

function machine(options: { objects?: "runtime" | "poogie" | "none"; testRolls?: number } = {}) {
  const cpu = new Cpu();
  const objects = options.objects ?? "poogie";
  const blob = linkBlob(
    [...decodeObjects(RUNTIME_OBJECTS), ...(objects === "poogie" ? poogieObjects() : [])],
    BLOB,
    { rf_pick_rand: RNG, rf_pick_rng: RNG_CONTEXT, rf_poogie_test_rolls: options.testRolls ?? 1 },
  );
  const site: PickSite = {
    picker: GAME_PICKER,
    prologue: [GAME_PICKER_CODE[0]!, GAME_PICKER_CODE[1]!],
  };
  cpu.load(GAME_PICKER, GAME_PICKER_CODE);
  const patched = Buffer.from(Uint32Array.from(GAME_PICKER_CODE).buffer);
  writePickHook(patched, { offset: 0, vaddr: GAME_PICKER, size: patched.length }, site, PICK_STUB);
  cpu.write(GAME_PICKER, patched);
  cpu.load(PICK_STUB, assemblePickHook(PICK_STUB, BLOB, site));
  cpu.setU32(SAVE_VAR, SAVE_STRUCT);
  cpu.setU32(RNG_CONTEXT, RNG_STATE);

  let rolls: readonly number[] = [0];
  let rngCalls = 0;
  cpu.native.set(RNG, (c) => {
    assert.equal(c.reg[4]! >>> 0, RNG_STATE);
    assert.equal(c.reg[5], 0);
    return rolls[rngCalls++ % rolls.length]!;
  });
  const setFlag = (flag: number, on: boolean) => {
    const at = SAVE_STRUCT + 0x508 + (flag >> 4) * 2;
    const bit = 1 << (flag & 15);
    cpu.setU16(at, on ? cpu.u16(at) | bit : cpu.u16(at) & ~bit);
  };
  const init = (reason = 0) => {
    if (objects !== "none") {
      cpu.write(BLOB, blob.image);
      cpu.call(blob.symbols.get("rf_init")!, [reason, SAVE_STRUCT, BLOB]);
    }
  };
  /** One frame of the pad hook. */
  const frame = () => cpu.call(blob.symbols.get(`rf_hook${HOOK.pad}`)!, [0x08a62c00]);
  const happy = () => cpu.u16(DATA + 8);
  const setHappy = (n: number) => cpu.setU16(DATA + 8, n);

  /** Calls the game's picker on `entries`: `(chance, item)` or `(chance, item, quantity)`. */
  const pick = (
    entries: readonly (readonly number[])[],
    options: { rolls?: readonly number[]; quantity?: boolean } = {},
  ) => {
    rolls = options.rolls ?? [0];
    rngCalls = 0;
    [...entries.flat(), 0xffff].forEach((half, k) => cpu.setU16(LIST + k * 2, half));
    cpu.setU16(QTY, 0xbeef);
    const sp = (cpu.reg[29] = 0x09fff000);
    const item = cpu.call(GAME_PICKER, [LIST, options.quantity ? QTY : 0]);
    assert.equal(cpu.reg[29], sp, "the stack is as it was");
    return { item, quantity: cpu.u16(QTY), rngCalls };
  };

  /**
   * Runs the quest reward walk inline, as in the game's reward roll: `$s3`
   * the list, `$s6` its header, `$s1` the list's slot, `$s2` the box offset.
   */
  const walk = assembleQuestRewardWalk({ save: SAVE_VAR, picker: GAME_PICKER });
  cpu.load(WALK, [
    0x27bdffe0, // addiu $sp, $sp, -32
    0xafbf001c, // sw $ra, 28($sp)
    ...walk,
    ...new Array<number>(QUEST_REWARD_WORDS - walk.length).fill(0),
    0x8fbf001c, // lw $ra, 28($sp)
    0x03e00008, // jr $ra
    0x27bd0020, // addiu $sp, $sp, 32
  ]);
  const reward = (
    entries: readonly (readonly number[])[],
    options: { rolls: readonly number[]; header?: number; slot?: number },
  ) => {
    rolls = options.rolls;
    rngCalls = 0;
    [...entries.flat(), 0xffff].forEach((half, k) => cpu.setU16(LIST + k * 2, half));
    cpu.setU16(LIST_HEADER, options.header ?? 0);
    const box = SAVE_STRUCT + 0x390 + BOX_SLOT * 4;
    cpu.setU32(box, 0xcafecafe); // the slot's old contents
    for (let k = 16; k <= 23; k++) cpu.reg[k] = 0x1000 + k;
    cpu.reg[17] = options.slot ?? 1;
    cpu.reg[18] = BOX_SLOT * 4;
    cpu.reg[19] = LIST;
    cpu.reg[22] = LIST_HEADER;
    cpu.call(WALK);
    return { item: cpu.u16(box), amount: cpu.u16(box + 2), rngCalls, a2: cpu.reg[6]! >>> 0 };
  };
  return { cpu, init, frame, pick, reward, setFlag, happy, setHappy };
}

const A = 0x0101;
const B = 0x0202;
const C = 0x0303;
const D = 0x0404;
const TABLE = [
  [70, A],
  [25, B],
  [5, C],
];
const BOX_SLOT = 3;

test("the picker is the game's until a blob with rf_hook5 is loaded", () => {
  const none = machine({ objects: "none" });
  none.init();
  assert.equal(none.pick(TABLE).item, GAME_PICK, "no blob");
  const runtime = machine({ objects: "runtime" });
  runtime.init();
  assert.equal(runtime.pick(TABLE).item, GAME_PICK, "a blob without rf_hook5");
  const poogie = machine();
  assert.equal(poogie.pick(TABLE).item, GAME_PICK, "before the blob loads");
  poogie.init();
  assert.equal(poogie.pick(TABLE, { rolls: [99] }).item, C);
});

test("without a happy pet, the picker rolls once and walks the chances", () => {
  const m = machine();
  m.init();
  for (const [roll, item] of [
    [0, A],
    [69, A],
    [70, B],
    [94, B],
    [95, C],
    [99, C],
    [1234, A],
    [0xffffffff, C],
  ] as const) {
    const got = m.pick(TABLE, { rolls: [roll] });
    assert.equal(got.item, item, `roll ${roll}`);
    assert.equal(got.rngCalls, 1);
  }
});

test("with a happy pet, it rolls twice and keeps the rarer entry", () => {
  const m = machine();
  m.init();
  m.setFlag(HAPPY_FLAG, true);
  assert.equal(m.pick(TABLE, { rolls: [10, 80] }).item, B);
  assert.equal(m.pick(TABLE, { rolls: [80, 10] }).item, B);
  assert.equal(m.pick(TABLE, { rolls: [96, 80] }).item, C);
  assert.equal(m.pick(TABLE, { rolls: [10, 20] }).item, A);
  assert.equal(m.pick(TABLE, { rolls: [10, 20] }).rngCalls, 2);
  // A tumble is no luck.
  m.setFlag(HAPPY_FLAG, false);
  m.setFlag(TUMBLE_FLAG, true);
  assert.equal(m.pick(TABLE, { rolls: [10, 99] }).rngCalls, 1);
});

test("affection: three rolls from 50 happy hunts, four from 200", () => {
  const m = machine();
  m.init();
  m.setFlag(HAPPY_FLAG, true);
  for (const [happy, rolls] of [
    [0, 2],
    [49, 2],
    [50, 3],
    [199, 3],
    [200, 4],
    [0xffff, 4],
  ] as const) {
    m.setHappy(happy);
    assert.equal(m.pick(TABLE, { rolls: [1, 2, 3, 4, 5] }).rngCalls, rolls, `${happy} happy hunts`);
  }
  m.setHappy(50);
  assert.equal(m.pick(TABLE, { rolls: [10, 20, 97] }).item, C, "the third roll counts");
  m.setHappy(49);
  assert.equal(m.pick(TABLE, { rolls: [10, 20, 97] }).item, A);
});

test("the test build rolls 1025 times when lucky and once when not", () => {
  const m = machine({ testRolls: 1025 });
  m.init();
  assert.equal(m.pick(TABLE, { rolls: [10] }).rngCalls, 1);
  m.setFlag(HAPPY_FLAG, true);
  const sure = m.pick(TABLE, { rolls: Array.from({ length: 100 }, (_, k) => k) });
  assert.equal(sure.rngCalls, 1025);
  assert.equal(sure.item, C);
});

test("with quantities, entries are 6 bytes and the picked entry's quantity is written", () => {
  const m = machine();
  m.init();
  const entries = [
    [60, A, 1],
    [30, B, 2],
    [10, C, 3],
  ];
  assert.deepEqual(m.pick(entries, { rolls: [65], quantity: true }), {
    item: B,
    quantity: 2,
    rngCalls: 1,
  });
  m.setFlag(HAPPY_FLAG, true);
  assert.deepEqual(m.pick(entries, { rolls: [5, 95], quantity: true }), {
    item: C,
    quantity: 3,
    rngCalls: 2,
  });
});

test("an empty or all-zero list gives nothing, quantity 0, and never rolls", () => {
  const m = machine();
  m.init();
  m.setFlag(HAPPY_FLAG, true);
  for (const entries of [
    [],
    [
      [0, A, 1],
      [0, B, 2],
    ],
  ]) {
    assert.deepEqual(m.pick(entries, { quantity: true }), {
      item: 0xffff,
      quantity: 0,
      rngCalls: 0,
    });
  }
  assert.deepEqual(m.pick([]).item, 0xffff);
});

test("zero-chance entries are never picked, lucky or not", () => {
  const m = machine();
  m.init();
  const entries = [
    [0, A],
    [50, B],
    [0, C],
    [50, D],
  ];
  for (const lucky of [false, true]) {
    m.setFlag(HAPPY_FLAG, lucky);
    for (let roll = 0; roll < 100; roll++) {
      const { item } = m.pick(entries, { rolls: [roll, 99 - roll] });
      assert.ok(item === B || item === D, `roll ${roll}: ${item}`);
    }
  }
});

test("each happy pet and tumble counts once, until the hunt clears its flag", () => {
  const m = machine();
  m.init();
  const tumbles = () => m.cpu.u16(DATA + 10);
  m.frame();
  assert.deepEqual([m.happy(), tumbles()], [0, 0]);
  m.setFlag(HAPPY_FLAG, true);
  for (let k = 0; k < 3; k++) m.frame();
  assert.equal(m.happy(), 1, "once while the flag stays set");
  m.setFlag(TUMBLE_FLAG, true);
  m.frame();
  m.frame();
  assert.deepEqual([m.happy(), tumbles()], [1, 1]);
  // The hunt ends: both clear. The next pet counts again.
  m.setFlag(HAPPY_FLAG, false);
  m.setFlag(TUMBLE_FLAG, false);
  m.frame();
  m.setFlag(HAPPY_FLAG, true);
  m.frame();
  assert.deepEqual([m.happy(), tumbles()], [2, 1]);
  // Loading the save again (the blob reloads) doesn't count the set flag twice.
  m.init();
  m.frame();
  assert.equal(m.happy(), 2);
  // The count stops at the top.
  m.setHappy(0xffff);
  m.setFlag(HAPPY_FLAG, false);
  m.frame();
  m.setFlag(HAPPY_FLAG, true);
  m.frame();
  assert.equal(m.happy(), 0xffff);
});

test("randomfu's save data is cleared on first use and kept after", () => {
  const m = machine();
  m.cpu.fill(DATA, 4216, 0xab); // an old Guild Card
  m.cpu.setU32(DATA + 4216, 0x12345678); // past the slot: not ours
  m.init();
  assert.equal(m.cpu.u16(DATA), 0, "an empty Guild Card slot to the game");
  assert.equal(m.cpu.u32(DATA + 4), MAGIC);
  assert.equal(m.cpu.u32(DATA), 0);
  assert.ok(m.cpu.bytes(DATA + 8, 4208).every((b) => b === 0));
  assert.equal(m.cpu.u32(DATA + 4216), 0x12345678);
  m.setHappy(12);
  m.init(1);
  assert.equal(m.happy(), 12, "a reload keeps the count");
});

test("the quest reward walk through the blob picks what the game's would, without a happy pet", () => {
  const m = machine();
  m.init();
  const REWARDS = [
    [50, A, 1],
    [35, B, 2],
    [15, C, 3],
  ];
  for (const [header, slot] of [
    [0, 0],
    [0, 4],
    [0x8000, 0],
    [0x8000, 2],
  ] as const) {
    for (const roll of [0, 49, 50, 84, 85, 99, 1234, 0xff52]) {
      const got = m.reward(REWARDS, { rolls: [roll], header, slot });
      assert.deepEqual(
        [got.item, got.amount],
        vanillaQuestReward(REWARDS, header, slot, roll),
        `header ${header}, slot ${slot}, roll ${roll}`,
      );
      assert.equal(got.rngCalls, 1, "one roll, like the game's");
      assert.equal(got.a2, SAVE_STRUCT + 0x390 + BOX_SLOT * 4, "$a2 left at the slot");
      const inputs: Record<number, number> = {
        17: slot,
        18: BOX_SLOT * 4,
        19: LIST,
        22: LIST_HEADER,
      };
      for (let k = 16; k <= 23; k++)
        assert.equal(m.cpu.reg[k]! >>> 0, inputs[k] ?? 0x1000 + k, `$${k}`);
    }
  }
});

test("with a happy pet, quest rewards keep the rarer entry; a forced first entry stays", () => {
  const m = machine();
  m.init();
  m.setFlag(HAPPY_FLAG, true);
  const REWARDS = [
    [50, A, 1],
    [35, B, 2],
    [15, C, 3],
  ];
  const lucky = (rolls: number[], header = 0, slot = 1) =>
    m.reward(REWARDS, { rolls, header, slot });
  assert.deepEqual([lucky([10, 90]).item, lucky([10, 90]).amount], [C, 3]);
  assert.equal(lucky([60, 10]).item, B);
  assert.equal(lucky([10, 20]).item, A);
  assert.equal(lucky([10, 90]).rngCalls, 2);
  assert.deepEqual([lucky([90, 95], 0x8000, 0).item, lucky([90, 95], 0x8000, 0).amount], [A, 1]);
  assert.equal(lucky([90, 95], 0x8000, 1).item, C);
});

test("the forced first entry skips zero-chance entries, and an item 0 pick clears the slot", () => {
  const m = machine();
  m.init();
  const forced = m.reward(
    [
      [0, B, 2],
      [60, A, 1],
      [40, C, 3],
    ],
    { rolls: [99], header: 0x8000, slot: 0 },
  );
  assert.deepEqual([forced.item, forced.amount], [A, 1]);
  const empty = m.reward(
    [
      [80, 0, 5],
      [20, C, 1],
    ],
    { rolls: [10] },
  );
  assert.deepEqual([empty.item, empty.amount], [0, 0]);
});

test("RF_SAVE_DATA in blob/rf.h is SAVE_DATA", () => {
  const header = readFileSync(new URL("../blob/rf.h", import.meta.url), "utf8");
  assert.equal(Number(/#define RF_SAVE_DATA (0x[0-9A-Fa-f]+)/.exec(header)?.[1]), SAVE_DATA);
});

/** The game's inline quest reward walk, for comparison: (rng & 0xFFFF) % total, forced first slot. */
function vanillaQuestReward(
  entries: readonly (readonly number[])[],
  header: number,
  slot: number,
  roll: number,
): [number, number] {
  const total = entries.reduce((sum, [chance]) => (sum + chance!) & 0xffff, 0);
  const pick = header === 0x8000 && slot === 0 ? 0 : (roll & 0xffff) % total;
  let running = 0;
  for (const [chance, item, amount] of entries) {
    running = (running + chance!) & 0xffff;
    if (pick < running) return [item!, amount!];
  }
  throw new Error("no entry");
}
