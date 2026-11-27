/**
 * The wait at the end of a quest (`quest.endWait`), and its setting in
 * Whetstone's START menu entry: an EBOOT patch holding a data word, which
 * the blob (`blob/quest-end.c`) changes. This patches the EBOOT, which
 * gives the word's address for the blob, per disc.
 *
 * What the game does (EU addresses; JP's code is the same, 8 bytes earlier):
 *
 * - The quest object (`*0x08A62C7C`, EU 0x09A05DC0 in a quest) runs a state
 *   machine once a frame (EU 0x0886B0E0, called from `game_task`): its byte
 *   `+0` is the state, `+1` the step in it, and `+0x710` a countdown in
 *   frames (30 a second). State 0 is the hunt. A quest that is completed or
 *   runs out of time goes to state 1 (one failed by fainting doesn't: state
 *   0 returns -1 when byte `+6` is 6, and the game goes back on its own):
 *   - step 0 shows the end message and sets the countdown to 150 (5 s,
 *     the "Quest Complete" banner);
 *   - step 1 counts it down, then picks the wait from the quest's flags
 *     (`+0x28`): 1800 frames with "Returning to village in 1 min.", or 600
 *     with "Returning to village in 20 secs." (gathering quests, seen in
 *     game; and a check of 0x08872B40's);
 *   - step 2 counts that down, then state 2 waits for every hunter of the
 *     party (in single player at once) and moves on to the reward screen.
 *   The hunter keeps control while the countdowns run: that's the time to
 *   carve.
 *
 * How Whetstone changes it:
 *
 * - Step 0's banner countdown is loaded from the low half of a data word,
 *   and step 1 takes the high half as the wait when it isn't 0 (with the
 *   20-second message; a wait of 1 with none), else picks as the game does.
 *   Treasure Hunting quests (flag 0x10, whose end message is "Treasure
 *   Hunters Quest Time Up!") always get the game's wait: it's their time to
 *   deliver what the hunter carries ("Deliveries possible for 20 secs!").
 *   Both steps are rewritten in place: step 0 loads the message table's ID
 *   in one word less, and step 1's choice in a few, so the data word takes
 *   the place of an unreached `li`.
 * - Without the blob the word is the disc's choice; the blob sets it to the
 *   save's choice (`blob/quest-end.c`). Normal is the game's own wait.
 */
import { decodeObjects } from "../blob/link.js";
import { QUEST_END_OBJECTS } from "../blob/quest-end-object.js";
import type { WhetstoneSettings } from "../settings.js";
import type { Report } from "../report.js";
import { codeSegment, findUnique, hi16, maskImmediates } from "./mips.js";

/** Each choice's banner and wait, in frames (30 a second); a wait of 0 is the game's own choice. */
export const QUEST_END_FRAMES = {
  normal: { banner: 150, wait: 0 },
  short: { banner: 150, wait: 600 },
  instant: { banner: 1, wait: 1 },
} as const;
export type QuestEnd = keyof typeof QUEST_END_FRAMES;
const CHOICES = Object.keys(QUEST_END_FRAMES) as QuestEnd[];

/** The data word: the banner in its low half, the wait in its high half. */
export const questEndWord = (choice: QuestEnd): number =>
  (QUEST_END_FRAMES[choice].banner | (QUEST_END_FRAMES[choice].wait << 16)) >>> 0;

/**
 * State 1's steps 0 to 2 (EU 0x0886B324-0x0886B4A0), from step 0's test of
 * the quest's flags to step 2's countdown. Words are compared with their
 * immediates masked (addresses differ between discs), except branches and
 * `li` constants, which must be the same.
 */
export const STEPS = [
  0x30420010, 0x50400002, 0x2402000c, 0x2402001a, 0x00021840, 0x3c02089b, 0x2442c5a0, 0x00431021,
  0x94450000, 0x3c02089d, 0x0e214547, 0x8c44c438, 0x00402821, 0x3c02089d, 0x0e20c1ef, 0x8c44bbec,
  0x82230001, 0x24020096, 0x24630001, 0xa2230001, 0x1000010c, 0xae220710, 0x2442ffff, 0x1c400109,
  0xae220710, 0x82230001, 0x3c020008, 0x24630001, 0xa2230001, 0x8e230028, 0x00621024, 0x50400030,
  0x24020708, 0x3c020020, 0x00621024, 0x50400013, 0x24020258, 0x0e21cad0, 0x02202021, 0x1440000e,
  0x00000000, 0x24020708, 0xae220710, 0x3c02089d, 0x8c44c438, 0x3c02089b, 0x0e214547, 0x9445c5a2,
  0x00402821, 0x3c02089d, 0x0e20c1ef, 0x8c44bbec, 0x100000ec, 0x00000000, 0x24020258, 0xae220710,
];
const BRANCH_OPS = new Set([0x01, 0x04, 0x05, 0x06, 0x07, 0x14, 0x15, 0x16, 0x17]);
const stepMask = (word: number): number => {
  const op = word >>> 26;
  if (BRANCH_OPS.has(op) || (op === 0x09 && ((word >>> 21) & 31) === 0)) return word >>> 0;
  return maskImmediates(word);
};
const SIGNATURE = STEPS.map(stepMask);

/** Byte offsets in the signature. */
const TABLE_LUI = 0x14; // lui $v0, hi(the end messages' ID table)
const TABLE_ADDIU = 0x18; // addiu $v0, $v0, lo(table)
const STEP0_CALLS = 0x24; // seven words: get the message, show it
const STEP0_NEW = 0x10; // step 0's words from here are rewritten...
const STEP0_END = 0x50; // ...up to its `b` out, which stays
const CHOOSE_CALL = 0x94; // the original's jal 0x08872B40 (EU)
const STEP1_NEW = 0x74; // step 1's choice, rewritten up to
/** The data word's offset: the 600 `li` that only the old choice reached. */
export const WORD = 0xd8;

/**
 * The new words from `STEP0_NEW` to `WORD` (inclusive), at `at` (the
 * signature's start), given the original words. Offsets in comments are
 * from `at`; the steps' shared exit is +0x484, the 20-second message +0xDC
 * and the one-minute message +0x140, as in the game.
 */
export function stepWords(at: number, original: (offset: number) => number): number[] {
  const word = at + WORD;
  const tableLo = original(TABLE_ADDIU) & 0xffff;
  const lo = (address: number) => address & 0xffff;
  const step0 = [
    0x00021840, // +0x10 sll $v1, $v0, 1: the message's index × 2
    original(TABLE_LUI), // +0x14 lui $v0, hi(table)
    0x00431021, // +0x18 addu $v0, $v0, $v1
    (0x94450000 | tableLo) >>> 0, // +0x1C lhu $a1, lo(table)($v0): its ID
    ...Array.from({ length: 7 }, (_, k) => original(STEP0_CALLS + k * 4)), // +0x20: show it
    0x82230001, // +0x3C lb $v1, 1($s1): the step
    (0x3c020000 | hi16(word)) >>> 0, // +0x40 lui $v0, hi(word)
    (0x94420000 | lo(word)) >>> 0, // +0x44 lhu $v0, lo(word)($v0): the banner
    0x24630001, // +0x48 addiu $v1, $v1, 1
    0xa2230001, // +0x4C sb $v1, 1($s1); then `b` out, `sw $v0, 0x710($s1)`
  ];
  const step1 = [
    (0x3c010000 | hi16(word + 2)) >>> 0, // +0x74 lui $at, hi(word + 2)
    (0x94280000 | lo(word + 2)) >>> 0, // +0x78 lhu $t0, lo(word + 2)($at): the wait
    0x8e230028, // +0x7C lw $v1, 0x28($s1): the quest's flags
    0x30610010, // +0x80 andi $at, $v1, 0x10: a Treasure Hunting quest...
    0x0001400b, // +0x84 movn $t0, $zero, $at: ...keeps the game's wait, its time to deliver
    0x1500000d, // +0x88 bnez $t0, +0xC0
    0x00621024, // +0x8C and $v0, $v1, $v0 ($v0 is 0x80000)
    0x5040002b, // +0x90 beql $v0, $zero, +0x140
    0x24020708, // +0x94 li $v0, 1800
    0x3c020020, // +0x98 lui $v0, 0x20
    0x00621024, // +0x9C and $v0, $v1, $v0
    0x5040000e, // +0xA0 beql $v0, $zero, +0xDC
    0x24020258, // +0xA4 li $v0, 600
    original(CHOOSE_CALL), // +0xA8 jal choose
    0x02202021, // +0xAC move $a0, $s1
    0x5440000a, // +0xB0 bnel $v0, $zero, +0xDC
    0x24020258, // +0xB4 li $v0, 600
    0x10000021, // +0xB8 b +0x140
    0x24020708, // +0xBC li $v0, 1800
    0x29010002, // +0xC0 slti $at, $t0, 2: a wait of 1...
    0x542000ef, // +0xC4 bnel $at, $zero, +0x484: ...leaves with no message
    0xae280710, // +0xC8 sw $t0, 0x710($s1)
    0x10000003, // +0xCC b +0xDC: any other gets the 20-second message
    0x01001021, // +0xD0 move $v0, $t0
    0x00000000, // +0xD4 (unreached)
  ];
  const words: number[] = [];
  for (let offset = STEP0_NEW; offset <= WORD; offset += 4) {
    if (offset < STEP0_END) words.push(step0[(offset - STEP0_NEW) / 4]!);
    else if (offset >= STEP1_NEW && offset < WORD) words.push(step1[(offset - STEP1_NEW) / 4]!);
    else if (offset === WORD) words.push(0);
    else words.push(original(offset));
  }
  return words;
}

/** Where the quest's end steps are in `eboot`, or why not. */
function findSteps(eboot: Buffer): { at: number; offset: number } | string {
  const segment = codeSegment(eboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const at = findUnique(eboot, segment, [SIGNATURE], stepMask)[0];
  if (at == null) return "this EBOOT's quest end doesn't match";
  return { at, offset: segment.offset + (at - segment.vaddr) };
}

/**
 * Patches the quest's end steps in `eboot` (a copy to edit) to take the
 * banner and wait from their data word, set to `choice`. Returns the word's
 * address, or why it can't.
 */
export function patchQuestEnd(eboot: Buffer, choice: QuestEnd): number | string {
  const found = findSteps(eboot);
  if (typeof found === "string") return found;
  const { at, offset } = found;
  const words = stepWords(at, (o) => eboot.readUInt32LE(offset + o));
  words.forEach((word, k) => eboot.writeUInt32LE(word >>> 0, offset + STEP0_NEW + k * 4));
  eboot.writeUInt32LE(questEndWord(choice), offset + WORD);
  return at + WORD;
}

/** The blob's externs: the word's address and the disc's choice + 1 (an extern's address is never 0). */
export function questEndExterns(word: number, settings: WhetstoneSettings): Record<string, number> {
  return {
    rf_quest_end: word,
    rf_quest_end_choice: CHOICES.indexOf(settings["quest.endWait"]) + 1,
  };
}

export const questEndObjects = () => decodeObjects(QUEST_END_OBJECTS);

/** What the disc starts with; `inGame` when the blob and the START menu entry are in. */
export function questEndReport(settings: WhetstoneSettings, inGame: boolean): Report {
  const choice = settings["quest.endWait"];
  const notes = [
    choice === "short"
      ? "After a quest, 5 s of banner and 20 s to carve before the rewards, for every quest."
      : choice === "instant"
        ? "After a quest, straight to the rewards: no banner wait and no time to carve."
        : "After a quest, the game's own wait.",
    inGame
      ? "It can be changed in game, from the START menu's Whetstone entry."
      : "It can't be changed in game on this disc.",
  ];
  return { title: "Quest end", notes, lines: [], summary: `Quest end: ${notes.join(" ")}` };
}
