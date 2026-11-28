import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { linkBlob } from "../src/blob/link.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import {
  DISTANCE_SCALES,
  FOV_SCALES,
  SCALE_WORD,
  TILT_RATES,
  cameraObjects,
  patchFov,
} from "../src/patches/camera.js";
import { Cpu } from "./mips-cpu.js";

const VADDR = 0x08804000;
const CODE = 0x100;
/** EU's projection update and the perspective builder it calls. */
const UPDATE = 0x08815348;
const PERSPECTIVE = 0x088145c4;
const UPDATE_WORDS = [
  0x27bdfff0, 0xafbf000c, 0xafb00008, 0xc48c000c, 0xc48d0008, 0xc48e0000, 0xc48f0004, 0x0e205171,
  0x00808021, 0xc600000c, 0xe6000010, 0x8fbf000c, 0x8fb00008, 0x03e00008, 0x27bd0010,
];
const RENDERER = 0x09998d30;
const FOV = 0.87266463;
const f = Math.fround;
const bits = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(v);
  return b.readUInt32LE(0);
};
const float = (word: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(word);
  return b.readFloatLE(0);
};

function elfWith(at: number, words: number[]): Buffer {
  const size = 0x20000;
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

/** A CPU with the projection update's words and a renderer; the perspective builder records its arguments. */
function projection(words: number[]) {
  const cpu = new Cpu();
  cpu.load(UPDATE, words);
  const got: number[][] = [];
  cpu.native.set(PERSPECTIVE, (c) => (got.push([c.f[12]!, c.f[13]!, c.f[14]!, c.f[15]!]), 0));
  [30, 65000, 480 / 272, FOV, 0].forEach((v, k) => cpu.setU32(RENDERER + k * 4, bits(v)));
  const update = () => {
    cpu.call(UPDATE, [RENDERER]);
    return { args: got.at(-1)!, builtWith: float(cpu.u32(RENDERER + 0x10)) };
  };
  return { cpu, update };
}

test("the patched projection update scales the angle by its last word", () => {
  const before = projection(UPDATE_WORDS).update();
  assert.deepEqual(before.args, [f(FOV), f(480 / 272), 30, 65000]);

  for (const scale of Object.values(FOV_SCALES)) {
    const elf = elfWith(UPDATE, UPDATE_WORDS);
    assert.equal(patchFov(elf, scale), UPDATE + SCALE_WORD * 4, "the scale's address");
    const { cpu, update } = projection(codeAt(elf, UPDATE, UPDATE_WORDS.length));
    const after = update();
    assert.equal(after.args[0], f(f(FOV) * f(scale)), `fov ×${scale}`);
    assert.deepEqual(after.args.slice(1), before.args.slice(1));
    // It records the angle as the game has it, so it still rebuilds only on a change.
    assert.equal(after.builtWith, f(FOV));
    // The blob changes the word, not the code.
    cpu.setU32(UPDATE + SCALE_WORD * 4, bits(1.5));
    assert.equal(update().args[0], f(f(FOV) * 1.5));
  }
});

test("the projection update is found by its code, not its address", () => {
  // JP's is elsewhere and calls a perspective builder elsewhere.
  const jp = [...UPDATE_WORDS];
  jp[7] = 0x0e2054e1;
  const elf = elfWith(0x08816108, jp);
  assert.equal(patchFov(elf, 1.25), 0x08816108 + SCALE_WORD * 4);
  assert.equal(codeAt(elf, 0x08816108, 8)[7], 0x0a2054e1, "j to JP's perspective builder");
  assert.match(String(patchFov(elfWith(UPDATE, [0, 0, 0]), 1.25)), /doesn't match/);
});

// --- The blob ---

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const PAD_READ = 0x08868f50;
const SAVE = 0x09999c60;
/** `struct rf_save_data`'s camera_fov and camera_distance (`blob/rf.h`): the menu's choice + 1. */
const SAVED_FOV = SAVE + 0x666e0 + 16;
const SAVED_DISTANCE = SAVED_FOV + 1;
/** camera_tilt, camera_pitched and camera_pitch (sine × 32000, s16). */
const SAVED_TILT = SAVED_FOV + 3;
const SAVED_PITCHED = SAVED_FOV + 4;
const SAVED_PITCH = SAVED_FOV + 6;
/** The renderer's tilt step (0 the highest, preset 4, to 4); the pad hook's SceCtrlData. */
const LEVEL = RENDERER + 0x14;
const CTRL = 0x09fff000;
/** The pad object's global, the pad object (its +0x17 locks the buttons), and the system timer. */
const PAD_GLOBAL = 0x08a62c64;
const PAD = 0x09a00000;
const TIME = 0x08880000;
/** µs a frame, at 30 frames a second. */
const FRAME_US = 33333;
const UP = 0x10;
const DOWN = 0x40;
const SCALE = UPDATE + SCALE_WORD * 4;
const BLOCK = 0x0958b9d0;
const PRESETS = [
  [0, 300, 160, 184, 80],
  [0, 270, 490, 170, 80],
  [-501.3, 140, 490, 170, 80],
  [0, 60, 450, 210, 60],
  [0, 400, 220, 195, 80],
];

/** The blob linked, with a renderer whose camera uses a stage's block; the disc's choices given. */
function game(fov: number, distance: number, blockFov = FOV, tilt = 0, level = 0x14 + 1) {
  const externs = {
    rf_camera: 0x089cbbe4,
    rf_fov_scale: SCALE,
    rf_camera_fov: fov + 1,
    rf_camera_distance: distance + 1,
    rf_camera_tilt: tilt + 1,
    rf_camera_level: level,
    rf_pad: PAD_GLOBAL,
    sceKernelGetSystemTimeLow: TIME,
  };
  const runtime = RUNTIME_OBJECTS.map((o) => ({
    name: o.name,
    data: Buffer.from(o.base64, "base64"),
  }));
  const blob = linkBlob([...runtime, ...cameraObjects()], BLOB, externs);
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(HOOKS, BLOB, [{ hook: HOOK.pad, target: PAD_READ }]);
  cpu.load(HOOKS, hooks.code);
  cpu.native.set(PAD_READ, () => 0);
  const clock = { now: 0x10000000, step: FRAME_US };
  cpu.native.set(TIME, () => (clock.now = (clock.now + clock.step) >>> 0));
  cpu.setU32(PAD_GLOBAL, PAD);
  cpu.setU32(externs.rf_camera, RENDERER);
  cpu.setU32(RENDERER + 0xc, bits(FOV));
  cpu.setU32(RENDERER + 0x10, bits(FOV));
  cpu.setU32(RENDERER + 0x1bc, BLOCK);
  cpu.setU32(LEVEL, 2);
  cpu.setU32(SCALE, bits([1, 1.15, 1.25, 1.4][fov]!));
  const writeBlock = () => {
    cpu.fill(BLOCK, 0xc0, 0);
    cpu.setU32(BLOCK, bits(blockFov));
    PRESETS.forEach((p, k) => {
      const at = BLOCK + 0x20 + k * 0x20;
      [p[0]!, p[1]!, p[2]!, 0, p[3]!, 0, p[4]!, 0].forEach((v, i) =>
        cpu.setU32(at + i * 4, bits(v)),
      );
    });
  };
  writeBlock();
  const presets = () =>
    PRESETS.map((_, k) => {
      const at = BLOCK + 0x20 + k * 0x20;
      return [1, 2, 4].map((i) => float(cpu.u32(at + i * 4)));
    });
  const init = () => cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);
  const frame = (buttons = 0) => {
    cpu.setU32(CTRL + 4, buttons);
    cpu.call(hooks.stubs[0]!, [CTRL]);
  };
  init();
  return { cpu, clock, frame, init, presets, writeBlock };
}

/** The presets `scale` times as far back: eye height, distance, look height. */
const expected = (scale: number) =>
  PRESETS.map(([, eye, distance, look]) => [
    look! + (eye! - look!) * scale,
    distance! * scale,
    look!,
  ]);

function near(got: number[][], want: number[][], message?: string) {
  got.forEach((row, k) =>
    row.forEach((v, i) =>
      assert.ok(
        Math.abs(v - want[k]![i]!) < 1e-3,
        `${message} [${k}][${i}]: ${v} vs ${want[k]![i]}`,
      ),
    ),
  );
}

test("the disc's camera distance moves every preset back down its line", () => {
  const scales = Object.values(DISTANCE_SCALES);
  scales.forEach((scale, choice) => {
    const g = game(0, choice);
    g.frame();
    near(g.presets(), expected(scale), `×${scale}`);
    // Again: nothing compounds.
    g.frame();
    g.frame();
    near(g.presets(), expected(scale), `×${scale} after more frames`);
  });
});

test("a choice made in game rescales from the game's values", () => {
  const g = game(0, 2);
  g.frame();
  g.cpu.setU8(SAVED_DISTANCE, 4); // farthest
  g.frame();
  near(g.presets(), expected(1.5));
  g.cpu.setU8(SAVED_DISTANCE, 1); // normal
  g.frame();
  near(g.presets(), expected(1));
});

test("a block the game loads again is scaled again", () => {
  const g = game(0, 2);
  g.frame();
  g.writeBlock();
  g.frame();
  near(g.presets(), expected(1.3));
});

test("a block at another angle is scaled too", () => {
  // 20 stages' blocks are 50° or 51° to a few bits (EU and JP: st012's is 0x3F63DEC4).
  for (const word of [0x3f63dec4, 0x3f5f66b6]) {
    const g = game(0, 2, float(word));
    g.frame();
    near(g.presets(), expected(1.3), word.toString(16));
  }
});

test("what the game writes over a scaled block is scaled from the game's value", () => {
  const g = game(0, 2);
  g.frame();
  // The game sets one preset's distance, and another's look height.
  g.cpu.setU32(BLOCK + 0x40 + 2 * 4, bits(600));
  g.cpu.setU32(BLOCK + 0x60 + 4 * 4, bits(100));
  g.frame();
  const want = expected(1.3);
  want[1]![1] = 600 * 1.3;
  const [, eye] = PRESETS[2]!;
  want[2] = [100 + (eye! - 100) * 1.3, want[2]![1]!, 100];
  near(g.presets(), want);
  g.frame();
  near(g.presets(), want, "settled");
});

test("a blob loaded again doesn't scale a block twice", () => {
  const g = game(0, 2);
  g.frame();
  // A save load: the blob starts over, the block it scaled is still there.
  g.init();
  g.frame();
  near(g.presets(), expected(1.3));
  g.cpu.setU8(SAVED_DISTANCE, 2); // far
  g.init();
  g.frame();
  near(g.presets(), expected(1.15));
});

test("what isn't a camera block is left alone", () => {
  const g = game(0, 3);
  g.cpu.setU32(BLOCK + 8, 1);
  const before = g.cpu.bytes(BLOCK, 0xc0);
  g.frame();
  assert.deepEqual(g.cpu.bytes(BLOCK, 0xc0), before);
  // Nor a renderer or block that isn't one.
  g.cpu.setU32(RENDERER + 0x1bc, 0);
  g.frame();
  g.cpu.setU32(0x089cbbe4, 0);
  g.frame();
});

test("the field of view follows the save's choice, and the projection is rebuilt", () => {
  const g = game(2, 0);
  assert.equal(float(g.cpu.u32(SCALE)), f(1.25), "the disc's");
  assert.equal(g.cpu.u32(RENDERER + 0x10), 0, "rebuilt");
  g.cpu.setU8(SAVED_FOV, 4); // widest
  g.cpu.setU32(RENDERER + 0x10, bits(FOV));
  g.init();
  assert.equal(float(g.cpu.u32(SCALE)), f(1.4));
  assert.equal(g.cpu.u32(RENDERER + 0x10), 0);
});

// --- Smooth tilt ---

/** Every preset as preset 1's camera, `scale` times as far from what it looks at, at `sine`. */
const tilted = (sine: number, scale = 1) => {
  const [, eye, distance, look] = PRESETS[1]!;
  const r = Math.hypot(distance!, eye! - look!) * scale;
  return PRESETS.map(() => [look! + r * sine, r * Math.sqrt(1 - sine * sine), look!]);
};
const sineOf = ([eye, distance, look]: number[]) =>
  (eye! - look!) / Math.hypot(distance!, eye! - look!);
const savedPitch = (cpu: Cpu) => ((cpu.u16(SAVED_PITCH) << 16) >> 16) / 32000;
const smooth = Object.keys(TILT_RATES).indexOf("smooth");
/** Smooth's step a frame, in radians. */
const RATE = (((TILT_RATES.smooth * Math.PI) / 180) * FRAME_US) / 1e6;

test("smooth tilt makes every step the usual camera, at the angle of the step the game is on", () => {
  const g = game(0, 0, FOV, smooth);
  g.cpu.setU32(LEVEL, 3); // preset 2, a little below what it looks at
  g.frame();
  near(g.presets(), tilted(sineOf([140, 490, 170])));
  assert.equal(g.cpu.u32(LEVEL), 2, "the game's step goes back to the middle");
});

test("a step the game takes tilts the camera while its button is held", () => {
  const g = game(0, 0, FOV, smooth);
  g.frame();
  const start = sineOf([270, 490, 170]);
  near(g.presets(), tilted(start), "the usual camera to start");
  // D-pad down: the game steps a level higher.
  g.cpu.setU32(LEVEL, 1);
  g.frame(DOWN);
  assert.equal(g.cpu.u32(LEVEL), 2);
  let sine = start;
  for (let k = 0; k < 10; k++) {
    sine += RATE * Math.sqrt(1 - sine * sine);
    if (k) g.frame(DOWN);
    near(g.presets(), tilted(sine), `frame ${k}`);
  }
  assert.ok(sine > start + 0.15, "it looks further down");
  // Let go: it stays, and the save keeps it.
  g.frame();
  g.frame();
  near(g.presets(), tilted(sine), "held");
  assert.equal(g.cpu.u8(SAVED_PITCHED), 1);
  assert.ok(Math.abs(savedPitch(g.cpu) - sine) < 1e-4);
  // Up, without a step of the game's (a menu has the D-pad): nothing.
  g.frame(UP);
  near(g.presets(), tilted(sine), "no step, no tilt");
  // Up, with one.
  g.cpu.setU32(LEVEL, 3);
  g.frame(UP);
  g.frame(UP);
  assert.ok(sineOf(g.presets()[1]!) < sine, "looks up");
});

test("smooth tilt stops at its limits and above the ground", () => {
  const g = game(0, 3, FOV, smooth); // farthest: the floor comes first going up
  g.frame();
  g.cpu.setU32(LEVEL, 1);
  for (let k = 0; k < 200; k++) g.frame(DOWN);
  near(g.presets(), tilted(0.82, 1.5), "55° down");
  g.cpu.setU32(LEVEL, 3);
  for (let k = 0; k < 200; k++) g.frame(UP);
  const lowest = g.presets()[0]!;
  assert.ok(Math.abs(lowest[0]! - 40) < 1e-3, `40 above the ground: ${lowest[0]}`);
  near(g.presets(), tilted((40 - 170) / (Math.hypot(490, 100) * 1.5), 1.5), "the floor");
});

test("smooth tilt keeps the distance, and the save's angle", () => {
  const g = game(0, 2, FOV, smooth);
  g.cpu.setU8(SAVED_PITCHED, 1);
  g.cpu.setU16(SAVED_PITCH, Math.round(0.3 * 32000));
  g.init();
  g.frame();
  near(g.presets(), tilted(Math.round(0.3 * 32000) / 32000, 1.3));
  // Steps again, from the menu: the game's presets, scaled.
  g.cpu.setU8(SAVED_TILT, 1);
  g.frame();
  near(g.presets(), expected(1.3));
  g.cpu.setU8(SAVED_TILT, 3);
  g.frame();
  near(g.presets(), tilted(Math.round(0.3 * 32000) / 32000, 1.3), "smooth again");
});

test("a blob loaded again finds the game's presets under a tilted block", () => {
  for (const distance of [0, 2]) {
    const g = game(0, distance, FOV, smooth);
    g.cpu.setU32(LEVEL, 1);
    g.frame(DOWN);
    g.frame(DOWN);
    const before = g.presets();
    // A save load: the blob starts over, the block it wrote is still there.
    g.init();
    g.frame();
    near(g.presets(), before, `as it was (distance ${distance})`);
    g.cpu.setU8(SAVED_TILT, 1); // steps
    g.frame();
    // Preset 1 as it was; the others are the EBOOT's, which these are.
    near(
      g.presets(),
      expected([1, 1.15, 1.3, 1.5][distance]!),
      `the game's (distance ${distance})`,
    );
  }
});

test("the game's steps leave the tilt step alone", () => {
  const g = game(0, 2);
  g.cpu.setU32(LEVEL, 0);
  g.frame(DOWN);
  assert.equal(g.cpu.u32(LEVEL), 0);
  near(g.presets(), expected(1.3));
});

test("only a step of one just after a press tilts, and a tap tilts a frame", () => {
  const g = game(0, 0, FOV, smooth);
  g.frame(UP); // held already
  g.frame(UP);
  const start = sineOf(g.presets()[1]!);
  // The game moves the level while the button was held all along (an area loading): nothing.
  g.cpu.setU32(LEVEL, 0);
  g.frame(UP);
  g.frame(UP);
  near(g.presets(), tilted(start), "not a press");
  assert.equal(g.cpu.u32(LEVEL), 2);
  // Two levels at once, just after a press: nothing.
  g.frame();
  g.cpu.setU32(LEVEL, 0);
  g.frame(DOWN);
  g.frame(DOWN);
  near(g.presets(), tilted(start), "not a step of one");
  // A tap: pressed one frame, the game's step seen the next, with the button up.
  g.frame();
  g.frame(DOWN);
  g.cpu.setU32(LEVEL, 1);
  g.frame();
  const once = start + RATE * Math.sqrt(1 - start * start);
  near(g.presets(), tilted(once), "a frame's tilt");
  g.frame();
  near(g.presets(), tilted(once), "and no more");
});

test("tilting stops when the game locks the buttons", () => {
  const g = game(0, 0, FOV, smooth);
  g.frame();
  g.cpu.setU32(LEVEL, 1);
  g.frame(DOWN);
  g.frame(DOWN);
  const before = sineOf(g.presets()[1]!);
  g.cpu.setU8(PAD + 0x17, 1);
  g.frame(DOWN);
  g.frame(DOWN);
  near(g.presets(), tilted(before), "locked");
  // A step while locked doesn't start one either.
  g.frame();
  g.cpu.setU32(LEVEL, 3);
  g.frame(UP);
  near(g.presets(), tilted(before), "locked step");
});

test("smooth tilt turns as fast at 60 frames a second", () => {
  const at = (step: number) => {
    const g = game(0, 0, FOV, smooth);
    g.clock.step = step;
    g.frame();
    g.cpu.setU32(LEVEL, 1);
    for (let k = 0; k < (FRAME_US * 10) / step; k++) g.frame(DOWN);
    return sineOf(g.presets()[1]!);
  };
  assert.ok(Math.abs(at(FRAME_US) - at(FRAME_US / 2)) < 2e-3);
});

test("the save's copy brings back every preset of a tilted block, and only that block's", () => {
  const word0 = (cpu: Cpu) => float(cpu.u32(BLOCK + 0x20 + 2 * 0x20));
  const g = game(0, 2, FOV, smooth);
  g.frame();
  g.init();
  g.frame();
  g.cpu.setU8(SAVED_TILT, 1); // steps
  g.frame();
  assert.equal(word0(g.cpu), f(-501.3), "preset 2's first word, the stage's");
  // A copy of another block: preset 1 as kept, the EBOOT's others.
  const h = game(0, 2, FOV, smooth);
  h.frame();
  h.cpu.setU32(SAVE + 0x666e0 + 24, BLOCK + 0x1000);
  h.init();
  h.frame();
  h.cpu.setU8(SAVED_TILT, 1);
  h.frame();
  assert.equal(word0(h.cpu), 0);
  near(h.presets(), expected(1.3));
});

test("tilt stays off where the renderer's level isn't known", () => {
  const g = game(0, 0, FOV, smooth, 1);
  g.cpu.setU32(LEVEL, 0);
  g.frame(DOWN);
  assert.equal(g.cpu.u32(LEVEL), 0);
  near(g.presets(), expected(1));
});
