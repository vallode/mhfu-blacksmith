import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOvl } from "mhfu-extract/src/container/ovl.js";
import type { Edits } from "../src/edits.js";
import { COUNTDOWN, DECREMENT, paintReport, patchPaintStays } from "../src/patches/paint.js";
import { Cpu } from "./mips-cpu.js";

const BASE = 0x09a5f200;
const AT = 0x400;
const FLAG = 0x3d0;
const TIMER = 0x3d2;
const MONSTER = 0x09b00000;

/** A synthetic `game_task` with the countdown at `AT`, as many times as `copies`. */
function gameTask(copies = 1): Buffer {
  const buf = Buffer.alloc(AT + copies * 0x100 + 0x40);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(BASE, 0x08);
  buf.write("game_task.ovl", 0x20, "latin1");
  for (let c = 0; c < copies; c++) {
    COUNTDOWN.forEach((w, k) => buf.writeUInt32LE(w, AT + c * 0x100 + k * 4));
  }
  return buf;
}

function patched(file: Buffer): { out: Buffer; problem: string | null } {
  const out = Buffer.from(file);
  const edits = { overlay: () => out } as unknown as Edits;
  return { out, problem: patchPaintStays({ index: 0, ovl: parseOvl(file) }, edits) };
}

/** Runs the countdown in `file` for `frames` on a monster painted with `timer` left. */
function run(file: Buffer, flag: number, timer: number, frames: number) {
  const cpu = new Cpu();
  const code = BASE + AT - 0x80;
  cpu.write(code, file.subarray(AT, AT + COUNTDOWN.length * 4));
  cpu.setU8(MONSTER + FLAG, flag);
  cpu.setU16(MONSTER + TIMER, timer);
  for (let f = 0; f < frames; f++) cpu.call(code, [MONSTER]);
  return { flag: cpu.u8(MONSTER + FLAG), timer: cpu.u16(MONSTER + TIMER) };
}

test("paint: the game's countdown wears a mark off; the patched one keeps it", () => {
  const file = gameTask();
  // The game: 18000 frames, then the flag clears.
  assert.deepEqual(run(file, 1, 3, 2), { flag: 1, timer: 1 });
  assert.deepEqual(run(file, 1, 2, 3), { flag: 0, timer: 0 });

  const { out, problem } = patched(file);
  assert.equal(problem, null);
  assert.equal(out.readUInt32LE(AT + DECREMENT * 4), 0);
  // Only the decrement changes.
  for (let k = 0; k < COUNTDOWN.length; k++) {
    if (k !== DECREMENT) assert.equal(out.readUInt32LE(AT + k * 4), COUNTDOWN[k]);
  }
  assert.deepEqual(run(out, 1, 18000, 50), { flag: 1, timer: 18000 });
  assert.deepEqual(run(out, 1, 1, 50), { flag: 1, timer: 1 });
  // A mark already worn off stays off, and an unpainted monster isn't painted.
  assert.deepEqual(run(out, 1, 0, 1), { flag: 0, timer: 0 });
  assert.deepEqual(run(out, 0, 0, 5), { flag: 0, timer: 0 });
});

test("paint: nothing is patched where the countdown isn't there once", () => {
  const none = gameTask();
  none.writeUInt32LE(0x2463fffe, AT + DECREMENT * 4);
  const missing = patched(none);
  assert.match(missing.problem!, /doesn't match/);
  assert.ok(missing.out.equals(none));

  const twice = patched(gameTask(2));
  assert.match(twice.problem!, /twice/);

  assert.match(paintReport(missing.problem).summary ?? "", /not applied/);
  assert.equal(paintReport(null).summary ?? "", "Paint: never wears off");
});
