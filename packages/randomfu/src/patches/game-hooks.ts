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
 *   the words after. The function clears the first 16 bytes when the game
 *   wants no input, so whatever reads the pad reads them from there.
 *
 * Hooks, by index (`rf_hookN`):
 *
 * 0. Quest frame: both `game_task` calls to the HUD update.
 * 1. HUD: the call to the gauge function. Blob code drawing here with the
 *    HUD's routines draws in the gauges' layer.
 * 2. Pad: the main loop's call to the pad read, in every task. Blob code can
 *    read the buttons there, and keep them from the game by clearing them.
 * 3. Quest load (optional, `quests.unknown`): the two calls to the quest
 *    loader, below. The hook runs before and after the call with a
 *    `struct rf_load` (`blob/rf.h`); before, it may change the quest ID.
 *
 * The quest loader (EU 0x08870AEC) is `(quest, u16 id, buf)`, a two-step
 * state machine the caller runs every frame until it returns 1: step 0
 * (`quest+0x716`) maps the ID to its DATA.BIN file and, unless `quest+0x714`
 * says that file is already loaded, starts reading it; step 1 waits, then
 * decrypts the quest into `buf` (0 is a default buffer, EU 0x08A5C440).
 * `lobby_task` calls it once (accepting a quest), and `game_task` once
 * (departing on it, with the default buffer).
 *
 * A stub saves the call's arguments' first register and its result, so the
 * hook gets the HUD object (the pad object for hook 2) in `$a0` and the
 * caller its `$v0`. Everything is
 * found by code signatures, which match the EU and JP (FUC) discs.
 */
import { BLOB_MAGIC, HEADER } from "../blob/link.js";
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
  hiLo,
  jalTo,
  jumpTarget,
  type Segment,
} from "./mips.js";

export const HOOK = { questFrame: 0, hud: 1, pad: 2, questLoad: 3 } as const;

/** `struct rf_load`'s phase (`blob/rf.h`). */
export const QUEST_LOAD_PHASE = { accept: 0, depart: 1, after: 2 } as const;

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
export const PAD_READ_SIGNATURE = [
  0x27bdffd0, 0xafbf0000, 0xafb00000, 0x00808021, 0x27a40020, 0x0c000000, 0x24050000, 0x58400010,
  0x92030017, 0x8fa40000, 0x3c030000, 0x00831824,
];
/** The quest loader (EU 0x08870AEC), masked: it starts with `lbu $v0, 0x716($a0)`. */
export const QUEST_LOADER_SIGNATURE = [
  0x27bdfff0, 0xafbf0000, 0xafb20000, 0xafb10000, 0xafb00000, 0x90820716, 0x24030000, 0x00c08821,
  0x00809021, 0x10430065, 0x00008021, 0x50400003, 0x30a2ffff, 0x1000007d, 0x02001021, 0x34010000,
  0x0041082a, 0x50200078, 0x307000ff, 0x28412710,
];
/** Loader words that pin the quest object's fields (`lhu`/`sh` of 0x714, `sb $zero` of 0x716). */
const QUEST_LOADER_WORDS = [
  [0x12c, 0x96430714],
  [0x1a8, 0xa6510714],
  [0x220, 0xa2400716],
] as const;
/** `lui $s1` / `addiu $s1` of the default buffer, in the loader. */
const DEFAULT_BUFFER_WORDS = [0x1e4, 0x1e8] as const;

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
  /** The main loop's `jal padRead`, a vaddr: `lui; jal; lw $a0` (the pad object's global). */
  pad: number;
}

export interface QuestLoadSites {
  loader: number;
  /** Where the loader decrypts with `buf` 0. */
  defaultBuffer: number;
  /** File offsets of the `jal loader` in `lobby_task.ovl` and `game_task.ovl`. */
  lobby: number;
  game: number;
}

const jalsTo = (ovl: Buffer, base: number, target: number) => {
  const found: number[] = [];
  for (let at = 0; at + 4 <= ovl.length; at += 4) {
    if (isJalTo(word(ovl, at), base + at, target)) found.push(at);
  }
  return found;
};

/** The quest loader and its two calls (hook 3), or why they can't be found. */
export function findQuestLoadSites(
  vanillaEboot: Buffer,
  segment: Segment,
  lobbyTask: Buffer,
  lobbyTaskBase: number,
  gameTask: Buffer,
  gameTaskBase: number,
): QuestLoadSites | string {
  const [loader] = findUnique(vanillaEboot, segment, [QUEST_LOADER_SIGNATURE]);
  if (loader == null) return "this EBOOT's quest loader doesn't match";
  const at = segment.offset + (loader - segment.vaddr);
  if (QUEST_LOADER_WORDS.some(([offset, w]) => word(vanillaEboot, at + offset) !== w)) {
    return "this EBOOT's quest loader doesn't match";
  }
  const [lui, addiu] = DEFAULT_BUFFER_WORDS.map((offset) => word(vanillaEboot, at + offset));
  if (lui! >>> 16 !== 0x3c11 || addiu! >>> 16 !== 0x2631) {
    return "this EBOOT's quest loader doesn't match";
  }
  const lobby = jalsTo(lobbyTask, lobbyTaskBase, loader);
  const game = jalsTo(gameTask, gameTaskBase, loader);
  if (lobby.length !== 1 || game.length !== 1) return "this game's quest loading calls don't match";
  return { loader, defaultBuffer: hiLo(lui!, addiu!), lobby: lobby[0]!, game: game[0]! };
}

/** The hooks' call sites, or why they can't be found. */
export function findHookSites(
  vanillaEboot: Buffer,
  gameTask: Buffer,
  gameTaskBase: number,
): HookSites | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const [hudUpdate, gauges, padRead] = findUnique(vanillaEboot, segment, [
    HUD_UPDATE_SIGNATURE,
    GAUGES_SIGNATURE,
    PAD_READ_SIGNATURE,
  ]);
  if (hudUpdate == null || gauges == null) return "this EBOOT's HUD code doesn't match";
  if (padRead == null) return "this EBOOT's pad code doesn't match";
  const offsetOf = (vaddr: number) => segment.offset + (vaddr - segment.vaddr);
  if (word(vanillaEboot, offsetOf(gauges) + 0x14) !== 0x8c831194) {
    return "this EBOOT's HUD code doesn't match";
  }

  const hud: number[] = [];
  const pad: number[] = [];
  for (let at = segment.offset; at + 4 <= segment.offset + segment.size; at += 4) {
    const vaddr = segment.vaddr + (at - segment.offset);
    if (isJalTo(word(vanillaEboot, at), vaddr, gauges)) hud.push(at);
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
  return { segment, hudUpdate, gauges, questFrame, hud: hud[0]!, padRead, pad: pad[0]! };
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
  questLoader?: number,
): { code: number[]; stubs: number[]; questLoad?: { accept: number; depart: number } } {
  const a = new Assembler();
  const { zero, v0, a0, a1, a2, t0, t1, t2, t3, t4, t9 } = R;
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

  if (questLoader !== undefined) {
    // The quest loader's calls: `struct rf_load` at sp+16 (quest, id, buf,
    // result, phase), dispatched before the call, which reloads its
    // arguments from it, and after. $t4 carries the phase in.
    const load = { quest: 16, id: 20, buf: 24, result: 28, phase: 32, ra: 40, size: 48 } as const;
    a.label("acceptLoad");
    a.branch(BEQ, zero, zero, "questLoad");
    a.i(ADDIU, zero, t4, QUEST_LOAD_PHASE.accept);
    a.label("departLoad");
    a.i(ADDIU, zero, t4, QUEST_LOAD_PHASE.depart);
    a.label("questLoad");
    a.i(ADDIU, SP, SP, -load.size);
    a.i(SW, SP, RA, load.ra);
    a.i(SW, SP, a0, load.quest);
    a.i(SW, SP, a1, load.id);
    a.i(SW, SP, a2, load.buf);
    a.i(SW, SP, zero, load.result);
    a.i(SW, SP, t4, load.phase);
    a.i(ADDIU, SP, a0, load.quest);
    a.jalLabel("dispatch");
    a.i(ADDIU, zero, a1, HOOK.questLoad);
    a.i(LW, SP, a0, load.quest);
    a.i(LW, SP, a1, load.id);
    a.jal(questLoader);
    a.i(LW, SP, a2, load.buf);
    a.i(SW, SP, v0, load.result);
    a.i(ADDIU, zero, t4, QUEST_LOAD_PHASE.after);
    a.i(SW, SP, t4, load.phase);
    a.i(ADDIU, SP, a0, load.quest);
    a.jalLabel("dispatch");
    a.i(ADDIU, zero, a1, HOOK.questLoad);
    a.i(LW, SP, v0, load.result);
    a.i(LW, SP, RA, load.ra);
    a.r(RA, zero, zero, 0, JR);
    a.i(ADDIU, SP, SP, load.size);
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

  const code = a.link(at);
  return {
    code,
    stubs: originals.map((_, k) => at + a.offsetOf(`stub${k}`) * 4),
    ...(questLoader !== undefined && {
      questLoad: {
        accept: at + a.offsetOf("acceptLoad") * 4,
        depart: at + a.offsetOf("departLoad") * 4,
      },
    }),
  };
}

/** Points the quest loader's calls at the hook's entries. */
export function writeQuestLoadCalls(
  lobbyTask: Buffer,
  gameTask: Buffer,
  sites: QuestLoadSites,
  entries: { accept: number; depart: number },
): void {
  lobbyTask.writeUInt32LE(jalTo(entries.accept), sites.lobby);
  gameTask.writeUInt32LE(jalTo(entries.depart), sites.game);
}

export const hookCode = (sites: HookSites) => [
  { hook: HOOK.questFrame, target: sites.hudUpdate },
  { hook: HOOK.hud, target: sites.gauges },
  { hook: HOOK.pad, target: sites.padRead },
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
  eboot.writeUInt32LE(jalTo(stubs[2]!), sites.segment.offset + (sites.pad - sites.segment.vaddr));
}
