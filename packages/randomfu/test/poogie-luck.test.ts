import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edits } from "../src/edits.js";
import {
  FLAG_TEST_SIGNATURE,
  PICKER_SIGNATURE,
  PICKER_WORDS,
  QUEST_REWARD_SIGNATURE,
  QUEST_REWARD_WORDS,
  SAVE_POINTER_SIGNATURE,
  addPoogieLuck,
  assemblePicker,
  assembleQuestRewardWalk,
} from "../src/patches/poogie-luck.js";

const VADDR = 0x08804000;
const CODE = 0x100;
const PICKER = VADDR + 0x400;
const FLAG_TEST = VADDR + 0x800;
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
  put(FLAG_TEST, FLAG_TEST_SIGNATURE);
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

test("the new picker and quest reward walk fit, use the addresses found, and change nothing else", () => {
  const elf = fakeEboot();
  const { edits, copy } = editsFor(elf);
  const report = addPoogieLuck(elf, edits);
  assert.match(report.notes[0]!, /Pet Poogie.*quest rewards/);
  assert.equal(report.summary, "Poogie: on");
  const out = copy()!;

  const picker = assemblePicker({
    save: SAVE,
    flagTest: FLAG_TEST,
    rngContext: RNG_CONTEXT,
    rng: RNG,
  });
  const walk = assembleQuestRewardWalk({ save: SAVE, picker: PICKER });
  for (const [vaddr, room, code] of [
    [PICKER, PICKER_WORDS, picker],
    [QUEST_REWARDS, QUEST_REWARD_WORDS, walk],
  ] as const) {
    assert.ok(code.length <= room);
    const written = words(out, vaddr, room);
    assert.deepEqual(written.slice(0, code.length), code);
    assert.ok(written.slice(code.length).every((w) => w === 0));
  }
  const jals = (code: readonly number[]) =>
    code.filter((w) => w >>> 26 === 0x03).map((w) => ((w & 0x03ffffff) << 2) | 0x08000000);
  assert.deepEqual(jals(picker), [FLAG_TEST, RNG]);
  assert.deepEqual(jals(walk), [PICKER]);
  assert.equal(picker[picker.length - 2], 0x03e00008); // jr $ra, then the delay slot
  // The game's code after the walk still reads the pick through $a2.
  assert.equal(words(out, QUEST_REWARDS + QUEST_REWARD_WORDS * 4, 1)[0], 0x94c40000);

  // Nothing outside the two patched spans changes.
  for (const [vaddr, room] of [
    [PICKER, PICKER_WORDS],
    [QUEST_REWARDS, QUEST_REWARD_WORDS],
  ]) {
    const start = CODE + vaddr! - VADDR;
    out.fill(0, start, start + room! * 4);
    elf.fill(0, start, start + room! * 4);
  }
  assert.ok(out.equals(elf));
});

test("the guaranteed test picker fits too and only changes how many times it rolls", () => {
  const addresses = { save: SAVE, flagTest: FLAG_TEST, rngContext: RNG_CONTEXT, rng: RNG };
  const normal = assemblePicker(addresses);
  const guaranteed = assemblePicker(addresses, { guaranteed: true });
  assert.ok(guaranteed.length <= PICKER_WORDS);
  assert.equal(guaranteed.length, normal.length + 1);
  const elf = fakeEboot();
  const { edits, copy } = editsFor(elf);
  const report = addPoogieLuck(elf, edits, { guaranteed: true });
  assert.match(report.summary!, /test build/);
  assert.match(report.notes.join(" "), /Not for play/);
  assert.equal(words(copy()!, PICKER, guaranteed.length).at(-1), guaranteed.at(-1));
});

test("nothing is patched when a signature is missing or ambiguous, and the report says so", () => {
  const missing = fakeEboot({ pickers: 0 });
  const none = editsFor(missing);
  assert.match(addPoogieLuck(missing, none.edits).summary!, /not applied/);
  assert.equal(none.copy(), null);
  const twice = fakeEboot({ pickers: 2 });
  const { edits, copy } = editsFor(twice);
  assert.match(addPoogieLuck(twice, edits).summary!, /not applied/);
  assert.equal(copy(), null);
  const noRewards = fakeEboot();
  noRewards.fill(0, CODE + QUEST_REWARDS - VADDR, CODE + QUEST_REWARDS - VADDR + 8);
  assert.match(addPoogieLuck(noRewards, editsFor(noRewards).edits).summary!, /not applied/);
  assert.match(addPoogieLuck(null, edits).notes[0]!, /isn't in this image/);
});

/*
 * Running the assembled code: an interpreter for the few Allegrex opcodes
 * it uses, with delay slots and branch-likely. `jal` to the flag test or the
 * RNG is answered by a stub, and to the picker runs it; memory is one small
 * buffer at `MEMORY`.
 */
const MEMORY = 0x09000000;
const SAVE_VAR = MEMORY + 0x100;
const RNG_VAR = MEMORY + 0x104;
const LIST = MEMORY + 0x200;
const LIST_HEADER = MEMORY + 0x300;
const SAVE_STRUCT = MEMORY + 0x400;
const QTY = MEMORY + 0x800;
const STACK = MEMORY + 0xf00;
const RNG_STATE = 0x1234;
const PICKER_AT = 0x08804000;
const WALK_AT = 0x08805000;
const STUB_FLAG = 0x08900000;
const STUB_RNG = 0x08900100;
const RETURN_TO = 0x08a00000;
const STUBS = { save: SAVE_VAR, flagTest: STUB_FLAG, rngContext: RNG_VAR, rng: STUB_RNG };

/** A branch, jump or call: where to, whether it's taken, and its kind. */
interface Transfer {
  taken: boolean;
  target: number;
  likely: boolean;
  call: boolean;
}

interface Machine {
  r: number[];
  mem: Buffer;
  at: (address: number) => number;
  rngCalls: number;
}

/** Runs from `entry` until `pc` reaches `exit`. */
function run(
  programs: readonly { at: number; code: readonly number[] }[],
  entry: number,
  exit: number,
  options: { lucky: boolean; rolls: readonly number[] },
  setup: (m: Machine) => void,
): Machine {
  const mem = Buffer.alloc(0x1000);
  const at = (address: number) => {
    const offset = (address >>> 0) - MEMORY;
    if (offset < 0 || offset >= mem.length)
      throw new Error(`Bad address 0x${address.toString(16)}`);
    return offset;
  };
  const r = new Array<number>(32).fill(0);
  for (let k = 16; k <= 23; k++) r[k] = 0x1000 + k; // callee-saved
  r[29] = STACK;
  r[31] = RETURN_TO;
  const m: Machine = { r, mem, at, rngCalls: 0 };
  mem.writeUInt32LE(SAVE_STRUCT, at(SAVE_VAR));
  mem.writeUInt32LE(RNG_STATE, at(RNG_VAR));
  setup(m);

  let hiReg = 0;
  const signed = (v: number) => (v << 16) >> 16;
  const set = (reg: number, value: number) => {
    if (reg !== 0) r[reg] = value >>> 0;
  };
  const fetch = (pc: number) => {
    for (const p of programs) {
      const w = p.code[(pc - p.at) / 4];
      if (pc >= p.at && w !== undefined) return w;
    }
    throw new Error(`pc 0x${pc.toString(16)} is outside the code`);
  };

  /** Runs one instruction; returns the transfer for branches, jumps and calls. */
  const exec = (pc: number): Transfer | null => {
    const w = fetch(pc);
    const op = w >>> 26;
    const rs = (w >>> 21) & 31;
    const rt = (w >>> 16) & 31;
    const rd = (w >>> 11) & 31;
    const imm = w & 0xffff;
    const branch = (taken: boolean, likely = false): Transfer => ({
      taken,
      target: pc + 4 + signed(imm) * 4,
      likely,
      call: false,
    });
    switch (op) {
      case 0x00: {
        const funct = w & 0x3f;
        if (funct === 0x08) return { taken: true, target: r[rs]!, likely: false, call: false };
        if (funct === 0x00) set(rd, r[rt]! << ((w >>> 6) & 31));
        else if (funct === 0x10) set(rd, hiReg);
        else if (funct === 0x1b) hiReg = r[rs]! % r[rt]!;
        else if (funct === 0x21) set(rd, r[rs]! + r[rt]!);
        else if (funct === 0x23) set(rd, r[rs]! - r[rt]!);
        else if (funct === 0x2b) set(rd, r[rs]! < r[rt]! ? 1 : 0);
        else throw new Error(`funct 0x${funct.toString(16)}`);
        return null;
      }
      case 0x01:
        assert.equal(rt, 1, "only bgez");
        return branch((r[rs]! | 0) >= 0);
      case 0x03:
        return {
          taken: true,
          target: (((w & 0x03ffffff) << 2) | (pc & 0xf0000000)) >>> 0,
          likely: false,
          call: true,
        };
      case 0x04:
        return branch(r[rs] === r[rt]);
      case 0x05:
        return branch(r[rs] !== r[rt]);
      case 0x14:
        return branch(r[rs] === r[rt], true);
      case 0x15:
        return branch(r[rs] !== r[rt], true);
      case 0x09:
        set(rt, r[rs]! + signed(imm));
        return null;
      case 0x0d:
        set(rt, r[rs]! | imm);
        return null;
      case 0x0f:
        set(rt, imm << 16);
        return null;
      case 0x23:
        set(rt, mem.readUInt32LE(at(r[rs]! + signed(imm))));
        return null;
      case 0x25:
        set(rt, mem.readUInt16LE(at(r[rs]! + signed(imm))));
        return null;
      case 0x29:
        mem.writeUInt16LE(r[rt]! & 0xffff, at(r[rs]! + signed(imm)));
        return null;
      case 0x2b:
        mem.writeUInt32LE(r[rt]!, at(r[rs]! + signed(imm)));
        return null;
      default:
        throw new Error(`op 0x${op.toString(16)}`);
    }
  };

  let pc = entry;
  for (let steps = 0; steps < 1_000_000; steps++) {
    if (pc === exit) return m;
    const transfer = exec(pc);
    if (!transfer) {
      pc += 4;
      continue;
    }
    if (transfer.likely && !transfer.taken) {
      pc += 8; // a branch-likely that isn't taken skips its delay slot
      continue;
    }
    if (exec(pc + 4)) throw new Error("A branch in a delay slot");
    if (!transfer.call) {
      pc = transfer.taken ? transfer.target : pc + 8;
      continue;
    }
    if (transfer.target !== STUB_FLAG && transfer.target !== STUB_RNG) {
      r[31] = pc + 8; // a real call
      pc = transfer.target;
      continue;
    }
    // The stubs return straight away.
    if (transfer.target === STUB_FLAG) {
      assert.equal(r[4], SAVE_STRUCT);
      assert.equal(r[5], 0x1ac);
      r[2] = options.lucky ? 1 : 0;
    } else {
      assert.equal(r[4], RNG_STATE);
      r[2] = options.rolls[m.rngCalls % options.rolls.length]!;
      m.rngCalls++;
    }
    // A call may clobber the temporaries.
    for (const k of [3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 24, 25]) r[k] = 0xdead0000 + k;
    pc += 8;
  }
  throw new Error("The code didn't finish");
}

function writeList(m: Machine, address: number, entries: readonly (readonly number[])[]): void {
  [...entries.flat(), 0xffff].forEach((half, k) =>
    m.mem.writeUInt16LE(half, m.at(address + k * 2)),
  );
}

interface PickRun {
  item: number;
  quantity: number;
  rngCalls: number;
  regs: number[];
}

function runPicker(
  code: readonly number[],
  entries: readonly (readonly number[])[],
  options: { lucky: boolean; rolls: readonly number[]; quantity?: boolean },
): PickRun {
  const m = run([{ at: PICKER_AT, code }], PICKER_AT, RETURN_TO, options, (m) => {
    writeList(m, LIST, entries);
    m.mem.writeUInt16LE(0xbeef, m.at(QTY));
    m.r[4] = LIST;
    m.r[5] = options.quantity ? QTY : 0;
  });
  return {
    item: m.r[2]!,
    quantity: m.mem.readUInt16LE(m.at(QTY)),
    rngCalls: m.rngCalls,
    regs: m.r,
  };
}

const A = 0x0101;
const B = 0x0202;
const C = 0x0303;
const TABLE = [
  [70, A],
  [25, B],
  [5, C],
];
const normal = assemblePicker(STUBS);
const guaranteed = assemblePicker(STUBS, { guaranteed: true });

test("without a happy pet, the picker rolls once and walks the chances", () => {
  const cases: [number, number][] = [
    [0, A],
    [69, A],
    [70, B],
    [94, B],
    [95, C],
    [99, C],
    [172, B],
  ];
  for (const [roll, item] of cases) {
    const run = runPicker(normal, TABLE, { lucky: false, rolls: [roll] });
    assert.equal(run.item, item, `roll ${roll}`);
    assert.equal(run.rngCalls, 1);
  }
});

test("with a happy pet, it rolls twice and keeps the rarer entry", () => {
  const cases: [number[], number][] = [
    [[10, 96], C],
    [[96, 10], C],
    [[80, 10], B],
    [[10, 20], A],
    [[71, 72], B],
  ];
  for (const [rolls, item] of cases) {
    const run = runPicker(normal, TABLE, { lucky: true, rolls });
    assert.equal(run.item, item, `rolls ${rolls.join(", ")}`);
    assert.equal(run.rngCalls, 2);
  }
});

test("the test build rolls 1025 times when lucky and once when not", () => {
  const rolls = Array.from({ length: 100 }, (_, k) => k);
  const lucky = runPicker(guaranteed, TABLE, { lucky: true, rolls });
  assert.equal(lucky.item, C);
  assert.equal(lucky.rngCalls, 1025);
  const plain = runPicker(guaranteed, TABLE, { lucky: false, rolls: [0] });
  assert.equal(plain.item, A);
  assert.equal(plain.rngCalls, 1);
});

test("with quantities, entries are 6 bytes and the picked entry's quantity is written", () => {
  const table = [
    [60, A, 1],
    [30, B, 2],
    [10, C, 3],
  ];
  const cases: [number, number, number][] = [
    [0, A, 1],
    [65, B, 2],
    [95, C, 3],
  ];
  for (const [roll, item, quantity] of cases) {
    const run = runPicker(normal, table, { lucky: false, rolls: [roll], quantity: true });
    assert.deepEqual([run.item, run.quantity], [item, quantity]);
  }
  const lucky = runPicker(normal, table, { lucky: true, rolls: [0, 95], quantity: true });
  assert.deepEqual([lucky.item, lucky.quantity], [C, 3]);
});

test("an empty or all-zero list gives nothing, quantity 0, and never rolls", () => {
  for (const entries of [[], [[0, A]]]) {
    for (const lucky of [false, true]) {
      const plain = runPicker(normal, entries, { lucky, rolls: [0] });
      assert.equal(plain.item, 0xffff);
      assert.equal(plain.quantity, 0xbeef, "no quantity pointer, so nothing is written");
      assert.equal(plain.rngCalls, 0);
      const withQuantity = runPicker(
        normal,
        entries.map((e) => [...e, 9]),
        { lucky, rolls: [0], quantity: true },
      );
      assert.deepEqual([withQuantity.item, withQuantity.quantity], [0xffff, 0]);
    }
  }
});

test("zero-chance entries are never picked, and the saved registers come back", () => {
  const table = [
    [0, B],
    [50, A],
    [0, B],
    [50, C],
  ];
  const cases: [number, number][] = [
    [0, A],
    [49, A],
    [50, C],
    [99, C],
  ];
  for (const [roll, item] of cases) {
    const run = runPicker(normal, table, { lucky: true, rolls: [roll, roll] });
    assert.equal(run.item, item);
    for (let k = 16; k <= 23; k++) assert.equal(run.regs[k], 0x1000 + k, `$${k}`);
    assert.equal(run.regs[29], STACK);
  }
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

const BOX_SLOT = 3;
const walk = assembleQuestRewardWalk({ save: SAVE_VAR, picker: PICKER_AT });
const walkGuaranteed = { picker: guaranteed, walk };

/** Runs the reward walk (calling the real picker); returns what's in the reward box slot. */
function runQuestReward(
  entries: readonly (readonly number[])[],
  options: {
    lucky: boolean;
    rolls: readonly number[];
    header?: number;
    slot?: number;
    picker?: readonly number[];
  },
): { item: number; amount: number; rngCalls: number; a2: number; regs: number[] } {
  const box = SAVE_STRUCT + 0x390 + BOX_SLOT * 4;
  const m = run(
    [
      { at: PICKER_AT, code: options.picker ?? normal },
      {
        at: WALK_AT,
        code: [...walk, ...new Array<number>(QUEST_REWARD_WORDS - walk.length).fill(0)],
      },
    ],
    WALK_AT,
    WALK_AT + QUEST_REWARD_WORDS * 4,
    options,
    (m) => {
      writeList(m, LIST, entries);
      m.mem.writeUInt16LE(options.header ?? 0, m.at(LIST_HEADER));
      m.mem.writeUInt32LE(0xcafecafe, m.at(box)); // the slot's old contents
      m.r[17] = options.slot ?? 1; // $s1: slot of the list
      m.r[18] = BOX_SLOT * 4; // $s2: reward box offset
      m.r[19] = LIST; // $s3
      m.r[22] = LIST_HEADER; // $s6
    },
  );
  return {
    item: m.mem.readUInt16LE(m.at(box)),
    amount: m.mem.readUInt16LE(m.at(box + 2)),
    rngCalls: m.rngCalls,
    a2: m.r[6]!,
    regs: m.r,
  };
}

const REWARDS = [
  [50, A, 1],
  [35, B, 2],
  [15, C, 3],
];

test("the quest reward walk fits and picks what the game's would, without a happy pet", () => {
  assert.ok(walk.length <= QUEST_REWARD_WORDS);
  for (const [header, slot] of [
    [0, 0],
    [0, 4],
    [0x8000, 0],
    [0x8000, 2],
  ]) {
    for (const roll of [0, 49, 50, 84, 85, 99, 1234, 0xff52]) {
      const got = runQuestReward(REWARDS, { lucky: false, rolls: [roll], header, slot });
      const expected = vanillaQuestReward(REWARDS, header!, slot!, roll);
      assert.deepEqual(
        [got.item, got.amount],
        expected,
        `header ${header}, slot ${slot}, roll ${roll}`,
      );
      assert.equal(got.rngCalls, 1, "one roll, like the game's");
      assert.equal(got.a2, SAVE_STRUCT + 0x390 + BOX_SLOT * 4, "$a2 left at the slot");
      const inputs: Record<number, number> = {
        17: slot!,
        18: BOX_SLOT * 4,
        19: LIST,
        22: LIST_HEADER,
      };
      for (let k = 16; k <= 23; k++) assert.equal(got.regs[k], inputs[k] ?? 0x1000 + k, `$${k}`);
    }
  }
});

test("with a happy pet, quest rewards roll twice and keep the rarer entry; a forced first entry stays", () => {
  const lucky = (rolls: number[], header = 0, slot = 1) =>
    runQuestReward(REWARDS, { lucky: true, rolls, header, slot });
  assert.deepEqual([lucky([10, 90]).item, lucky([10, 90]).amount], [C, 3]);
  assert.equal(lucky([60, 10]).item, B);
  assert.equal(lucky([10, 20]).item, A);
  assert.equal(lucky([10, 90]).rngCalls, 2);
  // The 0x8000 list's first slot is always its first entry, lucky or not.
  assert.deepEqual([lucky([90, 95], 0x8000, 0).item, lucky([90, 95], 0x8000, 0).amount], [A, 1]);
  assert.equal(lucky([90, 95], 0x8000, 1).item, C);
  const sure = runQuestReward(REWARDS, {
    lucky: true,
    rolls: Array.from({ length: 100 }, (_, k) => k),
    picker: walkGuaranteed.picker,
  });
  assert.equal(sure.item, C);
});

test("the forced first entry skips zero-chance entries, and an item 0 pick clears the slot", () => {
  const leadingZero = [
    [0, B, 2],
    [60, A, 1],
    [40, C, 3],
  ];
  const forced = runQuestReward(leadingZero, {
    lucky: false,
    rolls: [99],
    header: 0x8000,
    slot: 0,
  });
  assert.deepEqual([forced.item, forced.amount], [A, 1]);
  const nothing = [
    [80, 0, 5],
    [20, C, 1],
  ];
  const empty = runQuestReward(nothing, { lucky: false, rolls: [10] });
  assert.deepEqual([empty.item, empty.amount], [0, 0]);
});
