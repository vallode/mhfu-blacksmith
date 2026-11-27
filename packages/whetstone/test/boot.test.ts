import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOvl } from "mhfu-extract/src/container/ovl.js";
import type { LoadedOverlay } from "../src/game/load.js";
import {
  APPLY_WORDS,
  AUTOLOADED,
  AUTOLOAD_WORDS,
  END_TO_TITLE,
  HANDLER_WORDS,
  Padding,
  QUICK_LIST,
  SHOWN,
  SHOW_WORDS,
  TITLE_CURSOR,
  TITLE_FIRST,
  applyWords,
  autoloadWords,
  bootReport,
  fadeWords,
  findContTask,
  findDemoTask,
  findSavePointer,
  handlerWords,
  patchBoot,
  pollWords,
  showWords,
} from "../src/patches/boot.js";
import { Cpu } from "./mips-cpu.js";

/** EU's addresses: the task overlays' base, and what's in them. */
const BASE = 0x09a5f200;
const LOAD_STEP_AT = 0x09a5f720;
const AUTOLOAD_CALL = LOAD_STEP_AT + 15 * 4;
const AUTOLOAD = 0x088be550;
const TABLE = 0x09a61b80;
const NEXT = TABLE + 0x30;
const PRESS_START = 0x09a60258;
const LANGUAGE_FADE = 0x09a60754;
const LANGUAGE_CONFIRM = 0x09a60898;
const LANGUAGE_FADE_OUT = LANGUAGE_CONFIRM + 0x3c;
const DEMO_END = 0x09a62000;
const APPLY_AT = LOAD_STEP_AT + 0x94;
const APPLY = 0x088572e8;
const POST_LOAD_AT = 0x09a5f5a0;
const POST_LOAD = 0x08856c34;
const POLL_CALL_AT = 0x09a5f430;
const POLL = 0x088bc7f0;
const CONT_FADE_AT = 0x09a5f33c;
const FADE = 0x0884d790;
const FADE_POINTER = 0x089cc01c;
const CONT_HANDLER = 0x09a5fc00;
const SAVE_POINTER = 0x089cc438;
const STUB = 0x0887f690;
const EU_PAD = 0x08a62c6c;
const JP_PAD = 0x08a5dd3c;
const JR_RA = 0x03e00008;

type Words = [number, readonly number[]][];

function overlay(name: string, size: number, words: Words, end = BASE + size): Buffer {
  const buf = Buffer.alloc(size);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(BASE, 8);
  buf.writeUInt32LE(end, 0x1c);
  buf.write(name, 0x20, "latin1");
  for (const [at, list] of words)
    list.forEach((w, k) => buf.writeUInt32LE(w >>> 0, at - BASE + k * 4));
  return buf;
}

const hi = (v: number) => ((v + 0x8000) >>> 16) & 0xffff;
const lo = (v: number) => v & 0xffff;
const jal = (target: number) => ((0x03 << 26) | ((target >>> 2) & 0x03ffffff)) >>> 0;
const handler = (f: number) => [0, 0xffffffff, f, 0];

/** A demo_task in EU's layout; `confirm` is × (EU) or ○ (JP), and JP has no language choice. */
function demoTask({ confirm = 0x4000, pad = EU_PAD, language = true } = {}): Buffer {
  const handlers = [0x09a5f420, 0x09a5f670, PRESS_START, 0x09a5f860, 0x09a5fb10, PRESS_START];
  const languageWords: Words = [
    [
      LANGUAGE_FADE,
      [
        0x3c02089d,
        0x8c44c434,
        0x8c990000,
        0x8f390038,
        0x0320f809,
        0,
        0x1440009b,
        0,
        0x3c02089d,
        0x8c44c01c,
        0x24050010,
        jal(FADE),
        0x00003021,
      ],
    ],
    [
      LANGUAGE_CONFIRM,
      [
        0x8c630000 | lo(pad),
        0x30630008 | confirm,
        0x1060004e,
        0,
        0xafa00000,
        0x3c0208a6,
        0x8c442d8c,
        0x00002821,
        0x24060001,
      ],
    ],
    [LANGUAGE_FADE_OUT, [0x3c02089d, 0x8c44c01c, 0x24050010, jal(FADE), 0x24060001]],
  ];
  return overlay("demo_task.ovl", DEMO_END - BASE, [
    [
      LOAD_STEP_AT,
      [
        0x3c0209a1,
        0x8c44b540,
        0x24050018,
        0x3c020016,
        0x0e2261a5,
        0x3446a100,
        0x00403021,
        0x3c0209a4,
        0x8c444c60,
        0x0e22e9d8,
        0x00002821,
        0x8e22001c,
        0x24420001,
        0xae22001c,
        0x3c0209a4,
        jal(AUTOLOAD),
        0x8c444c60,
      ],
    ],
    // ... after a load it applies the options: bne; sw; lui; jal apply; lw $a0, save
    [APPLY_AT, [0x16030024, 0xae24001c, 0x3c02089d, jal(APPLY), 0x8c44c438]],
    // ... its last state loads the next handler: lui $v0, hi; lwc1 $f1, lo($v0)
    [LOAD_STEP_AT + 0xdc, [0x3c020000 | hi(NEXT), 0xc4410000 | lo(NEXT)]],
    // A function ends, then 6 words of padding up to the table.
    [TABLE - 0x20, [JR_RA, 0x27bd0030]],
    [TABLE, handlers.flatMap(handler)],
    [PRESS_START, [0x27bdffc0]],
    [PRESS_START + 0xb0, [0x284201e0]],
    [0x09a60578, END_TO_TITLE],
    // lui $v0, hi(pad); lw $v0, lo(pad)($v0); andi $v0, $v0, confirm | START
    [0x09a5fd48, [0x3c020000 | hi(pad), 0x8c420000 | lo(pad), 0x30420008 | confirm]],
    ...(language ? languageWords : []),
  ]);
}

function contTask({ room = true } = {}): Buffer {
  // Its image ends at 0x09A5FD00, past the jump table and 23 words of padding.
  return overlay(
    "cont_task.ovl",
    0x1000,
    [
      [CONT_FADE_AT, [0x3c02089d, 0x8c44c01c, 0x24050010, jal(FADE), 0x00003021]],
      [POLL_CALL_AT, [0x3c0209a4, jal(POLL), 0x8c444c60, 0x24060001, 0x5446000b, 0x24030002]],
      // ... and once loaded, fades out.
      [
        POLL_CALL_AT + 0x18,
        [0x8e03001c, 0x3c02089d, 0x24630001, 0xae03001c, 0x8c44c01c, jal(FADE), 0x24050010],
      ],
      [
        POST_LOAD_AT,
        [
          0x3c0208a6,
          0x8c442d8c,
          jal(0x08880760),
          0x8065add9,
          0x3c02089d,
          jal(POST_LOAD),
          0x8c44c438,
        ],
      ],
      // A function's end and 9 words of padding, as EU's.
      [0x09a5fa54, [JR_RA, 0x27bd0010]],
      [0x09a5fa80, [2, 0x2800]],
      [CONT_HANDLER, handler(0x09a5f8b0)],
      [CONT_HANDLER + 0x40, [room ? 0 : 1]],
      [
        0x09a5fc80,
        [0x09a5f2fc, 0x09a5f388, 0x09a5f430, 0x09a5f4d4, 0x09a5f548, 0x09a5f7ac, 0x09a5f7f4],
      ],
    ],
    0x09a5fd00,
  );
}

const VADDR = 0x08804000;
function eboot(): Buffer {
  const size = 0x80000;
  const elf = Buffer.alloc(0x100 + size);
  elf.writeUInt32LE(0x464c457f, 0);
  elf.writeUInt32LE(0x34, 0x1c);
  elf.writeUInt16LE(1, 0x2c);
  elf.writeUInt32LE(1, 0x34);
  elf.writeUInt32LE(0x100, 0x38);
  elf.writeUInt32LE(VADDR, 0x3c);
  elf.writeUInt32LE(size, 0x44);
  const stub = [
    0x3c02089d, 0x8c43c438, 0x90620494, 0x10400009, 0, 0x3c0209a4, 0x8c424c60, 0x904209a2,
  ];
  stub.forEach((w, k) => elf.writeUInt32LE(w, 0x100 + STUB - VADDR + k * 4));
  return elf;
}

const loaded = (buf: Buffer, index: number): LoadedOverlay => ({ index, ovl: parseOvl(buf) });
function edits() {
  const files = new Map<number, Buffer>();
  return {
    files,
    overlay: (o: LoadedOverlay) => {
      if (!files.has(o.index)) files.set(o.index, Buffer.from(o.ovl.reader.buf));
      return files.get(o.index)!;
    },
  };
}
const wordAt = (buf: Buffer, vaddr: number) => buf.readUInt32LE(vaddr - BASE);
const changed = (before: Buffer, after: Buffer) => {
  const out: number[] = [];
  for (let k = 0; k < before.length; k += 4)
    if (before.readUInt32LE(k) !== after.readUInt32LE(k)) out.push(BASE + k);
  return out;
};

/** Where the new code goes in the fixtures: the first padding with room. */
const LOAD_ENTRY = TABLE + 0x10;
const AUTO_CAVE = TABLE + 0x60;
const HANDLER_AT = AUTO_CAVE + AUTOLOAD_WORDS * 4;
const FADE_CAVE = 0x09a5fa5c;
const POLL_CAVE = CONT_HANDLER + 0x10;
const SHOW_CAVE = 0x09a5fca0;
const APPLY_CAVE = SHOW_CAVE + SHOW_WORDS * 4;

test("the title screens are found in EU's layout, with its pad and confirm", () => {
  assert.deepEqual(findDemoTask(demoTask()), {
    next: NEXT,
    pressStart: PRESS_START,
    loadEntry: LOAD_ENTRY,
    applyOptions: APPLY,
    autoloadCall: AUTOLOAD_CALL,
    autoload: AUTOLOAD,
    pad: EU_PAD,
    confirm: 0x4000,
    language: {
      fadeIn: LANGUAGE_FADE + 11 * 4,
      wait: LANGUAGE_CONFIRM + 2 * 4,
      fadeOut: LANGUAGE_FADE_OUT + 12,
    },
  });
  assert.deepEqual(findContTask(contTask()), {
    call: POLL_CALL_AT + 4,
    poll: POLL,
    loadedCall: POLL_CALL_AT + 0x18 + 20,
    postLoadCall: POST_LOAD_AT + 20,
    postLoad: POST_LOAD,
    fadeCall: CONT_FADE_AT + 12,
    fade: FADE,
    fadePointer: FADE_POINTER,
  });
  assert.equal(findSavePointer(eboot()), SAVE_POINTER);
  // JP confirms with ○, keeps its pad elsewhere and has no language choice.
  const jp = findDemoTask(demoTask({ confirm: 0x2000, pad: JP_PAD, language: false }));
  assert.ok(typeof jp !== "string");
  assert.equal(jp.pad, JP_PAD);
  assert.equal(jp.confirm, 0x2000);
  assert.equal(jp.language, null);
});

test("padding is zeros after a function or a pointer into the code, a word kept clear after", () => {
  const demo = new Padding(demoTask());
  // After the function before the table: 5 words, then one kept clear before the table.
  assert.equal(demo.take(6), AUTO_CAVE);
  assert.equal(demo.take(5), TABLE - 0x18);
  const cont = new Padding(contTask());
  assert.equal(cont.take(9), POLL_CAVE);
  assert.equal(cont.take(8), FADE_CAVE);
  assert.equal(cont.take(23), SHOW_CAVE);
  assert.equal(cont.take(1), POLL_CAVE + 0x24);
  assert.equal(new Padding(contTask({ room: false })).take(24), null);
});

test("no room or no match leaves the overlays alone", () => {
  const e = edits();
  const blank = overlay("demo_task.ovl", 0x3000, []);
  const why = patchBoot("title", loaded(blank, 1), loaded(contTask(), 2), eboot(), e);
  assert.ok(typeof why === "string" && why.startsWith("demo_task.ovl: "));
  const cramped = patchBoot(
    "village",
    loaded(demoTask(), 1),
    loaded(contTask({ room: false }), 2),
    eboot(),
    e,
  );
  assert.equal(cramped, "cont_task.ovl: it has no room");
  assert.equal(e.files.size, 0);
  assert.match(
    bootReport("title", loaded(blank, 1), loaded(contTask(), 2), why, "eu").summary ?? "",
    /not applied/,
  );
});

test("title: the load step goes on to Press START; the language choice and autoload wait go", () => {
  const e = edits();
  const vanilla = demoTask();
  assert.deepEqual(patchBoot("title", loaded(vanilla, 1), loaded(contTask(), 2), eboot(), e), {
    language: true,
  });
  const demo = e.files.get(1)!;
  assert.equal(wordAt(demo, NEXT + 8), PRESS_START);
  assert.equal(wordAt(demo, LANGUAGE_FADE + 11 * 4), 0);
  assert.equal(wordAt(demo, LANGUAGE_CONFIRM + 2 * 4), 0);
  assert.equal(wordAt(demo, LANGUAGE_FADE_OUT + 12), 0);
  assert.equal(wordAt(demo, AUTOLOAD_CALL), jal(AUTO_CAVE));
  assert.equal(e.files.has(2), false);
  const cave = autoloadWords(AUTO_CAVE, AUTOLOAD, EU_PAD, 0x4000);
  assert.equal(cave.length, AUTOLOAD_WORDS);
  const expected = [
    AUTOLOAD_CALL,
    LANGUAGE_FADE + 11 * 4,
    LANGUAGE_CONFIRM + 2 * 4,
    LANGUAGE_FADE_OUT + 12,
    NEXT + 8,
  ];
  cave.forEach((w, k) => w !== 0 && expected.push(AUTO_CAVE + k * 4));
  assert.deepEqual(
    changed(vanilla, demo),
    expected.sort((a, b) => a - b),
  );
});

test("village: a cold boot skips the autoload for Load Game, whose calls go through the routines", () => {
  const e = edits();
  assert.deepEqual(patchBoot("village", loaded(demoTask(), 1), loaded(contTask(), 2), eboot(), e), {
    language: true,
  });
  const demo = e.files.get(1)!;
  assert.equal(wordAt(demo, LOAD_ENTRY + 8), HANDLER_AT);
  assert.equal(wordAt(demo, NEXT + 8), PRESS_START);
  assert.deepEqual(
    Array.from({ length: HANDLER_WORDS }, (_, k) => wordAt(demo, HANDLER_AT + k * 4)),
    handlerWords(FADE_POINTER),
  );
  const cont = e.files.get(2)!;
  assert.equal(wordAt(cont, CONT_FADE_AT + 12), jal(FADE_CAVE));
  assert.equal(wordAt(cont, POLL_CALL_AT + 0x18 + 20), jal(FADE_CAVE));
  assert.equal(wordAt(cont, POLL_CALL_AT + 4), jal(POLL_CAVE));
  assert.equal(wordAt(cont, POST_LOAD_AT + 20), jal(APPLY_CAVE));
  assert.deepEqual(
    Array.from({ length: 8 }, (_, k) => wordAt(cont, FADE_CAVE + k * 4)),
    fadeWords(SAVE_POINTER, FADE),
  );
  assert.deepEqual(
    Array.from({ length: APPLY_WORDS }, (_, k) => wordAt(cont, APPLY_CAVE + k * 4)),
    applyWords(APPLY, POST_LOAD),
  );
});

test("the new handler puts the kept fade back and ends its task with next = 5", () => {
  for (const [state, kept, after] of [
    [0, 3, 3],
    [2, 3, 2],
  ] as const) {
    const cpu = new Cpu();
    const task = 0x09200000;
    const fade = 0x09500000;
    cpu.load(HANDLER_AT, handlerWords(FADE_POINTER));
    cpu.setU32(FADE_POINTER, fade);
    cpu.setU32(fade + 0x1c, state);
    cpu.setU32(fade + 0x30, kept);
    cpu.call(HANDLER_AT, [task]);
    assert.equal(cpu.u32(fade + 0x1c), after);
    assert.equal(cpu.u8(task + 0x11), 1);
    assert.equal(cpu.u32(task + 0x18), 5);
  }
});

test("Load Game's post-load step comes after the save's options are applied", () => {
  const cpu = new Cpu();
  const save = 0x09300000;
  cpu.load(APPLY_CAVE, applyWords(APPLY, POST_LOAD));
  cpu.native.set(APPLY, () => 0);
  cpu.native.set(POST_LOAD, () => 9);
  assert.equal(cpu.call(APPLY_CAVE, [save]), 9);
  assert.deepEqual(
    cpu.calls.map((c) => [c.address, c.args[0]]),
    [
      [APPLY, save],
      [POST_LOAD, save],
    ],
  );
});

const SAVE = 0x09300000;
const SELECT = 0x09400000;

test("the autoload's message is confirmed for the player, and nothing else", () => {
  for (const state of [0, 1, 4, AUTOLOADED, 6, 9]) {
    const cpu = new Cpu();
    cpu.load(AUTO_CAVE, autoloadWords(AUTO_CAVE, AUTOLOAD, EU_PAD, 0x4000));
    cpu.setU32(SELECT + 0xc, state);
    cpu.setU32(EU_PAD, 0x10);
    let seen = -1;
    cpu.native.set(AUTOLOAD, (c) => ((seen = c.u32(EU_PAD)), 1));
    assert.equal(cpu.call(AUTO_CAVE, [SELECT]), 1);
    assert.equal(cpu.calls[0]!.args[0], SELECT);
    assert.equal(seen, state === AUTOLOADED ? 0x4010 : 0x10, `state ${state}`);
  }
});

test("Load Game fades in and out unless it came from boot", () => {
  for (const first of [0, 1])
    for (const out of [0, 1]) {
      const cpu = new Cpu();
      cpu.load(FADE_CAVE, fadeWords(SAVE_POINTER, FADE));
      cpu.setU32(SAVE_POINTER, SAVE);
      cpu.setU8(SAVE + TITLE_FIRST, first);
      cpu.native.set(FADE, () => 0);
      cpu.call(FADE_CAVE, [0x09500000, 0x10, out]);
      assert.deepEqual(
        cpu.calls.map((c) => [c.address, ...c.args]),
        first ? [] : [[FADE, 0x09500000, 0x10, out]],
      );
    }
});

/** One frame of Load Game's poll: the pressed buttons the poll saw, whether it faded in, and the flag. */
function frame(
  state: number,
  { first = 1, held = 0, pressed = 0, shown = 0, pad = EU_PAD, confirm = 0x4000 } = {},
) {
  const cpu = new Cpu();
  const flag = POLL_CAVE + SHOWN * 4;
  cpu.load(POLL_CAVE, pollWords(POLL_CAVE, POLL, SHOW_CAVE, SAVE_POINTER, pad, confirm));
  cpu.load(SHOW_CAVE, showWords(flag, POLL, FADE, FADE_POINTER, SAVE_POINTER));
  cpu.setU32(flag, shown);
  cpu.setU32(SAVE_POINTER, SAVE);
  cpu.setU32(FADE_POINTER, 0x09500000);
  cpu.setU8(SAVE + TITLE_FIRST, first);
  cpu.setU32(SAVE + TITLE_CURSOR, 0);
  cpu.setU32(SELECT + 0xc, state);
  cpu.setU32(pad - 4, held);
  cpu.setU32(pad, pressed);
  let seen = -1;
  cpu.native.set(FADE, () => 0);
  cpu.native.set(POLL, (c) => ((seen = c.u32(pad)), 7));
  cpu.reg[29] = 0x09fff000;
  assert.equal(cpu.call(POLL_CAVE, [SELECT]), 7);
  assert.equal(cpu.reg[29] >>> 0, 0x09fff000);
  assert.equal(cpu.calls.at(-1)!.args[0], SELECT);
  return {
    seen,
    fadedIn: cpu.calls.some((c) => c.address === FADE),
    shown: cpu.u32(flag) !== 0,
    quick: cpu.u8(SELECT + QUICK_LIST),
    // The title menu's cursor is left to the game; its flag goes once the menu is shown.
    title: [cpu.u8(SAVE + TITLE_FIRST), cpu.u32(SAVE + TITLE_CURSOR)],
  };
}

test("from boot, the list, Yes/No and Load completed are confirmed for the player", () => {
  for (const state of [3, 4, 5])
    assert.deepEqual(frame(state), {
      seen: 0x4000,
      fadedIn: false,
      shown: false,
      quick: 1,
      title: [1, 0],
    });
  assert.equal(frame(4, { pressed: 0x10 }).seen, 0x4010);
  // JP's confirm is ○.
  assert.equal(frame(3, { pad: JP_PAD, confirm: 0x2000 }).seen, 0x2000);
  // Reading the saves, opening the list and copying the slot stay dark.
  for (const state of [0, 1, 2, 6, 7, 8])
    assert.deepEqual(frame(state), {
      seen: 0,
      fadedIn: false,
      shown: false,
      quick: 1,
      title: [1, 0],
    });
});

test("a message, or L, SELECT or START held while the saves are read, leaves the menu to the player", () => {
  for (const state of [9, 10, 11])
    assert.deepEqual(frame(state), {
      seen: 0,
      fadedIn: true,
      shown: true,
      quick: 0,
      title: [0, 0],
    });
  // Held before the list, the quick list goes: the list opens as ever, NOW LOADING hidden.
  for (const state of [0, 1, 8])
    for (const held of [0x1, 0x8, 0x100])
      assert.deepEqual(
        frame(state, { held }),
        { seen: 0, fadedIn: true, shown: true, quick: 0, title: [0, 0] },
        `state ${state}, held 0x${held.toString(16)}`,
      );
  // In the waits it's too late: they're confirmed.
  assert.deepEqual(frame(3, { held: 0x8 }), {
    seen: 0x4000,
    fadedIn: false,
    shown: false,
    quick: 1,
    title: [1, 0],
  });
  // Once shown, the menu is as ever.
  assert.deepEqual(frame(3, { shown: 1 }), {
    seen: 0,
    fadedIn: false,
    shown: true,
    quick: 0,
    title: [1, 0],
  });
});

test("from the title menu, Load Game is as ever", () => {
  for (const state of [3, 4, 5, 9])
    assert.deepEqual(frame(state, { first: 0 }), {
      seen: 0,
      fadedIn: false,
      shown: false,
      quick: 0,
      title: [0, 0],
    });
});

test("the report says what the disc starts with", () => {
  const d = loaded(demoTask(), 1);
  const c = loaded(contTask(), 2);
  assert.match(bootReport("title", d, c, { language: true }, "eu").summary ?? "", /language/);
  assert.doesNotMatch(
    bootReport("title", d, c, { language: false }, "jp").summary ?? "",
    /language/,
  );
  assert.match(
    bootReport("village", d, c, { language: false }, "jp").summary ?? "",
    /Hold START.*○/,
  );
  assert.match(
    bootReport("village", null, c, { language: true }, "eu").summary ?? "",
    /not applied/,
  );
});
