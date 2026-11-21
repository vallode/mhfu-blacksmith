/**
 * Element by motion value (`weapons.elementMotion`): a Blademaster hit's
 * element grows on a curve with its motion value over a threshold,
 * `(mv / threshold)^1.5` when that's more than 1, so every swing of a slow
 * weapon carries more element and its big hits much more (at 26, a Great
 * Sword's side slash 1.6 times as much, its level 3 charge 8.7 times), and
 * fast weapons' small hits stay as they were. Status grows in step with
 * the motion value over the same threshold.
 *
 * What the game does (found on the EU disc, the same code on JP):
 *
 * - Each melee swing builds an attack in `game_task` (EU 0x09B6834C,
 *   `(attack)`, the hunter at `+0x10`). It copies the move's 24-byte row
 *   from the motion value table (EU 0x09BFBEF8, pointed to from
 *   0x09BFC948) to the attack's `+0x1C`, so the motion value is the u8 at
 *   `+0x1E`.
 * - It then asks an EBOOT getter `(hunter, kind)` (EU 0x088DA398) for the
 *   equipped weapon's fire, water, thunder, dragon and ice (kinds 0 to 3
 *   and 7), and every third swing (the hunter's frame counter at `+0x322`)
 *   for poison, paralysis and sleep (4 to 6). Each one it has sets a flag
 *   in the attack's `+0x28` and its value (a tenth of what the game shows)
 *   in the u8 at `+0x2A`. The motion value never enters into it, so a
 *   Dual Blades slash with motion value 7 carries as much element as a
 *   charged Great Sword slash with 110.
 * - Then it rolls affinity (kind 8): a critical hit multiplies the motion
 *   value by 1.25 (0.75 when negative), in floats, and sets a flag in
 *   `+0x2B`. The same function later multiplies `+0x2A` by 1.125 for the
 *   element skills, clamped to 255.
 * - When the attack hits a monster, game_sub's hit function (EU
 *   0x09C43458) turns `+0x2A` into a float for the element the attack has
 *   and multiplies it by the part's elemental hitzone over 100
 *   (`ELEMENT_READS`); status goes to the monster's buildup counters
 *   (EU 0x09C44F08) as it is.
 *
 * Status is scaled in game_task: the patch rewrites the affinity code (99
 * words from EU 0x09B687C4) with integer maths, which gives the same
 * motion values for every u8 input (0.75 and 1.25 are exact, and the
 * truncated products are 3m/4 and 5m/4), and uses the room it frees to
 * scale `+0x2A` first, by the motion value before the critical hit:
 * `min(255, round(value × mv / threshold))`, when the motion value is over
 * the threshold, the swing asked for the weapon's attributes (`$s0`) and
 * the attack has no element. Kicks, Felyne comrades, bows' arrows and
 * bowgun shots build their attacks elsewhere and don't change.
 *
 * An element is scaled in game_sub, as the float it becomes, so it has no
 * u8 cap: `value × f × √f`, `f = mv / threshold`, when a Blademaster
 * hunter's swing has a motion value over the threshold. The motion value is
 * the one before any critical hit, worked back from `+0x2B` (exactly for a
 * critical, to within one for a negative one), so affinity leaves the element
 * alone, as in the game. Only motion rows of types 0 to 3 (`+0x1F`), the
 * ones the weapons' table has, count: the hit function deals type 0xB as
 * fixed damage, its `+0x1E` the damage. The curve, not a straight `value × f`, is what puts an
 * elemental weapon ahead of a raw one by more the harder it hits: a hit's
 * raw damage already grows in step with its motion value.
 *
 * Each part is found by one code signature, which matches the EU and JP
 * (FUC) discs: game_task's whole region with only the getter's address
 * masked, game_sub's as it is.
 */
import { OVL_HEADER_SIZE, type OvlFile } from "mhfu-extract/src/container/ovl.js";
import type { Edits } from "../edits.js";
import type { LoadedOverlay } from "../game/load.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import {
  ADDIU,
  ADDU,
  ANDI,
  Assembler,
  BEQ,
  BEQL,
  BNE,
  BNEL,
  LBU,
  LHU,
  ORI,
  R,
  REGIMM,
  SB,
  SLL,
  SLTIU,
} from "./mips.js";

/** The attack's `+0x28` flags for fire, water, thunder, ice and dragon; 1, 2 and 4 are statuses. */
const ELEMENT_FLAGS = 0x1f0;

/**
 * The affinity code, from `lbu v0,0x2b(s2)` after the element getters to
 * the `lbu v1,0x1e8(s1)` after it (EU 0x09B687C4). Word 7 is the getter's
 * `jal`, whose target differs between discs.
 */
export const AFFINITY_CODE = [
  0x9242002b, 0x3042003f, 0xa242002b, 0x92420089, 0x5440004b, 0x9242001e, 0x02202021, 0x0e2368e6,
  0x24050008, 0x7c022620, 0x50800059, 0x922301e8, 0x922205f2, 0x1c400008, 0x00000000, 0x922301e8,
  0x24020001, 0x10620004, 0x00000000, 0x24020005, 0x1462004e, 0x00000000, 0x0483001e, 0x96230322,
  0x00041023, 0x96240322, 0x24030064, 0x0083001a, 0x00001810, 0x0062082a, 0x10200044, 0x00000000,
  0x9242001e, 0x04420004, 0x00021842, 0x44820000, 0x10000006, 0x46800060, 0x30420001, 0x00621825,
  0x44830000, 0x46800060, 0x46010840, 0x3c023f40, 0x44820000, 0x46010002, 0x4600000d, 0x44020000,
  0xa242001e, 0x9242002b, 0x34420040, 0x1000002f, 0xa242002b, 0x24020064, 0x0062001a, 0x00001010,
  0x0044082a, 0x10200029, 0x00000000, 0x9242001e, 0x04420004, 0x00021842, 0x44820000, 0x10000006,
  0x46800060, 0x30420001, 0x00621825, 0x44830000, 0x46800060, 0x46010840, 0x3c023fa0, 0x44820000,
  0x46010002, 0x4600000d, 0x44020000, 0xa242001e, 0x9242002b, 0x34420080, 0x10000014, 0xa242002b,
  0x04420004, 0x00021842, 0x44820000, 0x10000006, 0x46800060, 0x30420001, 0x00621825, 0x44830000,
  0x46800060, 0x46010840, 0x3c023fa0, 0x44820000, 0x46010002, 0x4600000d, 0x44020000, 0xa242001e,
  0x9242002b, 0x34420080, 0xa242002b,
];
const GETTER_CALL = 7;
/** The first three words stay: `0x9B687C8` is a branch target (`beqzl s0`, when no getter ran). */
const KEPT = 3;

/** Motion value thresholds the setting allows. */
export const MIN_THRESHOLD = 10;
export const MAX_THRESHOLD = 40;

const MULT = 0x18;
const DIV = 0x1a;
const DIVU = 0x1b;
const MFHI = 0x10;
const MFLO = 0x12;
const SLT = 0x2a;
const SUBU = 0x23;
const SRL = 0x02;
const BGTZ = 0x07;
const BGEZL = 0x03;

/** Where the affinity code is in `game_task`, as a file offset, or null if it isn't there once. */
export function findAffinityCode(ovl: OvlFile): number | null {
  const buf = ovl.reader.buf;
  let found: number | null = null;
  for (let at = OVL_HEADER_SIZE; at + AFFINITY_CODE.length * 4 <= buf.length; at += 4) {
    let match = true;
    for (let k = 0; k < AFFINITY_CODE.length; k++) {
      const mask = k === GETTER_CALL ? 0xfc000000 : 0xffffffff;
      if ((buf.readUInt32LE(at + k * 4) & mask) >>> 0 !== (AFFINITY_CODE[k]! & mask) >>> 0) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    if (found !== null) return null;
    found = at;
  }
  return found;
}

/**
 * The words after the kept three: the element scaling, then the affinity
 * code in integers, padded with `nop`s to the same length. `getterCall`
 * and `seh` are the game's own words. In: `$s0` set when the getters ran,
 * `$s1` the hunter, `$s2` the attack. Uses `$t0`–`$t2` and `$at`, which
 * no code after it reads first (every path to it but the critical one
 * calls the getter).
 */
export function assembleAffinity(threshold: number, getterCall: number, seh: number): number[] {
  const a = new Assembler();
  const { zero, at, v0, v1, a0, a1, t0, t1, t2 } = R;
  const s0 = 16;
  const s1 = 17;
  const s2 = 18;
  const move = (rd: number, rs: number) => a.r(rs, zero, rd, 0, ADDU);
  const nop = () => a.emit(0);

  // Status: min(255, round(value × mv / threshold)) when mv > threshold. An
  // element is left to game_sub (`assembleElementReads`), which has no cap.
  a.branch(BEQ, s0, zero, "affinity");
  a.i(LBU, s2, t0, 0x1e);
  a.i(LHU, s2, t2, 0x28);
  a.i(ANDI, t2, t2, ELEMENT_FLAGS);
  a.branch(BNE, t2, zero, "affinity");
  a.i(SLTIU, t0, at, threshold + 1);
  a.branch(BNE, at, zero, "affinity");
  a.i(LBU, s2, t1, 0x2a);
  a.r(t1, t0, 0, 0, MULT);
  a.i(ADDIU, zero, t2, threshold);
  a.r(0, 0, t1, 0, MFLO);
  a.i(ADDIU, t1, t1, threshold >> 1);
  a.r(t1, t2, 0, 0, DIVU);
  a.r(0, 0, t1, 0, MFLO);
  a.i(SLTIU, t1, at, 0x100);
  a.branch(BEQL, at, zero, "store");
  a.i(ADDIU, zero, t1, 0xff);
  a.label("store");
  a.i(SB, s2, t1, 0x2a);

  // Affinity, as the game does it: kind 8 from the getter, rolled against
  // the frame counter, unless the attack is a forced critical (`+0x89`).
  a.label("affinity");
  a.i(LBU, s2, v0, 0x89);
  a.branch(BNEL, v0, zero, "critical");
  a.i(LBU, s2, v0, 0x1e);
  move(a0, s1);
  a.emit(getterCall);
  a.i(ADDIU, zero, a1, 8);
  a.emit(seh); // seh a0, v0
  a.branch(BEQL, a0, zero, "end");
  a.i(LBU, s1, v1, 0x1e8);
  a.i(LBU, s1, v0, 0x5f2);
  a.branch(BGTZ, v0, zero, "roll");
  nop();
  a.i(LBU, s1, v1, 0x1e8);
  a.i(ADDIU, zero, v0, 1);
  a.branch(BEQ, v1, v0, "roll");
  nop();
  a.i(ADDIU, zero, v0, 5);
  a.branch(BNE, v1, v0, "end");
  nop();
  a.label("roll");
  a.branch(REGIMM, a0, BGEZL, "positive");
  a.i(LHU, s1, v1, 0x322);
  a.r(zero, a0, v0, 0, SUBU); // negu v0, a0
  a.i(LHU, s1, a0, 0x322);
  a.i(ADDIU, zero, v1, 100);
  a.r(a0, v1, 0, 0, DIV);
  a.r(0, 0, v1, 0, MFHI);
  a.r(v1, v0, at, 0, SLT);
  a.branch(BEQ, at, zero, "end");
  nop();
  a.i(LBU, s2, v0, 0x1e); // mv × 3 / 4
  a.r(0, v0, v1, 1, SLL);
  a.r(v0, v1, v0, 0, ADDU);
  a.r(0, v0, v0, 2, SRL);
  a.i(SB, s2, v0, 0x1e);
  a.i(LBU, s2, v0, 0x2b);
  a.i(ORI, v0, v0, 0x40);
  a.branch(BEQ, zero, zero, "end");
  a.i(SB, s2, v0, 0x2b);
  a.label("positive");
  a.i(ADDIU, zero, v0, 100);
  a.r(v1, v0, 0, 0, DIV);
  a.r(0, 0, v0, 0, MFHI);
  a.r(v0, a0, at, 0, SLT);
  a.branch(BEQ, at, zero, "end");
  nop();
  a.i(LBU, s2, v0, 0x1e);
  a.label("critical"); // mv × 5 / 4, as a byte
  a.r(0, v0, v1, 2, SLL);
  a.r(v0, v1, v0, 0, ADDU);
  a.r(0, v0, v0, 2, SRL);
  a.i(SB, s2, v0, 0x1e);
  a.i(LBU, s2, v0, 0x2b);
  a.i(ORI, v0, v0, 0x80);
  a.i(SB, s2, v0, 0x2b);

  // "end" is the game's next word, after the region: pad up to it.
  const room = AFFINITY_CODE.length - KEPT;
  if (a.length > room) {
    throw new Error(`Element by motion value is ${a.length} words, room for ${room}`);
  }
  while (a.length < room) nop();
  a.label("end");
  return a.link();
}

/**
 * Where game_sub's hit function (EU 0x09C43458, JP 0x09C3E448) reads the
 * attack's element (EU 0x09C4383C, JP 0x09C3E82C, the same words): for each
 * element flag in `+0x28` it turns the u8 at `+0x2A` into a float (fire
 * `$f24`, water `$f22`, ice `$f20`, thunder `$f23`, dragon `$f21`), which it
 * later multiplies by the hit part's elemental hitzone over 100 and sums
 * into the hit's element damage. The attack is `$s5`, its owner `$s4` (null
 * for none). `0x09C43840` is a branch target, with `$v0` the flags.
 */
export const ELEMENT_READS = [
  0x96a20028, 0x30430010, 0x5060000e, 0x30430020, 0x92a3002a, 0x04620005, 0x00032042, 0x44830000,
  0x10000007, 0x46800620, 0x00032042, 0x30630001, 0x00832025, 0x44840000, 0x46800620, 0x4618c600,
  0x30430020, 0x5060000e, 0x30430080, 0x92a3002a, 0x04620005, 0x00032042, 0x44830000, 0x10000007,
  0x468005a0, 0x00032042, 0x30630001, 0x00832025, 0x44840000, 0x468005a0, 0x4616b580, 0x30430080,
  0x5060000e, 0x30430040, 0x92a3002a, 0x04620005, 0x00032042, 0x44830000, 0x10000007, 0x46800520,
  0x00032042, 0x30630001, 0x00832025, 0x44840000, 0x46800520, 0x4614a500, 0x30430040, 0x5060000e,
  0x30420100, 0x92a3002a, 0x04620005, 0x00032042, 0x44830000, 0x10000007, 0x468005e0, 0x00032042,
  0x30630001, 0x00832025, 0x44840000, 0x468005e0, 0x4617bdc0, 0x30420100, 0x5040000e, 0x02a02021,
  0x92a2002a, 0x04420005, 0x00021842, 0x44820000, 0x10000007, 0x46800560, 0x00021842, 0x30420001,
  0x00621825, 0x44830000, 0x46800560, 0x4615ad40,
];

/** Where the element reads are in `game_sub`, as a file offset, or null if they aren't there once. */
export function findElementReads(ovl: OvlFile): number | null {
  const buf = ovl.reader.buf;
  let found: number | null = null;
  for (let at = OVL_HEADER_SIZE; at + ELEMENT_READS.length * 4 <= buf.length; at += 4) {
    let match = true;
    for (let k = 0; k < ELEMENT_READS.length; k++) {
      if (buf.readUInt32LE(at + k * 4) !== ELEMENT_READS[k]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    if (found !== null) return null;
    found = at;
  }
  return found;
}

/** A Blademaster's weapon: the hunter's `+0x4E9` (the weapon getter's test). */
const BLADEMASTER = 5;

/**
 * The element reads, each element `value × (mv / threshold)^1.5` as a float
 * when a Blademaster hunter's swing (a motion row type 0 to 3 at `+0x1F`)
 * has a motion value (`+0x1E`, before any critical hit) over the threshold,
 * and `value` otherwise; padded with `nop`s to the same length. Uses `$v1`,
 * `$a0`, `$a1`, `$at`, `$f0` and `$f1`, which the call right after it
 * clobbers.
 */
export function assembleElementReads(threshold: number): number[] {
  const a = new Assembler();
  const { zero, at, v0, v1, a0, a1 } = R;
  const s4 = 20;
  const s5 = 21;
  const cop1 = (word: number) => a.emit(word);
  const mtc1 = (rt: number, fs: number) => cop1(0x44800000 | (rt << 16) | (fs << 11));
  const cvtSW = (fd: number, fs: number) => cop1(0x46800020 | (fs << 11) | (fd << 6));
  const divS = (fd: number, fs: number, ft: number) =>
    cop1(0x46000003 | (ft << 16) | (fs << 11) | (fd << 6));
  const mulS = (fd: number, fs: number, ft: number) =>
    cop1(0x46000002 | (ft << 16) | (fs << 11) | (fd << 6));
  const sqrtS = (fd: number, fs: number) => cop1(0x46000004 | (fs << 11) | (fd << 6));
  const movS = (fd: number, fs: number) => cop1(0x46000006 | (fs << 11) | (fd << 6));
  const plain = () => a.i(ADDIU, zero, a0, threshold);

  a.i(LHU, s5, v0, 0x28); // the game's own first word
  // The branch target: the factor's numerator in $a0, the threshold unless
  // a Blademaster hunter's swing has a motion value over it.
  a.i(LBU, s5, v1, 0x2a);
  a.i(LBU, s5, a0, 0x1e);
  // The motion value before a critical hit: the affinity code stored
  // floor(5m / 4) (flag 0x80) or floor(3m / 4) (0x40); ceil(4x / 5) is m
  // again, ceil(4x / 3) m or one less.
  a.i(LBU, s5, at, 0x2b);
  a.i(ANDI, at, a1, 0x80);
  a.branch(BEQ, a1, zero, "notCritical");
  a.i(ANDI, at, a1, 0x40);
  a.i(ADDIU, zero, a1, 5);
  a.branch(BEQ, zero, zero, "uncrit");
  a.i(ADDIU, zero, at, 4);
  a.label("notCritical");
  a.branch(BEQ, a1, zero, "base");
  a.i(ADDIU, zero, a1, 3);
  a.i(ADDIU, zero, at, 2);
  a.label("uncrit"); // a0 = (4 × a0 + at) / a1
  a.r(0, a0, a0, 2, SLL);
  a.r(a0, at, a0, 0, ADDU);
  a.r(a0, a1, 0, 0, DIVU);
  a.r(0, 0, a0, 0, MFLO);
  a.label("base");
  // Only a weapon's motion row (types 0 to 3 at +0x1F; type 0xB is fixed
  // damage, its +0x1E the damage), over the threshold.
  a.i(LBU, s5, at, 0x1f);
  a.i(SLTIU, at, at, 4);
  a.branch(BEQL, at, zero, "scale");
  plain();
  a.i(SLTIU, a0, at, threshold + 1);
  a.branch(BNEL, at, zero, "scale");
  plain();
  a.branch(BEQL, s4, zero, "scale");
  plain();
  a.i(LBU, s5, at, 0x0f); // the owner's kind: 0 a hunter
  a.branch(BNEL, at, zero, "scale");
  plain();
  a.i(LBU, s4, at, 0x4e9);
  a.i(ADDIU, zero, a1, BLADEMASTER);
  a.branch(BNEL, at, a1, "scale");
  plain();
  // value × f × √f, f = $a0 / threshold: 1 exactly when $a0 is the threshold.
  a.label("scale");
  mtc1(a0, 0);
  cvtSW(0, 0);
  a.i(ADDIU, zero, a1, threshold);
  mtc1(a1, 1);
  cvtSW(1, 1);
  divS(0, 0, 1);
  sqrtS(1, 0);
  mulS(0, 0, 1);
  mtc1(v1, 1);
  cvtSW(1, 1);
  mulS(0, 1, 0);
  // Each element the attack has, in the game's registers.
  for (const [flag, reg] of [
    [0x10, 24],
    [0x20, 22],
    [0x80, 20],
    [0x40, 23],
    [0x100, 21],
  ] as const) {
    a.i(ANDI, v0, v1, flag);
    a.branch(BNEL, v1, zero, `skip${flag}`);
    movS(reg, 0);
    a.label(`skip${flag}`);
  }
  a.branch(BEQ, zero, zero, "end");
  a.emit(0);

  const room = ELEMENT_READS.length;
  if (a.length > room) {
    throw new Error(`Element reads are ${a.length} words, room for ${room}`);
  }
  while (a.length < room) a.emit(0);
  a.label("end");
  return a.link();
}

const TITLE = "Element by motion value";

/** Writes the patch into `game_task` and `game_sub`, or says why it can't. */
export function patchElementMotion(
  gameTask: LoadedOverlay,
  gameSub: LoadedOverlay,
  threshold: number,
  edits: Edits,
): ShuffleReport {
  const at = findAffinityCode(gameTask.ovl);
  const reads = findElementReads(gameSub.ovl);
  if (at === null || reads === null) {
    const which = at === null ? "game_task" : "game_sub";
    return {
      title: TITLE,
      notes: [`Not applied: this disc's ${which} code doesn't match.`],
      lines: [],
      summary: `${TITLE}: not applied (${which}'s code doesn't match)`,
    };
  }
  const vanilla = gameTask.ovl.reader.buf;
  const words = assembleAffinity(
    threshold,
    vanilla.readUInt32LE(at + GETTER_CALL * 4),
    vanilla.readUInt32LE(at + 9 * 4),
  );
  const task = edits.overlay(gameTask);
  words.forEach((w, k) => task.writeUInt32LE(w, at + (KEPT + k) * 4));
  const sub = edits.overlay(gameSub);
  assembleElementReads(threshold).forEach((w, k) => sub.writeUInt32LE(w, reads + k * 4));
  const factor = (mv: number) => Math.max(1, (mv / threshold) ** 1.5).toFixed(1);
  return {
    title: TITLE,
    notes: [
      `A Blademaster swing carries its weapon's element times (motion value / ${threshold})^1.5, when that's more than 1: a Great Sword's side slash (motion value 36) ${factor(36)} times as much, its draw slash (48) ${factor(48)}, its level 3 charge (110) ${factor(110)}; a hit with motion value ${threshold} or less (Dual Blades hits are 6 to 25) the same as before. Status builds up times motion value / ${threshold}, up to 2550 shown a hit.`,
      "The weapon screens show the usual values. Both use the motion value before any critical hit, so affinity changes neither, as in the game. The element skills multiply first.",
    ],
    lines: [],
    summary: `${TITLE}: from motion value ${threshold}`,
  };
}
