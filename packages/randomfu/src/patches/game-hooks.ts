/**
 * Game hooks for blob code (see `docs/code-loader.md`): game calls pointed at
 * stubs in the Guild Card cave that make the call, then run the blob's
 * `rf_hookN` if a blob is loaded. Blob features register for them in C
 * (`blob/rf.h`, `blob/runtime.c`).
 *
 * What the game does (found on the EU and JP discs):
 *
 * - `game_task.ovl` (quests) updates the HUD once a frame through an EBOOT
 *   function on the HUD object (EU 0x0883F270), from two places: its frame
 *   step, and the step it runs while paused. The HUD object is a global; it
 *   sits right after the save struct.
 * - That update draws the HUD in layers. The hunter's health and stamina
 *   gauges are one EBOOT function (EU 0x088405E4), called from one place
 *   (EU 0x0883FA68) only when the gauges show: not in cutscenes or when the
 *   HUD is hidden. The function returns at once when bit 1 of the HUD's
 *   `+0x1194` is set.
 * - The main loop reads the pad once a frame, before it runs the current
 *   task, with an EBOOT function on the pad object (EU 0x08868F50, from EU
 *   0x0888FD5C): the raw PSP buttons go to the object's first halfword, the
 *   stick to `+2` and `+4`, and what the game works out from the stick to
 *   the words after. It gets them from the system's controller read (its
 *   one call, padRead `+0x14`, into a `SceCtrlData` on its stack: buttons a
 *   u32 at `+4`, the stick bytes at `+8`, `+9`). When the game wants no input
 *   (shops, dialogues, menus) it sets the object's `+0x17`, and the function
 *   clears the first 16 bytes instead, so the hunter stands still.
 * - A completed quest's rewards are rolled into the save's reward box by an
 *   EBOOT function (EU 0x0886F894; see `poogie-luck.ts`), called once, from
 *   the EBOOT's quest results step (EU 0x08875284) that `game_task` runs
 *   before the reward screen. It ends by sorting the box.
 *
 * Hooks, by index (`rf_hookN`):
 *
 * 0. Quest frame: both `game_task` calls to the HUD update.
 * 1. HUD: the call to the gauge function. Blob code drawing here with the
 *    HUD's routines draws in the gauges' layer.
 * 2. Pad: the pad read's call to the controller read, once a frame in every
 *    task. Blob code gets the raw `SceCtrlData`, so it sees the buttons even
 *    while it keeps them from the game with the pad object's `+0x17`.
 * 3. Rewards: the call to the reward roll, once a completed quest, just
 *    after the box is filled and before the reward screen shows it.
 *
 * A stub saves the call's arguments' first register and its result, so the
 * hook gets the HUD object (the `SceCtrlData` for hook 2, the results step's
 * object for hook 3) in `$a0` and the
 * caller its `$v0`. Everything is
 * found by code signatures, which match the EU and JP (FUC) discs.
 */
import { BLOB_MAGIC, HEADER } from "../blob/link.js";
import { QUEST_REWARD_SIGNATURE } from "./poogie-luck.js";
import {
  ADDIU,
  Assembler,
  BEQ,
  BNE,
  JR,
  LUI,
  LW,
  ORI,
  R,
  RA,
  SLL,
  SP,
  SW,
  codeSegment,
  findUnique,
  hi16,
  jalTo,
  jumpTarget,
  type Segment,
} from "./mips.js";

export const HOOK = { questFrame: 0, hud: 1, pad: 2, rewards: 3 } as const;

/** The HUD update (EU 0x0883F270), masked (see `maskWord`). */
export const HUD_UPDATE_SIGNATURE = [
  0x27bdffe0, 0xafbf0000, 0xafb10000, 0xafb00000, 0x3c030000, 0x8c630000, 0x8c630000, 0x14600184,
  0x00808821, 0x3c020000, 0x8c440000, 0x0c000000, 0x24050000, 0x304300ff,
];
/**
 * The health and stamina gauges (EU 0x088405E4): it returns at once when
 * `lw $v1, 0x1194($a0)` has bit 1 set.
 */
export const GAUGES_SIGNATURE = [
  0x27bdffd0, 0xafbf0000, 0xafb20000, 0xafb10000, 0xafb00000, 0x8c830000, 0x30630002, 0x14600169,
  0x00809021, 0x3c020000, 0x3442c010, 0xafa20000, 0x3c020000, 0x3442f000, 0xafa20000, 0x3c020000,
  0x8c420000, 0x8c440000, 0x8c990000, 0x8f390000, 0x0320f809, 0x8e510000, 0x9043003c, 0x24020000,
];

/** The pad read (EU 0x08868F50), masked: it reads the pad and checks the object's `+0x17`. */
/** padRead's call to the controller read (`jal`; `li $a1, 1`), from its start. */
const CTRL_READ_CALL = 0x14;
export const PAD_READ_SIGNATURE = [
  0x27bdffd0, 0xafbf0000, 0xafb00000, 0x00808021, 0x27a40020, 0x0c000000, 0x24050000, 0x58400010,
  0x92030017, 0x8fa40000, 0x3c030000, 0x00831824,
];

const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);
const isJalTo = (w: number, pc: number, target: number) =>
  w >>> 26 === 0x03 && jumpTarget(w, pc) === target;

export interface HookSites {
  segment: Segment;
  hudUpdate: number;
  gauges: number;
  /** File offsets in `game_task.ovl` of its `jal hudUpdate`s. */
  questFrame: number[];
  /** ELF offset of the EBOOT's `jal gauges`. */
  hud: number;
  padRead: number;
  /** The controller read padRead calls, and that call's vaddr (padRead `+0x14`). */
  ctrlRead: number;
  ctrl: number;
  /** The main loop's `jal padRead`, a vaddr: `lui; jal; lw $a0` (the pad object's global). */
  pad: number;
  /** The quest reward roll, and the vaddr of its one call. */
  rewardRoll: number;
  rewards: number;
}

/** The start of the function holding `vaddr`: the nearest `addiu $sp, $sp, -n` before it. */
function functionStart(
  eboot: Buffer,
  segment: Segment,
  vaddr: number,
  limit = 0x800,
): number | null {
  for (let at = vaddr; at >= vaddr - limit && at >= segment.vaddr; at -= 4) {
    const w = word(eboot, segment.offset + (at - segment.vaddr));
    if (w >>> 16 === 0x27bd && w & 0x8000) return at;
  }
  return null;
}

/** The hooks' call sites, or why they can't be found. */
export function findHookSites(
  vanillaEboot: Buffer,
  gameTask: Buffer,
  gameTaskBase: number,
): HookSites | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const [hudUpdate, gauges, padRead, rewardWalk] = findUnique(vanillaEboot, segment, [
    HUD_UPDATE_SIGNATURE,
    GAUGES_SIGNATURE,
    PAD_READ_SIGNATURE,
    QUEST_REWARD_SIGNATURE,
  ]);
  if (hudUpdate == null || gauges == null) return "this EBOOT's HUD code doesn't match";
  if (padRead == null) return "this EBOOT's pad code doesn't match";
  const rewardRoll = rewardWalk == null ? null : functionStart(vanillaEboot, segment, rewardWalk);
  if (rewardRoll == null) return "this EBOOT's quest reward code doesn't match";
  const offsetOf = (vaddr: number) => segment.offset + (vaddr - segment.vaddr);
  if (word(vanillaEboot, offsetOf(gauges) + 0x14) !== 0x8c831194) {
    return "this EBOOT's HUD code doesn't match";
  }

  const hud: number[] = [];
  const pad: number[] = [];
  const rewards: number[] = [];
  for (let at = segment.offset; at + 4 <= segment.offset + segment.size; at += 4) {
    const vaddr = segment.vaddr + (at - segment.offset);
    if (isJalTo(word(vanillaEboot, at), vaddr, gauges)) hud.push(at);
    if (isJalTo(word(vanillaEboot, at), vaddr, rewardRoll)) rewards.push(vaddr);
    if (
      isJalTo(word(vanillaEboot, at), vaddr, padRead) &&
      word(vanillaEboot, at - 4) >>> 26 === 0x0f &&
      word(vanillaEboot, at + 4) >>> 21 === ((0x23 << 5) | 2) // lw $a0, lo($v0)
    ) {
      pad.push(vaddr);
    }
  }
  const questFrame: number[] = [];
  for (let at = 0; at + 4 <= gameTask.length; at += 4) {
    if (isJalTo(word(gameTask, at), gameTaskBase + at, hudUpdate)) questFrame.push(at);
  }
  if (hud.length !== 1 || questFrame.length !== 2) return "this game's HUD calls don't match";
  if (pad.length !== 1) return "this EBOOT's main loop doesn't match";
  if (rewards.length !== 1) return "this EBOOT's quest reward code doesn't match";
  const ctrl = padRead + CTRL_READ_CALL;
  const ctrlCall = word(vanillaEboot, offsetOf(ctrl));
  if (ctrlCall >>> 26 !== 0x03) return "this EBOOT's pad code doesn't match";
  const ctrlRead = jumpTarget(ctrlCall, ctrl);
  return {
    segment,
    hudUpdate,
    gauges,
    questFrame,
    hud: hud[0]!,
    padRead,
    ctrlRead,
    ctrl,
    pad: pad[0]!,
    rewardRoll,
    rewards: rewards[0]!,
  };
}

/**
 * The hook code at `at`: `dispatch(arg, hook)` jumps to the blob's
 * `rf_hookN` when the blob's magic is there and it defines one; then a stub
 * per hook that makes the game's call and dispatches.
 */
export function assembleHooks(
  at: number,
  blob: number,
  originals: readonly { hook: number; target: number }[],
): { code: number[]; stubs: number[] } {
  const a = new Assembler();
  const { zero, v0, a0, a1, t0, t1, t2, t3, t9 } = R;
  const nop = () => a.emit(0);

  for (const [k, { hook, target }] of originals.entries()) {
    // A 32-byte frame: sp+0..15 stay free for the O32 blob code it reaches.
    a.label(`stub${k}`);
    a.i(ADDIU, SP, SP, -32);
    a.i(SW, SP, RA, 24);
    a.jal(target);
    a.i(SW, SP, a0, 16);
    a.i(SW, SP, v0, 20);
    a.i(LW, SP, a0, 16);
    a.jalLabel("dispatch");
    a.i(ADDIU, zero, a1, hook);
    a.i(LW, SP, v0, 20);
    a.i(LW, SP, RA, 24);
    a.r(RA, zero, zero, 0, JR);
    a.i(ADDIU, SP, SP, 32);
  }

  a.label("dispatch");
  a.i(LUI, zero, t0, hi16(blob));
  a.i(ADDIU, t0, t0, blob & 0xffff);
  a.i(LW, t0, t1, HEADER.magic);
  a.i(LUI, zero, t2, BLOB_MAGIC >>> 16);
  a.i(ORI, t2, t2, BLOB_MAGIC & 0xffff);
  a.branch(BNE, t1, t2, "none");
  a.r(zero, a1, t3, 2, SLL);
  a.r(t3, t0, t3, 0, 0x21);
  a.i(LW, t3, t9, HEADER.hooks);
  a.branch(BEQ, t9, zero, "none");
  nop();
  a.r(t9, zero, zero, 0, JR);
  nop();
  a.label("none");
  a.r(RA, zero, zero, 0, JR);
  nop();

  return {
    code: a.link(at),
    stubs: originals.map((_, k) => at + a.offsetOf(`stub${k}`) * 4),
  };
}

export const hookCode = (sites: HookSites) => [
  { hook: HOOK.questFrame, target: sites.hudUpdate },
  { hook: HOOK.hud, target: sites.gauges },
  { hook: HOOK.pad, target: sites.ctrlRead },
  { hook: HOOK.rewards, target: sites.rewardRoll },
];

/** Points the game's calls at the stubs (`stubs` in `hookCode` order). */
export function writeHookCalls(
  eboot: Buffer,
  gameTask: Buffer,
  sites: HookSites,
  stubs: readonly number[],
): void {
  for (const at of sites.questFrame) gameTask.writeUInt32LE(jalTo(stubs[0]!), at);
  eboot.writeUInt32LE(jalTo(stubs[1]!), sites.hud);
  const offsetOf = (vaddr: number) => sites.segment.offset + (vaddr - sites.segment.vaddr);
  eboot.writeUInt32LE(jalTo(stubs[2]!), offsetOf(sites.ctrl));
  eboot.writeUInt32LE(jalTo(stubs[3]!), offsetOf(sites.rewards));
}
