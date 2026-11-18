/**
 * Elite monsters (`elites.enabled`): now and then a large monster in a quest is a
 * stronger version of itself, and its quest pays more. Blob code
 * (`blob/elite.c`) rolls each large monster once when it shows up, on the
 * shared monster boosts (`blob/monsters.c`, on the code loader's quest
 * frame hook), which scale its health and attack; the rest it writes into
 * the game's own per-monster state.
 *
 * What the game does (found on the EU disc, the same offsets on JP):
 *
 * - A monster's attack multiplier, the quest's stat row times its rage
 *   multiplier, is cached at `+0x380` (f32; defense at `+0x384`). The game
 *   writes it at spawn, when rage starts and when rage ends, and its hits
 *   read it. The shared boosts multiply it again each time it changes.
 * - Rage: the species' parameters hang off its `game_task` table entry
 *   (`+0x1AC`, 0 for monsters that don't enrage): a meter threshold (s16),
 *   the rage's length in frames (s16), speed, attack and defense multipliers,
 *   and the meter's gain by health left. A monster copies the threshold to
 *   `+0x570` when it's set up, fills its meter at `+0x56E`, and when it's
 *   full starts rage: bit `0x20` of `+0x638`, `+0x56C` frames left.
 * - Speed: each frame a monster runs its animations at
 *   `2 × speed (+0x4B0) × (100 + +0x769) / 100`. Moves set `+0x769` (u8)
 *   for themselves and a change of move clears it; the blob sets it when 0.
 * - Size: `+0x274` (u16) is the size in percent and a `game_task` function
 *   scales the model (`+0x220`…) from it and the base scale at `+0x270`.
 *   The game itself grows a monster this way mid-quest. The quest's size
 *   record (what the Guild Card takes) is separate and left alone.
 * - Colour: each monster has its own copy of its model's materials, 16
 *   bytes each from the pointer at `+0x58` to the one at `+0x5C`: diffuse
 *   RGB, alpha, ambient RGB, then the texture. The EBOOT's model renderer
 *   sets each mesh's GE material from it every frame, so the blob tints an
 *   elite there and no other monster changes.
 * - The quest state (behind a global) counts the time left down at `+0x10`,
 *   which only rises when a new quest starts, and points at the quest file
 *   in memory (`+0x50`) and its reward tables (`+0x5C`). The reward screen
 *   rolls the main table (kind `0x8000`) as many times as its byte `+3`
 *   says (Luck skills add more), picking items by weight; the zenny and
 *   points come from the file's header (`+0x54`, `+0x3C`).
 * - The game's random numbers come from an EBOOT function `(object, k)`
 *   that steps the u16 state `k` of an object behind a global. The blob
 *   reads streams 0 and 1 to stir its own generator, without stepping them.
 *
 * Everything is found by code signatures, which match the EU and JP (FUC)
 * discs.
 */
import { OVL_HEADER_SIZE, type OvlFile } from "mhfu-extract/src/container/ovl.js";
import { ELITE_OBJECTS } from "../blob/elite-object.js";
import { decodeObjects } from "../blob/link.js";
import { MONSTERS_OBJECTS } from "../blob/monsters-object.js";
import { hiLo, jumpTarget, type Segment } from "./mips.js";

/**
 * The game's `rand(object, k)` (EU 0x088900C4): `sll v0,a1,1; lui at,hi;
 * addu v0,v0,a0; ori at,at,lo; addu a0,v0,at; lhu v1,0(a0)`. `null` words
 * are the `lui` and `ori` that hold the streams' offset.
 */
export const RAND_SIGNATURE = [0x00051040, null, 0x00441021, null, 0x00412021, 0x94830000];
const RAND_LUI = 0x3c010000;
const RAND_ORI = 0x34210000;

/**
 * In `game_task`'s HP function: `lui v0,hi; lw v0,lo(v0); lb v0,0x116(v0)`,
 * the quest state's stat table, through the global that holds it.
 */
const QUEST_STATE_WORDS = [0x3c020000, 0x8c420000, 0x80420116];
const QUEST_STATE_MASKS = [0xffff0000, 0xffff0000, 0xffffffff];

/** `game_task`'s size function (EU 0x09AC7668), exactly: `lhu v1,0x274(a0)` and the float maths. */
export const APPLY_SIZE_SIGNATURE = [
  0x94830274, 0x04620004, 0x00032842, 0x44830000, 0x10000006, 0x46800060, 0x30630001, 0x00a32825,
  0x44850000, 0x46800060, 0x46010840, 0x3c0342c8, 0x44830000, 0x46000843, 0xc4800270, 0x46010002,
];

const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);

function matchesAt(
  buf: Buffer,
  at: number,
  words: readonly (number | null)[],
  masks?: readonly number[],
) {
  return words.every(
    (w, k) => w === null || (word(buf, at + k * 4) & (masks?.[k] ?? 0xffffffff)) >>> 0 === w,
  );
}

function findAllIn(
  buf: Buffer,
  from: number,
  to: number,
  words: readonly (number | null)[],
  masks?: readonly number[],
) {
  const found: number[] = [];
  for (let at = from; at + words.length * 4 <= to; at += 4) {
    if (matchesAt(buf, at, words, masks)) found.push(at);
  }
  return found;
}

/** The blob's externs for elites, or why they can't be found. */
export function findEliteExterns(
  vanillaEboot: Buffer,
  segment: Segment,
  ovl: OvlFile,
  chance: number,
): Record<string, number> | string {
  const end = segment.offset + segment.size;
  const rands = findAllIn(vanillaEboot, segment.offset, end, RAND_SIGNATURE).filter(
    (at) =>
      (word(vanillaEboot, at + 4) & 0xffff0000) >>> 0 === RAND_LUI &&
      (word(vanillaEboot, at + 12) & 0xffff0000) >>> 0 === RAND_ORI,
  );
  if (rands.length !== 1) return "this EBOOT's random number code doesn't match";
  const randAt = rands[0]!;
  const rand = segment.vaddr + (randAt - segment.offset);
  const streams =
    (((word(vanillaEboot, randAt + 4) & 0xffff) << 16) |
      (word(vanillaEboot, randAt + 12) & 0xffff)) >>>
    0;

  // The object's global: what `lui r,hi; lw a0,lo(r)` loads just before most `jal rand`s.
  const holders = new Map<number, number>();
  for (let at = segment.offset + 8; at + 4 <= end; at += 4) {
    const w = word(vanillaEboot, at);
    if (w >>> 26 !== 0x03 || jumpTarget(w, segment.vaddr + (at - segment.offset)) !== rand) {
      continue;
    }
    const lw = word(vanillaEboot, at - 4);
    if (lw >>> 26 !== 0x23 || ((lw >>> 16) & 31) !== 4) continue;
    const base = (lw >>> 21) & 31;
    const lui = word(vanillaEboot, at - 8);
    if (lui >>> 26 !== 0x0f || ((lui >>> 16) & 31) !== base) continue;
    const holder = hiLo(lui, lw);
    holders.set(holder, (holders.get(holder) ?? 0) + 1);
  }
  const [[rng, uses] = [0, 0], [, next] = [0, 0]] = [...holders].sort((a, b) => b[1] - a[1]);
  if (uses < 20 || uses < next * 4) return "this EBOOT's random number object wasn't found";

  const gameTask = ovl.reader.buf;
  const quests = new Set(
    findAllIn(gameTask, OVL_HEADER_SIZE, gameTask.length, QUEST_STATE_WORDS, QUEST_STATE_MASKS).map(
      (at) => hiLo(word(gameTask, at), word(gameTask, at + 4)),
    ),
  );
  if (quests.size !== 1) return "game_task's quest state code doesn't match";

  const sizes = findAllIn(gameTask, OVL_HEADER_SIZE, gameTask.length, APPLY_SIZE_SIGNATURE);
  if (sizes.length !== 1) return "game_task's size code doesn't match";

  return {
    rf_quest: [...quests][0]!,
    rf_rng: rng,
    rf_rng_streams: streams,
    rf_apply_size: ovl.loadBase + sizes[0]!,
    rf_elite_chance: chance,
  };
}

/** The elite blob code and the shared monster boosts it registers with (`blob/monsters.c`). */
export const eliteObjects = () => [
  ...decodeObjects(ELITE_OBJECTS),
  ...decodeObjects(MONSTERS_OBJECTS),
];
