/**
 * Game hooks for blob code (see `docs/code-loader.md`): game calls pointed at
 * a gate in the Guild Card cave (`assembleHookGate`), which goes to stubs in
 * the blob (`assembleHooks`) that make the call, then run the blob's
 * `rf_hookN`; without a blob it makes the game's call alone. Blob features
 * register for them in C (`blob/rf.h`, `blob/runtime.c`).
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
 * 3. Quest load (optional, `quests.unknown`): the two calls to the quest
 *    loader, below. The hook runs before and after the call with a
 *    `struct rf_load` (`blob/rf.h`); before, it may change the quest ID.
 * 4. Rewards: the call to the reward roll, once a completed quest, just
 *    after the box is filled and before the reward screen shows it.
 * 5. Pick (optional, `poogie.enabled`): not a call but the EBOOT's weighted
 *    picker itself (see `poogie-luck.ts`). Its first two words jump to a
 *    stub that tail-calls the blob's `rf_hook5` with the picker's own
 *    arguments when the blob defines one, and otherwise runs those two words
 *    and goes on with the game's picker.
 * 6. Quest card (optional, `quests.keyLabel`): `lobby_task`'s one call to
 *    the quest counter's card (see `key-quests.ts`), every frame the card
 *    shows. The hook gets the counter object.
 * 7. Hit (optional, `hud.damageNumbers`): a call in the monster
 *    hit function, below, just after it adds a hit's damage to the part's
 *    damage for the frame. The hook gets a `struct rf_hit` (`blob/rf.h`).
 * 8. Menu (optional, randomfu's settings): three calls in the quest START
 *    menu (below), so its unused last entry becomes randomfu's. The hook
 *    gets a `struct rf_menu` (`blob/rf.h`).
 *
 * The quest loader (EU 0x08870AEC) is `(quest, u16 id, buf)`, a two-step
 * state machine the caller runs every frame until it returns 1: step 0
 * (`quest+0x716`) maps the ID to its DATA.BIN file and, unless `quest+0x714`
 * says that file is already loaded, starts reading it; step 1 waits, then
 * decrypts the quest into `buf` (0 is a default buffer, EU 0x08A5C440).
 * `lobby_task` calls it once (accepting a quest), and `game_task` once
 * (departing on it, with the default buffer).
 *
 * `game_sub.ovl` (quests) works out a hit on a monster in one function (EU
 * 0x09C43458), EABI `(attack, hunter, monster, ?, hitbox, position)`: it
 * keeps the attack in `$s5`, the hunter in `$s4`, the monster in `$s3`, the
 * hitbox in `$s2` and its hitzone row in `$s0`, adds the element's share
 * (a float in `$f26`) to the raw damage, and with the sum in `$s1` adds it to
 * the monster's part damage (`+0x3B8`, s16 per hitbox part & 7). Its next
 * call, delay slot after that store, is the status buildup `(monster,
 * attack)`; hook 7 takes that call, so every register above is still the hit
 * function's.
 *
 * The quest START menu is EBOOT code on the HUD object (EU 0x09A04BA0). It
 * has 12 entries on two pages of six; the last is a placeholder, its label
 * "--------" (message table 1, string 120), always greyed out, and choosing
 * it is refused. Hook 8 takes three calls, each the only call of its
 * function:
 *
 * - The list draw (EU 0x08818C94) gets each row's label with
 *   `jal msg1(obj, id)` (game_task), the IDs from a u16 table in the EBOOT
 *   (EU 0x089B54E0), with `$s0` pointing at the row's colour byte. For the
 *   placeholder's ID the stub dispatches `RF_MENU_LABEL`; when the blob
 *   gives a label, it returns that and clears the row's grey.
 * - The list's ×: `jal select(hud, cursor)` (EU 0x08849120), 0 to open the
 *   entry, else refused with a buzz. For the last entry the stub dispatches
 *   `RF_MENU_SELECT`, whose result (-1 unless the blob takes it) it returns.
 * - While an entry runs, `jal run(hud, cursor, buttons)` (EU 0x08849214)
 *   every frame, with the buttons pressed or auto-repeated: its result's 8
 *   closes the menu, 0x2000 goes back to the list (Options returns
 *   `buttons & 0x2008`). For the last entry the stub dispatches
 *   `RF_MENU_RUN` and returns its result.
 *
 * Other calls can go through the same stub (`calls`), as sites from 8 on
 * (`CALL_SITE`): the reward screen's label getter (`send-all.ts`), the
 * follow camera's yaw read (`target-camera.ts`) and, in `lobby_task`, the box
 * picker's grid (`improve-pips.ts`).
 *
 * A stub saves the call's arguments' first register and its result, so the
 * hook gets the HUD object (the `SceCtrlData` for hook 2, the results step's
 * object for hook 4) in `$a0` and the
 * caller its `$v0`. Everything is
 * found by code signatures, which match the EU and JP (FUC) discs.
 */
import { BLOB_MAGIC, HEADER } from "../blob/link.js";
import type { LoadedOverlay } from "../game/load.js";
import { QUEST_REWARD_SIGNATURE } from "./poogie-luck.js";
import {
  ADDIU,
  ANDI,
  Assembler,
  BEQ,
  BNE,
  JALR,
  JR,
  LUI,
  LW,
  ORI,
  R,
  RA,
  S,
  SB,
  SLL,
  SP,
  SW,
  codeSegment,
  findUnique,
  hi16,
  hiLo,
  jalTo,
  jumpTarget,
  maskImmediates,
  type Segment,
} from "./mips.js";

export const HOOK = {
  questFrame: 0,
  hud: 1,
  pad: 2,
  questLoad: 3,
  rewards: 4,
  pick: 5,
  questCard: 6,
  hit: 7,
  menu: 8,
} as const;

/** `struct rf_menu`'s phase (`blob/rf.h`). */
export const MENU_PHASE = { label: 0, select: 1, run: 2, draw: 3 } as const;
/**
 * Other game calls hook 8's stub takes (`assembleHooks`' `calls`), by the
 * `site` it gives them: the first is 8, after both menus' four.
 */
export const CALL_SITE = { rewardLabel: 8 } as const;
export const FIRST_CALL_SITE = 8;

/** The game's picker (hook 5): its address and its first two words, which the stub runs instead. */
export interface PickSite {
  picker: number;
  prologue: readonly [number, number];
}

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
/** padRead's call to the controller read (`jal`; `li $a1, 1`), from its start. */
const CTRL_READ_CALL = 0x14;
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

/**
 * The hit function where it adds the damage to the part's (EU 0x09C44C14),
 * masked: `lh $v0, 6($s2)` (the hitbox's part), the part's `+0x3B8`, `addu
 * $v0, $v0, $s1`, then `jal` the status buildup with `sh` in its delay slot.
 */
export const HIT_SITE_SIGNATURE = [
  0x86420006, 0x02602021, 0x02a02821, 0x30420007, 0x00021040, 0x00531821, 0x846203b8, 0x00511021,
  0x0c000000, 0xa46203b8, 0x92a2000f,
];
/** The `jal` in `HIT_SITE_SIGNATURE`. */
const HIT_CALL = 0x20;
/**
 * The element's share added to the raw damage (EU 0x09C44A4C): `trunc.w.s
 * $f0, $f26; andi $v1, $fp, 0xff; mfc1 $a0, $f0; addu $a0, $s1, $a0`.
 */
export const ELEMENT_ADD_SIGNATURE = [0x4600d00d, 0x33c300ff, 0x44040000, 0x02242021];

/** `mfc1 $rt, $fs`, with rt and fs zero. */
const MFC1 = 0x44000000;
const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);
const isJalTo = (w: number, pc: number, target: number) =>
  w >>> 26 === 0x03 && jumpTarget(w, pc) === target;

/**
 * The pad hook's sites (hook 2) alone: all a blob needs when it only counts
 * frames or reads the pad, like Poogie's luck, so it doesn't depend on the
 * HUD and reward code matching too.
 */
export interface PadSites {
  segment: Segment;
  padRead: number;
  /** The controller read padRead calls, and that call's vaddr (padRead `+0x14`). */
  ctrlRead: number;
  ctrl: number;
}

export interface HookSites extends PadSites {
  hudUpdate: number;
  gauges: number;
  /** File offsets in `game_task.ovl` of its `jal hudUpdate`s. */
  questFrame: number[];
  /** ELF offset of the EBOOT's `jal gauges`. */
  hud: number;
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

/** The pad hook's site (hook 2), or why it can't be found. */
export function findPadSites(vanillaEboot: Buffer): PadSites | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const [padRead] = findUnique(vanillaEboot, segment, [PAD_READ_SIGNATURE]);
  if (padRead == null) return "this EBOOT's pad code doesn't match";
  const ctrl = padRead + CTRL_READ_CALL;
  const ctrlCall = word(vanillaEboot, segment.offset + (ctrl - segment.vaddr));
  if (ctrlCall >>> 26 !== 0x03) return "this EBOOT's pad code doesn't match";
  return { segment, padRead, ctrlRead: jumpTarget(ctrlCall, ctrl), ctrl };
}

export interface HitSite {
  /** File offset in `game_sub.ovl` of the hit function's `jal` (hook 7). */
  call: number;
  /** The status buildup it calls. */
  target: number;
}

/** The hit function's call for hook 7, or why it can't be found. */
export function findHitSite(gameSub: Buffer, gameSubBase: number): HitSite | string {
  const segment = { offset: 0, vaddr: gameSubBase, size: gameSub.length & ~3 };
  const [site, element] = findUnique(gameSub, segment, [HIT_SITE_SIGNATURE, ELEMENT_ADD_SIGNATURE]);
  // The element is added shortly before, in the same function.
  if (site == null || element == null || element > site || site - element > 0x400) {
    return "this game's monster hit code doesn't match";
  }
  const call = site - gameSubBase + HIT_CALL;
  return { call, target: jumpTarget(word(gameSub, call), gameSubBase + call) };
}

/**
 * The quest START menu's row loop (EU 0x08818EF0), immediates masked: `lui;
 * addiu` the label ID table, then per row `lhu $a1` its ID, `jal msg1` with
 * the message object loaded in the delay slot, and `print` the row in its
 * colour (`lb $a3, 0($s0)`).
 */
export const MENU_LABEL_SIGNATURE = [
  0x3c020000, 0x00101840, 0x24420000, 0x87b30000, 0x00009021, 0x00438821, 0x27b00000, 0x3c020000,
  0x96250000, 0x0c000000, 0x8c440000, 0x3c030000, 0x87a50000, 0x8c640000, 0x82070000, 0x02603021,
  0x0c000000, 0x00404021, 0x87a40000, 0x26520000, 0x2a430000, 0x02642021, 0x26310000, 0x26100000,
  0x14600000, 0x7c049e20,
];
/** The menu input's ×: `andi 0x4000; beqzl; andi 0x2008; lbu $a1, cursor; jal select; move $a0`. */
export const MENU_SELECT_SIGNATURE = [
  0x32030000, 0x50600000, 0x32030000, 0x92250000, 0x0c000000, 0x02202021, 0x54400000, 0xafa00000,
  0x92230000, 0x3c020000, 0x00002821, 0x24630000,
];
/** The menu input, an entry running: `lbu $a1, cursor; jal run; move $a2, buttons`, then its flags. */
export const MENU_RUN_SIGNATURE = [
  0x92250000, 0x0c000000, 0x02003021, 0x30440000, 0x30830000, 0x50600000, 0x30830000, 0x0c000000,
  0x02202021, 0xafa00000, 0x3c020000,
];
/** The HUD update's layer draws (EU 0x0883F830): the menu's layer 10 is `jal` at +0x24, `move $a0, hud`. */
export const MENU_DRAW_SIGNATURE = [
  0x0c000000, 0x00000000, 0x02202021, 0x0c000000, 0x00000000, 0x0c000000, 0x02202021, 0x0c000000,
  0x02202021, 0x0c000000, 0x02202021, 0x0c000000, 0x02202021, 0x3c020000, 0x0c000000, 0x8c440000,
];
/**
 * The village START menu's list draw (EU 0x08834978): seven rows' colours
 * cleared, then on the first page `lui $s2` (+0x2C) and `addiu $s2` (+0x48)
 * its label ID table, a u16 per entry, in `lobby_task`.
 */
export const VILLAGE_LIST_SIGNATURE = [
  0x32220000, 0xa3a00000, 0xa3a00000, 0xa3a00000, 0xa3a00000, 0xa3a00000, 0xa3a00000, 0x14400000,
  0xa3a00000, 0x3c020000, 0x8c430000, 0x3c120000, 0x3c020000, 0x00621021, 0x8c420000, 0x30420000,
  0x0002102b, 0x14400000, 0x26520000,
];
/** Its row loop (EU 0x08834A8C): `lhu $a1, 0($s2)`, `jal` lobby_task's getter at +0x10, the row's colour at `$s0`. */
export const VILLAGE_LABEL_SIGNATURE = [
  0x00008821, 0x27b00000, 0x3c020000, 0x96450000, 0x0c000000, 0x8c440000, 0x97a40000, 0x3c080000,
  0x97aa0000, 0x02240018, 0x3c030000, 0x87a50000, 0x82070000, 0x00404821, 0x00003012, 0x01461021,
  0x8c640000, 0x25080000, 0x0c000000, 0x7c023620, 0x26310000, 0x2a230000, 0x26520000, 0x14600000,
  0x26100000,
];
/** The village menu input's × (EU 0x08834B6C): `jal select` at +0x18, `move $a0, hud`. */
export const VILLAGE_SELECT_SIGNATURE = [
  0x92040000, 0x32430000, 0x30620000, 0x10400000, 0xa6240000, 0x92050000, 0x0c000000, 0x02202021,
  0x54400000, 0xafa00000, 0x92030000,
];
/** The village menu input, an entry running (EU 0x08834C4C): `jal run; move $a2, buttons`. */
export const VILLAGE_RUN_SIGNATURE = [
  0x0c000000, 0x02403021, 0x30430000, 0x8e220000, 0x14400000, 0x00000000, 0x30630000, 0x30620000,
];
/** The village HUD's layer 10 (EU 0x08834694): the menu's draw, `jal` at +0x2C, `move $a0, hud`. */
export const VILLAGE_DRAW_SIGNATURE = [
  0x92030000, 0x50600000, 0x3c030000, 0x0c000000, 0x02002021, 0x10000000, 0x8fbf0000, 0x8c630000,
  0x90630000, 0x10600000, 0x00000000, 0x0c000000, 0x02002021,
];

/** Which START menu (`struct rf_menu`'s `menu`, `blob/rf.h`). */
export const MENU = { quest: 0, village: 1 } as const;
/** Each menu's entries; the last is a placeholder randomfu takes. */
export const MENU_ENTRIES = { quest: 12, village: 14 } as const;
/** `sltiu` of select's (quest) or run's (village) jump table, from the function's start. */
const MENU_BOUNDS = {
  quest: [0x8, 0x2c61000c],
  village: [0x10, 0x2c41000d],
} as const;

/** A call a hook stub replaces: the `jal`'s vaddr and what it calls. */
export interface HookCall {
  call: number;
  target: number;
  /** The overlay the call is in, when it isn't the EBOOT's (its `call` an address in it). */
  overlay?: LoadedOverlay;
}

/** One START menu's calls for hook 8. */
export interface MenuSites {
  /** `MENU`. */
  menu: number;
  /** randomfu's entry: the placeholder's index. */
  entry: number;
  /**
   * The row label getter's call, and what names the placeholder's row: the
   * quest's label ID (`$a1`), the village's ID's address (`$s2`).
   */
  label: HookCall;
  placeholder: number;
  select: HookCall;
  run: HookCall;
  /** The menu's layer draw, which draws nothing for the placeholder. */
  draw: HookCall;
}

/** Both START menus' calls for hook 8, or why they can't be found. */
export function findMenuSites(vanillaEboot: Buffer, segment: Segment): MenuSites[] | string {
  const at = (vaddr: number) => word(vanillaEboot, segment.offset + (vaddr - segment.vaddr));
  const inSegment = (vaddr: number) =>
    vaddr >= segment.vaddr && vaddr + 4 <= segment.vaddr + segment.size;
  const found = findUnique(
    vanillaEboot,
    segment,
    [
      MENU_LABEL_SIGNATURE,
      MENU_SELECT_SIGNATURE,
      MENU_RUN_SIGNATURE,
      MENU_DRAW_SIGNATURE,
      VILLAGE_LIST_SIGNATURE,
      VILLAGE_LABEL_SIGNATURE,
      VILLAGE_SELECT_SIGNATURE,
      VILLAGE_RUN_SIGNATURE,
      VILLAGE_DRAW_SIGNATURE,
    ],
    maskImmediates,
  );
  if (found.some((f) => f == null)) return "this EBOOT's START menus don't match";
  const [loop, select, run, draw, vList, vLoop, vSelect, vRun, vDraw] = found as number[];
  const call = (vaddr: number): HookCall => ({ call: vaddr, target: jumpTarget(at(vaddr), vaddr) });
  const bounded = (fn: number, [offset, w]: readonly [number, number]) =>
    inSegment(fn + offset) && at(fn + offset) === w;
  const quest = {
    menu: MENU.quest,
    entry: MENU_ENTRIES.quest - 1,
    label: call(loop! + 0x24),
    select: call(select! + 0x10),
    run: call(run! + 0x4),
    draw: call(draw! + 0x24),
  };
  const village = {
    menu: MENU.village,
    entry: MENU_ENTRIES.village - 1,
    label: call(vLoop! + 0x10),
    select: call(vSelect! + 0x18),
    run: call(vRun!),
    draw: call(vDraw! + 0x2c),
  };
  if (
    !bounded(quest.select.target, MENU_BOUNDS.quest) ||
    !bounded(village.run.target, MENU_BOUNDS.village)
  ) {
    return "this EBOOT's START menus don't have the entries randomfu expects";
  }
  // The quest's placeholder by its label ID ($a1), read from the EBOOT's table.
  const ids = hiLo(at(loop!), at(loop! + 8));
  const last = ids + quest.entry * 2;
  if (!inSegment(last & ~3)) return "this EBOOT's START menu labels weren't found";
  const id = vanillaEboot.readUInt16LE(segment.offset + (last - segment.vaddr));
  // The village's by where its ID is ($s2), in lobby_task's table.
  const villageIds = hiLo(at(vList! + 0x2c), at(vList! + 0x48));
  return [
    { ...quest, placeholder: id },
    { ...village, placeholder: villageIds + village.entry * 2 },
  ];
}

/** The hooks' call sites, or why they can't be found. */
export function findHookSites(
  vanillaEboot: Buffer,
  gameTask: Buffer,
  gameTaskBase: number,
): HookSites | string {
  const padSites = findPadSites(vanillaEboot);
  if (typeof padSites === "string") return padSites;
  const { segment, padRead } = padSites;
  const [hudUpdate, gauges, rewardWalk] = findUnique(vanillaEboot, segment, [
    HUD_UPDATE_SIGNATURE,
    GAUGES_SIGNATURE,
    QUEST_REWARD_SIGNATURE,
  ]);
  if (hudUpdate == null || gauges == null) return "this EBOOT's HUD code doesn't match";
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
  return {
    ...padSites,
    hudUpdate,
    gauges,
    questFrame,
    hud: hud[0]!,
    pad: pad[0]!,
    rewardRoll,
    rewards: rewards[0]!,
  };
}

/**
 * Sets `base` (`$t0`) to the blob and branches to `miss` unless its magic is
 * there (it uses `$t1` and `$t2`, or the two registers given). The next word
 * the caller emits is the delay slot.
 */
function emitBlobCheck(
  a: Assembler,
  blob: number,
  miss: string,
  [t0, t1, t2]: readonly [number, number, number] = [R.t0, R.t1, R.t2],
): void {
  const { zero } = R;
  a.i(LUI, zero, t0, hi16(blob));
  a.i(ADDIU, t0, t0, blob & 0xffff);
  a.i(LW, t0, t1, HEADER.magic);
  a.i(LUI, zero, t2, BLOB_MAGIC >>> 16);
  a.i(ORI, t2, t2, BLOB_MAGIC & 0xffff);
  a.branch(BNE, t1, t2, miss);
}

/** Where each call a hook takes enters: the hook code's labels or the gate's. */
export interface HookEntries {
  /** `originals`' stubs, in order. */
  stubs: number[];
  questLoad?: { accept: number; depart: number };
  hit?: number;
  menus: MenuStubs[];
  /** Each of `calls`' entry. */
  calls: number[];
}

/**
 * The calls the hooks take, by label, in the order the gate numbers them
 * (its sites), with the game's function each calls.
 */
function hookSiteList(
  originals: readonly { hook: number; target: number }[],
  questLoader: number | undefined,
  hit: number | undefined,
  menus: readonly MenuSites[],
  calls: readonly HookCall[],
): { label: string; target: number }[] {
  const phases = Object.keys(MENU_PHASE) as (keyof typeof MENU_PHASE)[];
  return [
    ...originals.map(({ target }, k) => ({ label: `stub${k}`, target })),
    ...(questLoader === undefined
      ? []
      : [
          { label: "acceptLoad", target: questLoader },
          { label: "departLoad", target: questLoader },
        ]),
    ...(hit === undefined ? [] : [{ label: "hit", target: hit }]),
    ...menus.flatMap((menu, k) =>
      phases.map((phase) => ({ label: `menu${k}${phase}`, target: menu[phase].target })),
    ),
    ...calls.map(({ target }, k) => ({ label: `call${k}`, target })),
  ];
}

function hookEntries(
  addressOf: (label: string) => number,
  originals: readonly unknown[],
  questLoader: number | undefined,
  hit: number | undefined,
  menus: readonly MenuSites[],
  calls: readonly HookCall[],
): HookEntries {
  return {
    stubs: originals.map((_, k) => addressOf(`stub${k}`)),
    ...(questLoader !== undefined && {
      questLoad: { accept: addressOf("acceptLoad"), depart: addressOf("departLoad") },
    }),
    ...(hit !== undefined && { hit: addressOf("hit") }),
    menus: menus.map((_, k) => ({
      label: addressOf(`menu${k}label`),
      select: addressOf(`menu${k}select`),
      run: addressOf(`menu${k}run`),
      draw: addressOf(`menu${k}draw`),
    })),
    calls: calls.map((_, k) => addressOf(`call${k}`)),
  };
}

/**
 * The hook code at `at`: `dispatch(arg, hook)` jumps to the blob's
 * `rf_hookN` when the blob's magic is there and it defines one; then a stub
 * per hook that makes the game's call and dispatches. `questLoader` and
 * `hit` (the status buildup the hit site calls) add hooks 3 and 7, `menus`
 * and `calls` hook 8. The code loader links it into the blob, behind the
 * cave's gate (`assembleHookGate`); `sites` are its entries in the gate's
 * order.
 */
export function assembleHooks(
  at: number,
  blob: number,
  originals: readonly { hook: number; target: number }[],
  questLoader?: number,
  hit?: number,
  menus: readonly MenuSites[] = [],
  calls: readonly HookCall[] = [],
): HookEntries & { code: number[]; sites: number[] } {
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

  if (hit !== undefined) {
    // The hit: `struct rf_hit` at sp+16 from the hit function's registers
    // (monster, attack, hunter, hitbox, zone, damage, element), dispatched
    // before the status buildup call it replaces.
    const frame = { hit: 16, ra: 44, a0: 48, a1: 52, size: 64 } as const;
    const [s0, s1, s2, s3, s4, s5] = S;
    a.label("hit");
    a.i(ADDIU, SP, SP, -frame.size);
    a.i(SW, SP, RA, frame.ra);
    a.i(SW, SP, a0, frame.a0);
    a.i(SW, SP, a1, frame.a1);
    for (const [k, reg] of [s3, s5, s4, s2, s0, s1].entries()) a.i(SW, SP, reg, frame.hit + k * 4);
    a.emit(MFC1 | (t0 << 16) | (26 << 11)); // mfc1 $t0, $f26
    a.i(SW, SP, t0, frame.hit + 24);
    a.i(ADDIU, SP, a0, frame.hit);
    a.jalLabel("dispatch");
    a.i(ADDIU, zero, a1, HOOK.hit);
    a.i(LW, SP, a0, frame.a0);
    a.jal(hit);
    a.i(LW, SP, a1, frame.a1);
    a.i(LW, SP, RA, frame.ra);
    a.r(RA, zero, zero, 0, JR);
    a.i(ADDIU, SP, SP, frame.size);
  }

  if (menus.length || calls.length) {
    // The START menus: each call goes through two words that name it (its
    // menu * 4 + MENU_PHASE, or FIRST_CALL_SITE + k for `calls`) to one stub, which dispatches a `struct
    // rf_menu` at sp+16: the call's $a0-$a3, $s0 and $s2 (the label loops'
    // row), the site, the game's function, and `handled` and `result`. The
    // blob does the rest, the game's call included; unless it sets
    // `handled`, the stub jumps to the game's function as if called.
    const f = { args: 16, s0: 32, s2: 36, site: 40, game: 44, handled: 48, result: 52, ra: 60 };
    const size = 64;
    const [s0, , s2] = S;
    const { t5, t6, a3 } = R;
    for (const [k, menu] of menus.entries()) {
      for (const [name, phase] of Object.entries(MENU_PHASE)) {
        a.label(`menu${k}${name}`);
        a.branch(BEQ, zero, zero, "menu");
        a.i(ADDIU, zero, t4, menu.menu * 4 + phase);
      }
    }
    for (const k of calls.keys()) {
      a.label(`call${k}`);
      a.branch(BEQ, zero, zero, "menu");
      a.i(ADDIU, zero, t4, FIRST_CALL_SITE + k);
    }
    a.label("menu");
    a.i(ADDIU, SP, SP, -size);
    a.i(SW, SP, RA, f.ra);
    for (const [k, reg] of [a0, a1, a2, a3].entries()) a.i(SW, SP, reg, f.args + k * 4);
    a.i(SW, SP, s0, f.s0);
    a.i(SW, SP, s2, f.s2);
    a.i(SW, SP, t4, f.site);
    a.r(zero, t4, t5, 2, SLL);
    a.addressOf(t6, "menuGame");
    a.r(t6, t5, t6, 0, 0x21);
    a.i(LW, t6, t5, 0);
    a.i(SW, SP, t5, f.game);
    a.i(SW, SP, zero, f.handled);
    a.i(ADDIU, SP, a0, f.args);
    a.jalLabel("dispatch");
    a.i(ADDIU, zero, a1, HOOK.menu);
    a.i(LW, SP, t0, f.handled);
    a.branch(BEQ, t0, zero, "menuGame0");
    a.i(LW, SP, v0, f.result);
    a.i(LW, SP, RA, f.ra);
    a.r(RA, zero, zero, 0, JR);
    a.i(ADDIU, SP, SP, size);
    a.label("menuGame0");
    for (const [k, reg] of [a0, a1, a2, a3].entries()) a.i(LW, SP, reg, f.args + k * 4);
    a.i(LW, SP, t5, f.game);
    a.i(LW, SP, RA, f.ra);
    a.r(t5, zero, zero, 0, JR);
    a.i(ADDIU, SP, SP, size);
    // The game's functions, by site.
    a.label("menuGame");
    const game: number[] = [];
    for (const menu of menus) {
      game[menu.menu * 4 + MENU_PHASE.label] = menu.label.target;
      game[menu.menu * 4 + MENU_PHASE.select] = menu.select.target;
      game[menu.menu * 4 + MENU_PHASE.run] = menu.run.target;
      game[menu.menu * 4 + MENU_PHASE.draw] = menu.draw.target;
    }
    for (const [k, call] of calls.entries()) game[FIRST_CALL_SITE + k] = call.target;
    for (let k = 0; k < game.length; k++) a.emit(game[k] ?? 0);
  }

  a.label("dispatch");
  emitBlobCheck(a, blob, "none");
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
  const addressOf = (label: string) => at + a.offsetOf(label) * 4;
  return {
    code,
    ...hookEntries(addressOf, originals, questLoader, hit, menus, calls),
    sites: hookSiteList(originals, questLoader, hit, menus, calls).map(({ label }) =>
      addressOf(label),
    ),
  };
}

/**
 * The hooks' gate at `at`, the only hook code in the cave: an entry per call
 * the hooks take (`b gate; li $t4, site`) and the game's functions by site.
 * With the blob's magic there it jumps to the hook code's entry for the site,
 * from the blob's `table` (`assembleHooks`' `sites`); otherwise to the game's
 * function, as if the game had called it. Either way the call's arguments
 * and `$ra` are as the game left them: it uses only `$t4`-`$t7`, which the
 * game's EABI doesn't pass arguments in (`$t0`-`$t3` are its 5th to 8th).
 */
export function assembleHookGate(
  at: number,
  blob: number,
  table: number,
  originals: readonly { hook: number; target: number }[],
  questLoader?: number,
  hit?: number,
  menus: readonly MenuSites[] = [],
  calls: readonly HookCall[] = [],
): HookEntries & { code: number[] } {
  const a = new Assembler();
  const { zero, t4, t5, t6, t7 } = R;
  const nop = () => a.emit(0);
  const sites = hookSiteList(originals, questLoader, hit, menus, calls);
  for (const [k, { label }] of sites.entries()) {
    a.label(label);
    a.branch(BEQ, zero, zero, "gate");
    a.i(ADDIU, zero, t4, k);
  }
  a.label("gate");
  emitBlobCheck(a, blob, "game", [t5, t6, t7]);
  a.r(zero, t4, t5, 2, SLL);
  a.i(LUI, zero, t6, hi16(table));
  a.r(t6, t5, t6, 0, 0x21);
  a.i(LW, t6, t6, table & 0xffff);
  a.r(t6, zero, zero, 0, JR);
  nop();
  a.label("game");
  a.addressOf(t6, "targets");
  a.r(t6, t5, t6, 0, 0x21);
  a.i(LW, t6, t6, 0);
  a.r(t6, zero, zero, 0, JR);
  nop();
  a.label("targets");
  for (const { target } of sites) a.emit(target);
  const addressOf = (label: string) => at + a.offsetOf(label) * 4;
  return {
    code: a.link(at),
    ...hookEntries(addressOf, originals, questLoader, hit, menus, calls),
  };
}

/** A START menu's hook 8 stubs, by the call each takes. */
export interface MenuStubs {
  label: number;
  select: number;
  run: number;
  draw: number;
}

/** Points a START menu's four calls at its hook 8 stubs. */
export function writeMenuCalls(
  eboot: Buffer,
  segment: Segment,
  sites: MenuSites,
  stubs: MenuStubs,
): void {
  const offsetOf = (vaddr: number) => segment.offset + (vaddr - segment.vaddr);
  for (const key of ["label", "select", "run", "draw"] as const) {
    eboot.writeUInt32LE(jalTo(stubs[key]), offsetOf(sites[key].call));
  }
}

/**
 * Hook 5's stub at `at`: with the blob loaded and its `rf_hook5` defined, it
 * calls that in a 32-byte frame (the O32 code may use `sp+0..15`) with the
 * picker's `$a0` and `$a1` and returns its `$v0` to the picker's caller.
 * Otherwise it runs the picker's first two words and jumps to the third. The
 * picker is a leaf of the game's (it only calls the RNG), so the
 * temporaries are free at its entry.
 */
export function assemblePickHook(at: number, blob: number, site: PickSite): number[] {
  const a = new Assembler();
  const { zero, t0, t9 } = R;
  const nop = () => a.emit(0);
  emitBlobCheck(a, blob, "game");
  a.i(LW, t0, t9, HEADER.hooks + HOOK.pick * 4);
  a.branch(BEQ, t9, zero, "game");
  nop();
  a.i(ADDIU, SP, SP, -32);
  a.i(SW, SP, RA, 24);
  a.r(t9, zero, RA, 0, JALR);
  nop();
  a.i(LW, SP, RA, 24);
  a.r(RA, zero, zero, 0, JR);
  a.i(ADDIU, SP, SP, 32);
  a.label("game");
  a.emit(site.prologue[0]);
  a.j(site.picker + 8);
  a.emit(site.prologue[1]);
  return a.link(at);
}

/** Points the picker's first two words at hook 5's stub. */
export function writePickHook(eboot: Buffer, segment: Segment, site: PickSite, stub: number): void {
  const offset = segment.offset + (site.picker - segment.vaddr);
  eboot.writeUInt32LE(((0x02 << 26) | ((stub >>> 2) & 0x03ffffff)) >>> 0, offset);
  eboot.writeUInt32LE(0, offset + 4);
}

/** Points the hit function's call at the hook's entry. */
export function writeHitCall(gameSub: Buffer, site: HitSite, entry: number): void {
  gameSub.writeUInt32LE(jalTo(entry), site.call);
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

const hasAllSites = (sites: PadSites | HookSites): sites is HookSites => "gauges" in sites;

/** The calls the stubs make: every hook's, or the pad's alone. */
export const hookCode = (sites: PadSites | HookSites) =>
  hasAllSites(sites)
    ? [
        { hook: HOOK.questFrame, target: sites.hudUpdate },
        { hook: HOOK.hud, target: sites.gauges },
        { hook: HOOK.pad, target: sites.ctrlRead },
        { hook: HOOK.rewards, target: sites.rewardRoll },
      ]
    : [{ hook: HOOK.pad, target: sites.ctrlRead }];

/** Points the game's calls at the stubs (`stubs` in `hookCode` order). */
export function writeHookCalls(
  eboot: Buffer,
  gameTask: Buffer | null,
  sites: PadSites | HookSites,
  stubs: readonly number[],
): void {
  const offsetOf = (vaddr: number) => sites.segment.offset + (vaddr - sites.segment.vaddr);
  if (!hasAllSites(sites)) {
    eboot.writeUInt32LE(jalTo(stubs[0]!), offsetOf(sites.ctrl));
    return;
  }
  if (!gameTask) throw new Error("The quest frame hook needs game_task");
  for (const at of sites.questFrame) gameTask.writeUInt32LE(jalTo(stubs[0]!), at);
  eboot.writeUInt32LE(jalTo(stubs[1]!), sites.hud);
  eboot.writeUInt32LE(jalTo(stubs[2]!), offsetOf(sites.ctrl));
  eboot.writeUInt32LE(jalTo(stubs[3]!), offsetOf(sites.rewards));
}
