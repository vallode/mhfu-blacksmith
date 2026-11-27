/**
 * Paint that never wears off (`paint.stays`): a large monster hit by a
 * Paintball stays on the area map until the quest ends.
 *
 * What the game does (`game_task`, found statically on the EU and JP
 * overlays; EU addresses):
 *
 * - A Paintball hit sets the monster's paint flag (`+0x3D0`, u8) to 1 and its
 *   timer (`+0x3D2`, s16) to 18000 frames, ten minutes at 30 a second
 *   (`monster-hp.ts`, `PAINT_CODE`). The map draws a monster's icon while the
 *   flag is set.
 * - Each frame a monster's update (EU 0x09AC74E0) counts the timer down
 *   while the flag is set and isn't 0xFF, and clears the flag when the timer
 *   is 0: `lh v1,0x3d2(a0); beqzl v1; sb zero,0x3d0(a0); addiu v1,v1,-1;
 *   sh v1,0x3d2(a0)`. It's the only countdown of the timer.
 * - The flag is otherwise cleared only when a monster is set up (spawned,
 *   or its HP and state reset) and by the ad hoc sync, which Whetstone turns
 *   off. A monster that leaves the area keeps its fields: it stays in the
 *   quest's monster list (`monster-hp.ts`), so its paint goes with it.
 *
 * The patch turns the countdown's `addiu v1,v1,-1` into a `nop`: the timer
 * is written back as it was, so it never reaches 0. Each monster keeps its
 * own flag. A paint that has already run out stays out until the next hit.
 */
import type { Edits } from "../edits.js";
import type { LoadedOverlay } from "../game/load.js";
import type { Report } from "../report.js";

/**
 * The countdown, exactly (EU 0x09AC74E8, JP 0x09AC27B8): `lbu a1,0x3d0(a0);
 * li v1,0xff; beq a1,v1,out; nop; beqz a1,out; nop; lh v1,0x3d2(a0);
 * beqzl v1,out; sb zero,0x3d0(a0); addiu v1,v1,-1; sh v1,0x3d2(a0); out:
 * jr ra`.
 */
export const COUNTDOWN = [
  0x908503d0, 0x240300ff, 0x10a30008, 0x00000000, 0x10a00006, 0x00000000, 0x848303d2, 0x50600003,
  0xa08003d0, 0x2463ffff, 0xa48303d2, 0x03e00008,
];
/** The `addiu v1,v1,-1`, in words from the countdown's start. */
export const DECREMENT = 9;
const NOP = 0;

/** Where the countdown is in `ovl` (a file offset), or why not. */
function findCountdown(file: Buffer): number | string {
  const first = COUNTDOWN[0]!;
  let found: number | null = null;
  for (let at = 0; at + COUNTDOWN.length * 4 <= file.length; at += 4) {
    if (file.readUInt32LE(at) !== first) continue;
    if (!COUNTDOWN.every((word, k) => file.readUInt32LE(at + k * 4) === word)) continue;
    if (found !== null) return "game_task's paint countdown is there twice";
    found = at;
  }
  return found ?? "game_task's paint countdown doesn't match";
}

/** Stops the paint countdown in `game_task`; null if it did, else why not. */
export function patchPaintStays(gameTask: LoadedOverlay, edits: Edits): string | null {
  const at = findCountdown(gameTask.ovl.reader.buf);
  if (typeof at === "string") return at;
  edits.overlay(gameTask).writeUInt32LE(NOP, at + DECREMENT * 4);
  return null;
}

export function paintReport(problem: string | null): Report {
  if (problem) {
    return {
      title: "Paint",
      notes: [`Paint wears off as usual on this image: ${problem}.`],
      lines: [],
      summary: `Paint: not applied (${problem})`,
    };
  }
  return {
    title: "Paint",
    notes: ["A painted monster stays on the map until the quest ends."],
    lines: [],
    summary: "Paint: never wears off",
  };
}
