import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { linkBlob } from "../src/blob/link.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import { jalTo } from "../src/patches/mips.js";
import {
  DIM_SIGNATURE,
  LOOK_SIGNATURE,
  NO_PAUSE_SIGNATURE,
  PAUSE_SIGNATURE,
  UNPAUSE_AT,
  PAUSE_AT,
  dimWords,
  findPhotoSites,
  patchDim,
  photoObjects,
} from "../src/patches/photo.js";
import { Cpu } from "./mips-cpu.js";

const VADDR = 0x08804000;
const CODE = 0x100;
/** EU's addresses. */
const PAUSED = 0x088567b4;
const DIM = 0x0885658c;
const NO_PAUSE = 0x0884fa5c;
const LOOK = 0x08815384;

function elfWith(parts: [number, number[]][]): Buffer {
  const size = 0x80000;
  const elf = Buffer.alloc(CODE + size);
  elf.writeUInt32LE(0x464c457f, 0);
  elf.writeUInt32LE(0x34, 0x1c);
  elf.writeUInt16LE(1, 0x2c);
  elf.writeUInt32LE(1, 0x34);
  elf.writeUInt32LE(CODE, 0x38);
  elf.writeUInt32LE(VADDR, 0x3c);
  elf.writeUInt32LE(size, 0x44);
  for (const [at, words] of parts) {
    words.forEach((w, k) => elf.writeUInt32LE(w >>> 0, CODE + at - VADDR + k * 4));
  }
  return elf;
}
const codeAt = (elf: Buffer, at: number, n: number) =>
  Array.from({ length: n }, (_, k) => elf.readUInt32LE(CODE + at - VADDR + k * 4));

/** An EBOOT with the game's pause, dimming, check and look code where EU has them. */
function eboot(dimCall = PAUSED) {
  const dim = [...DIM_SIGNATURE];
  dim[4] = jalTo(dimCall);
  return elfWith([
    [PAUSED, PAUSE_SIGNATURE],
    [DIM - 8, dim],
    [NO_PAUSE, NO_PAUSE_SIGNATURE],
    [LOOK, LOOK_SIGNATURE],
  ]);
}

test("photo mode finds the game's pause and camera code", () => {
  const sites = findPhotoSites(eboot());
  assert.deepEqual(sites, { paused: PAUSED, dim: DIM, noPause: NO_PAUSE, look: LOOK });
  assert.equal(PAUSED + PAUSE_AT, 0x088567c8);
  assert.equal(PAUSED + UNPAUSE_AT, 0x0885683c);
  // The dimming has to call isPaused, as EU's does.
  assert.match(String(findPhotoSites(eboot(0x08850000))), /dimming doesn't match/);
  assert.match(String(findPhotoSites(elfWith([]))), /pause code doesn't match/);
});

test("the patched dimming draws for the game's pause only, and keeps the frame", () => {
  const elf = eboot();
  const sites = findPhotoSites(elf);
  assert.ok(typeof sites !== "string");
  patchDim(elf, sites);
  assert.deepEqual(codeAt(elf, DIM, 8), dimWords(DIM));
  const SAVE = 0x09999c60;
  const DREW = 0x08860000;
  const S0 = 0x12345678;
  for (const [byte, draws] of [
    [0, false],
    [1, true],
    [2, false],
    [4, false],
  ] as const) {
    const cpu = new Cpu();
    // `jr ra; nop`, the new words, then the dimming's body: a call that records, the epilogue.
    cpu.load(DIM - 8, [0x03e00008, 0, ...codeAt(elf, DIM, 8)]);
    cpu.load(DIM + 0x20, [
      jalTo(DREW),
      0,
      0x8fbf000c, // lw ra, 0xc(sp)
      0x8fb00008, // lw s0, 8(sp)
      0x03e00008, // jr ra
      0x27bd0050, // addiu sp, sp, 0x50
    ]);
    let drew = false;
    cpu.native.set(DREW, (c) => {
      drew = true;
      c.reg[16] = 0x0bad; // the body uses s0
      return 0;
    });
    cpu.setU8(SAVE + 0x6af1a, byte);
    cpu.reg[16] = S0;
    cpu.reg[29] = 0x09ff0000;
    cpu.call(DIM, [SAVE]);
    assert.equal(drew, draws, `byte ${byte}`);
    assert.equal(cpu.reg[29]! >>> 0, 0x09ff0000, "the stack as it was");
    assert.equal(cpu.reg[16]! >>> 0, S0, "s0 as it was");
  }
});

// --- The blob ---

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const HUD_UPDATE = 0x0883f270;
const PAD_READ = 0x08868f50;
const SAVE = 0x09999c60;
const PAUSE = SAVE + 0x6af1a;
/** `struct rf_save_data`'s photo_mode (`blob/rf.h`): the menu's choice + 1. */
const SAVED_PHOTO = SAVE + 0x666e0 + 188;
const HUD = 0x09a04ba0;
const RENDERER = 0x09998d30;
const CTRL = 0x09fff000;
const PAD_GLOBAL = 0x08a62c64;
const PAD = 0x09a00000;
const START = 0x8;
const SELECT = 0x1;
const L = 0x100;
const R = 0x200;
const UP = 0x10;
const CIRCLE = 0x2000;
const FOV = 0.87266463;
const EYE = [100, 300, 590];
const TARGET = [100, 200, 100];

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

/** The blob linked, in a quest: the game's pause, unpause and look are JavaScript. */
function game({ on = true, online = false } = {}) {
  const externs = {
    rf_camera: 0x089cbbe4,
    rf_pad: PAD_GLOBAL,
    rf_pause: 0x088567c8,
    rf_unpause: 0x0885683c,
    rf_no_pause: NO_PAUSE,
    rf_look: LOOK,
    rf_photo_mode: on ? 2 : 1,
  };
  const runtime = RUNTIME_OBJECTS.map((o) => ({
    name: o.name,
    data: Buffer.from(o.base64, "base64"),
  }));
  const blob = linkBlob([...runtime, ...photoObjects()], BLOB, externs);
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(HOOKS, BLOB, [
    { hook: HOOK.questFrame, target: HUD_UPDATE },
    { hook: HOOK.pad, target: PAD_READ },
  ]);
  cpu.load(HOOKS, hooks.code);
  cpu.native.set(HUD_UPDATE, () => 0);
  cpu.native.set(PAD_READ, () => 0);
  const calls: string[] = [];
  const looks: { eye: number[]; target: number[]; fov: number }[] = [];
  const vec = (at: number) => [0, 1, 2].map((k) => float(cpu.u32(at + k * 4)));
  cpu.native.set(externs.rf_pause, (c) => {
    assert.equal(c.reg[4]! >>> 0, SAVE);
    calls.push("pause");
    if (!online) c.setU8(PAUSE, 1);
    return 0;
  });
  cpu.native.set(externs.rf_unpause, (c) => {
    assert.equal(c.reg[4]! >>> 0, SAVE);
    calls.push("unpause");
    c.setU8(PAUSE, 4);
    return 0;
  });
  cpu.native.set(NO_PAUSE, () => 0);
  cpu.native.set(LOOK, (c) => {
    assert.equal(c.reg[4]! >>> 0, RENDERER);
    // The view is built from the second pair, which agrees with the first.
    assert.deepEqual(vec(RENDERER + 0xb40), vec(RENDERER + 0x20));
    assert.deepEqual(vec(RENDERER + 0xb50), vec(RENDERER + 0x30));
    looks.push({
      eye: vec(RENDERER + 0x20),
      target: vec(RENDERER + 0x30),
      fov: float(c.u32(RENDERER + 0xc)),
    });
    return 0;
  });
  cpu.setU32(externs.rf_camera, RENDERER);
  cpu.setU32(PAD_GLOBAL, PAD);
  const put = (at: number, v: number[]) => v.forEach((x, k) => cpu.setU32(at + k * 4, bits(x)));
  put(RENDERER + 0x20, [...EYE, 0, ...TARGET, 0]);
  put(RENDERER + 0xb40, [...EYE, 0, ...TARGET, 0]);
  cpu.setU32(RENDERER + 0xc, bits(FOV));
  cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);
  /** A frame: the pad read with these buttons and stick, then game_task's (a quest's) frame. */
  const frame = (buttons = 0, x = 128, y = 128, quest = true) => {
    cpu.setU32(CTRL + 4, buttons);
    cpu.setU8(CTRL + 8, x);
    cpu.setU8(CTRL + 9, y);
    cpu.call(hooks.stubs[1]!, [CTRL]);
    const seen = { buttons: cpu.u32(CTRL + 4), x: cpu.u8(CTRL + 8), lock: cpu.u8(PAD + 0x17) };
    if (quest) cpu.call(hooks.stubs[0]!, [HUD]);
    return seen;
  };
  return { cpu, frame, calls, looks, vec };
}

const near = (got: number[], want: number[], message?: string) =>
  got.forEach((g, k) => assert.ok(Math.abs(g - want[k]!) < 0.05, `${message}: ${got} vs ${want}`));
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((x, k) => x - b[k]!));

test("L+R+START pauses the quest and hands over the camera; START puts it back", () => {
  const g = game();
  g.frame();
  g.frame(L | R);
  assert.equal(g.cpu.u8(PAUSE), 0);
  // START's press: the game sees none of it.
  const first = g.frame(L | R | START);
  assert.deepEqual(g.calls, ["pause"]);
  assert.equal(g.cpu.u8(PAUSE), 2, "paused, as photo mode's 2");
  assert.deepEqual(first, { buttons: 0, x: 128, lock: 1 });
  near(g.looks.at(-1)!.eye, EYE, "it starts where the camera was");
  near(g.looks.at(-1)!.target, TARGET, "looking where it looked");

  // Held from the start, L, R and START do nothing until let go.
  g.frame(L | R | START);
  near(g.looks.at(-1)!.eye, EYE, "held buttons");
  assert.ok(Math.abs(g.looks.at(-1)!.fov - FOV) < 1e-6);

  // The stick turns it round what it looks at, at the same distance.
  for (let k = 0; k < 10; k++) g.frame(0, 255, 128);
  let { eye, target } = g.looks.at(-1)!;
  near(target, TARGET, "the stick keeps what it looks at");
  assert.ok(Math.abs(distance(eye, target) - distance(EYE, TARGET)) < 0.5);
  assert.ok(eye[0]! < EYE[0]!, "right turns it to the left of the target");
  assert.ok(Math.abs(eye[1]! - EYE[1]!) < 0.01, "at the same height");
  // Up on the stick looks up: the camera goes lower.
  for (let k = 0; k < 5; k++) g.frame(0, 128, 0);
  ({ eye, target } = g.looks.at(-1)!);
  assert.ok(eye[1]! < EYE[1]!);
  assert.ok(Math.abs(distance(eye, target) - distance(EYE, TARGET)) < 0.5);

  // The D-pad moves both forwards, along the ground; ○ takes it further; L narrows the view.
  const before = g.looks.at(-1)!;
  g.frame(UP);
  const moved = g.looks.at(-1)!;
  const ahead = [before.target[0]! - before.eye[0]!, before.target[2]! - before.eye[2]!];
  const step = [moved.target[0]! - before.target[0]!, moved.target[2]! - before.target[2]!];
  assert.ok(ahead[0]! * step[0]! + ahead[1]! * step[1]! > 0, "forwards");
  assert.ok(Math.abs(moved.target[1]! - before.target[1]!) < 1e-3, "along the ground");
  g.frame(CIRCLE);
  assert.ok(distance(g.looks.at(-1)!.eye, g.looks.at(-1)!.target) > distance(EYE, TARGET));
  g.frame(L);
  assert.ok(g.looks.at(-1)!.fov < FOV);

  // SELECT goes back to the start.
  g.frame(SELECT);
  near(g.looks.at(-1)!.eye, EYE, "reset");
  near(g.looks.at(-1)!.target, TARGET, "reset");
  assert.ok(Math.abs(g.looks.at(-1)!.fov - FOV) < 1e-6);
  g.frame(L);
  g.frame(UP);

  // START ends it: the camera as it was, to the bit, and the game's unpause.
  const ended = g.frame(START);
  assert.deepEqual(g.calls, ["pause", "unpause"]);
  assert.equal(g.cpu.u8(PAUSE), 4);
  assert.deepEqual(g.vec(0x09998d30 + 0x20), EYE);
  assert.deepEqual(g.vec(0x09998d30 + 0x30), TARGET);
  assert.deepEqual(g.vec(0x09998d30 + 0xb40), EYE);
  assert.equal(g.cpu.u32(RENDERER + 0xc), bits(FOV));
  assert.deepEqual(g.looks.at(-1)!.eye, EYE, "the view built again from it");
  // The buttons stay the blob's until every one is up, so START doesn't reach the game.
  assert.deepEqual(ended, { buttons: 0, x: 128, lock: 1 });
  assert.equal(g.frame(START).lock, 1);
  g.cpu.setU8(PAUSE, 0); // game_task clears the 4
  assert.equal(g.frame().lock, 0);
  assert.equal(g.frame(UP).buttons, UP, "the game has the buttons again");
  const looked = g.looks.length;
  g.frame(0, 255, 128);
  assert.equal(g.looks.length, looked, "and the camera");
});

test("photo mode starts only in a quest frame, with the game free to pause", () => {
  // Not in a quest (the village: no quest frame).
  let g = game();
  g.frame(0, 128, 128, false);
  g.frame(L | R, 128, 128, false);
  assert.equal(g.frame(L | R | START, 128, 128, false).buttons, L | R, "START is still kept");
  assert.deepEqual(g.calls, []);

  // The START menu open, the game paused already, or the buttons locked by a dialogue.
  for (const [at, value] of [
    [HUD + 0x52d, 1],
    [PAUSE, 1],
    [PAD + 0x17, 1],
  ] as const) {
    g = game();
    g.frame();
    g.cpu.setU8(at, value);
    g.frame(L | R | START);
    assert.deepEqual(g.calls, [], `${at.toString(16)}`);
    assert.equal(g.cpu.u8(PAUSE), at === PAUSE ? 1 : 0);
  }

  // Online the game doesn't pause: nothing changes.
  g = game({ online: true });
  g.frame();
  g.frame(L | R | START);
  assert.deepEqual(g.calls, ["pause"]);
  assert.equal(g.cpu.u8(PAUSE), 0);
  assert.equal(g.frame(L | R).lock, 0);
  assert.equal(g.looks.length, 0);

  // A START already held when L and R come down doesn't start it.
  g = game();
  g.frame(START);
  g.frame(L | R | START);
  assert.deepEqual(g.calls, []);
});

test("the setting turns photo mode off and on, and the save keeps it", () => {
  const g = game({ on: false });
  g.frame();
  assert.equal(g.frame(L | R | START).buttons, L | R | START, "off: START reaches the game");
  assert.deepEqual(g.calls, []);
  g.frame();
  g.cpu.setU8(SAVED_PHOTO, 2); // the menu's On
  g.frame(L | R | START);
  assert.deepEqual(g.calls, ["pause"]);
  assert.equal(g.cpu.u8(PAUSE), 2);

  const h = game();
  h.cpu.setU8(SAVED_PHOTO, 1); // Off, though the disc's is on
  h.frame();
  h.frame(L | R | START);
  assert.deepEqual(h.calls, []);
});

test("photo mode lets go if the game unpauses by itself", () => {
  const g = game();
  g.frame();
  g.frame(L | R | START);
  g.frame(0, 255, 128);
  g.cpu.setU8(PAUSE, 0);
  g.frame();
  assert.deepEqual(g.calls, ["pause"], "no unpause of its own");
  assert.deepEqual(g.vec(RENDERER + 0x20), EYE, "the camera back");
  assert.equal(g.frame().lock, 0);
});
