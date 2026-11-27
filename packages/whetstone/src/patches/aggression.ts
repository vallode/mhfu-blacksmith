/**
 * Shorter pauses between a monster's moves, and quicker recoveries and
 * turns: part of Monster aggression (`monsterAi.aggression`, whose odds are
 * data, `src/shuffles/monster-ai.ts`) and of elites (`elites.enabled`). Blob
 * code on the shared monster boosts (`blob/monsters.c`) ends a large
 * monster's idle once it has stood in it for a cap, and plays a move faster
 * once it's past its last hit: `blob/aggression.c` sets the aggression's cap
 * and speed for every large monster, `blob/elite.c` its own for elites, and
 * the shorter cap and the faster speed win.
 *
 * What the game does (found on the EU disc, the same code on JP; see
 * `docs/monster-ai.md`, "Pauses between moves"):
 *
 * - Each frame a monster's AI gate (`game_task`, EU 0x09AD8278) skips its
 *   AI while `+0x778` (s16) counts down, and otherwise runs it (EU
 *   0x09AB4B68) when the "think now" flag `+0x4B5` (u8) is set, clearing
 *   it. The AI starts a move with op `05` and stops there; the move's own
 *   code sets `+0x4B5` when it's done, and the AI goes on after the `05`.
 * - Between moves a monster often stands in its idle: action group 0
 *   (`+0x298`) playing motion record 1 (`+0x324` = 1001), every species'
 *   looping stand, until the loop ends. Tigrex's idle (action 0.1) loops 180
 *   frames of its motion, three seconds, before it turns to its next move.
 *   Setting `+0x4B5` sooner is the idle ending sooner.
 *
 * - Each frame the monster's update (EU 0x09AC667C) sets its four animation
 *   channels' speeds to 2 × `+0x4B0` × (100 + `+0x769`) / 100: `+0x769`
 *   (u8) is a percent bonus that some moves set (Tigrex's charge) and a
 *   change of move clears. Raising it mid-move speeds the rest of the move.
 * - When a move's last hit ends is data: `src/shuffles/monster-motions.ts`,
 *   by species and motion record (`+0x324` - 1000), against the frame of
 *   the body's first channel (`+0x90`, f32). A move whose only hits are
 *   light contact (turns, mostly) goes faster all through.
 *
 * The cap and the speed apply whether or not the monster has seen a hunter (no flag for
 * that was found), so a monster that rests while it wanders rests less too.
 */
import { AGGRESSION_OBJECTS } from "../blob/aggression-object.js";
import { decodeObjects } from "../blob/link.js";
import { MONSTERS_OBJECTS } from "../blob/monsters-object.js";
import type { WhetstoneSettings } from "../settings.js";
import { MOTION_TAILS } from "./monster-motions.js";

/** The most frames (30 a second) a monster stands in its idle, by aggression. */
export const AGGRESSION_IDLE_FRAMES: Record<
  Exclude<WhetstoneSettings["monsterAi.aggression"], "off">,
  number
> = { more: 30, relentless: 10 };
/** An elite's cap (`blob/elite.c`'s IDLE_FRAMES; the shorter of it and the aggression's wins). */
export const ELITE_IDLE_FRAMES = 20;
/** Percent faster past a move's last hit and through a turn, by aggression. */
export const AGGRESSION_TAIL_SPEED: Record<
  Exclude<WhetstoneSettings["monsterAi.aggression"], "off">,
  number
> = { more: 50, relentless: 100 };
/** An elite's (`blob/elite.c`'s TAIL_SPEED; the faster of it and the aggression's wins). */
export const ELITE_TAIL_SPEED = 50;

/**
 * The AI gate, from its `+0x778` check to its countdown (EU 0x09AD8284):
 * `lh v1,0x778(a0); bgtz v1; move s0,a0; lbu v1,0x4b5(s0); beql v1,zero;
 * lw ra,0xc(sp); jal think; nop; b; sb zero,0x4b5(s0); addiu v1,v1,-1;
 * sh v1,0x778(s0)`.
 */
const GATE_SIGNATURE = [
  0x84830778,
  0x1c600008,
  0x00808021,
  0x920304b5,
  0x50600008,
  0x8fbf000c,
  null,
  0x00000000,
  0x10000003,
  0xa20004b5,
  0x2463ffff,
  0xa6030778,
];
/** The AI's start (EU 0x09AB4B68): its frame, then `lbu a1,0x298(a0)`, the move's group. */
const THINK_SIGNATURE = [
  0x27bdffe0, 0xafbf001c, 0xafb30018, 0xafb20014, 0xafb10010, 0xafb0000c, 0x90850298,
];

/**
 * The monster update's speed (EU 0x09AC667C): `lbu v1,0x769(s2); lui v0,0x42c8;
 * mtc1 v0,f0; addiu v0,v1,100; mtc1 v0,f1; cvt.s.w f1,f1; lwc1 f2,0x4b0(s2);
 * lui v1,0x4000; li v0,1; div.s f0,f1,f0; mul.s f1,f2,f0; mtc1 v1,f0;
 * mul.s f0,f0,f1; swc1 f0,0x94(s2)`.
 */
const SPEED_SIGNATURE = [
  0x92430769, 0x3c0242c8, 0x44820000, 0x24620064, 0x44820800, 0x46800860, 0xc64204b0, 0x3c034000,
  0x24020001, 0x46000803, 0x46001042, 0x44830000, 0x46010002, 0xe6400094,
];

const count = (buf: Buffer, words: readonly (number | null)[]) => {
  let n = 0;
  for (let at = 0; at + words.length * 4 <= buf.length; at += 4) {
    if (words.every((w, k) => w === null || buf.readUInt32LE(at + k * 4) === w)) n++;
  }
  return n;
};

/** Null if `game_task`'s AI reads the fields the idle cap writes, or why not. */
export function idleCapProblem(gameTask: Buffer): string | null {
  if (count(gameTask, GATE_SIGNATURE) !== 1) return "game_task's monster AI gate doesn't match";
  if (count(gameTask, THINK_SIGNATURE) !== 1) return "game_task's monster AI doesn't match";
  return null;
}

/** Null if `game_task`'s monster update reads the speed bonus the recoveries write, or why not. */
export function tailSpeedProblem(gameTask: Buffer): string | null {
  return count(gameTask, SPEED_SIGNATURE) === 1
    ? null
    : "game_task's monster speed code doesn't match";
}

/** The blob's externs for aggression's cap and speed. */
export const aggressionExterns = (
  aggression: Exclude<WhetstoneSettings["monsterAi.aggression"], "off">,
): Record<string, number> => ({
  rf_aggression_idle: AGGRESSION_IDLE_FRAMES[aggression],
  rf_aggression_speed: AGGRESSION_TAIL_SPEED[aggression],
});

/** Species the blob's table has room for (`blob/monsters.c`'s SPECIES). */
const SPECIES = 90;

/**
 * `MOTION_TAILS` as `blob/monsters.c` reads it (`rf_motion_tails`): u16 first
 * entry of each species, SPECIES + 1 of them, then u16 `record | (frame / 4)
 * << 8` entries (rounded up) sorted by record.
 */
export function encodeMotionTails(tails: Readonly<Record<number, string>> = MOTION_TAILS): Buffer {
  const entries: number[] = [];
  const index: number[] = [];
  for (let em = 0; em < SPECIES; em++) {
    index.push(entries.length);
    const list = (tails[em] ?? "")
      .split(" ")
      .filter(Boolean)
      .map((p) => p.split(":").map(Number) as [number, number])
      .sort((a, b) => a[0] - b[0]);
    for (const [record, frame] of list) {
      if (record > 0xff || frame > 0x3fc)
        throw new Error(`em${em} record ${record} frame ${frame} doesn't fit`);
      entries.push(record | (Math.ceil(frame / 4) << 8));
    }
  }
  index.push(entries.length);
  const out = Buffer.alloc((index.length + entries.length) * 2);
  [...index, ...entries].forEach((v, k) => out.writeUInt16LE(v, k * 2));
  return out;
}

/** The aggression blob code and the shared monster boosts it registers with. */
export const aggressionObjects = () => [
  ...decodeObjects(AGGRESSION_OBJECTS),
  ...decodeObjects(MONSTERS_OBJECTS),
];
