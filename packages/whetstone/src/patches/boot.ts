/**
 * A faster start (`boot.skip`): from power-on to the title screen with no
 * language choice, notice, logos, intro movie or wait on the autoload's
 * message (`title`), or on into the village with the hunter saved last and
 * no menu on screen (`village`). It is a data patch of two overlays,
 * `demo_task.ovl` and `cont_task.ovl`, so it needs no code loader.
 *
 * What the game does (EU addresses; JP's code is the same at other ones):
 *
 * - A task manager (`*0x08A8B1E8`) runs one task a slot. A task's handler
 *   is a pointer to member, three words `{0, -1, function}`, copied into the
 *   task at `+4`; a handler ends the task by setting byte `+0x11` to 1 and
 *   `+0x18` to the next task's ID. Task 2 (`demo_task.ovl`) is boot and the
 *   title screen, task 3 the title menu, task 5 (`cont_task.ovl`) Load Game.
 * - Task 2's handlers come from a table of pointers to member (EU
 *   0x09A61B80): on EU first the language choice (EU 0x09A60590), whose
 *   cursor starts on the PSP's language; then the save check and the load
 *   step (EU 0x09A5F670), which autoloads the save file with the select
 *   object's autoload (EU 0x088BE550) to apply its options. That ends on
 *   "Auto-loaded Game data." (its state 5), for a countdown or until confirm.
 *   Then the health notice (EU only), logo 1, logo 2 and the intro movie,
 *   each followed by Press START (EU 0x09A60258). Press START idles to the
 *   attract demo or, on START or confirm, ends the task with next = 3.
 * - On a cold boot only, the step before the load step goes on to it (else
 *   to Press START); it sets the fade's state to 0, keeping the old one at
 *   `+0x30` for the load step to put back.
 * - Task 2's EBOOT code sets the save's byte `+0x494` when it starts; the
 *   title menu's EBOOT stub (EU 0x0887F690) puts its cursor (`save+0x498`)
 *   on Load Game while that's set and there's a save, then clears it.
 * - Load Game (task 5) fades in (its state 0), then polls the select object
 *   (EU `*0x09A44C60`, its function EU 0x088BC7F0) once a frame. The select
 *   object's state (`+0xC`): 0 and 1 read the save file, 8 puts the list's
 *   cursor on the slot saved last (the game records it, else the first used
 *   slot), 2 opens the list, 3 is the list, 4 "Load?" with Yes chosen, 5
 *   "Load completed.", 6 and 7 copy the slot into the save; 9 and up are
 *   messages (no save, a broken one) and a retry. 3 to 5 wait for confirm:
 *   × on EU, ○ on JP. The copy is the same memcpy whichever way the menu is
 *   driven, and it's what the code loader hooks, so the blob loads as after
 *   any save load.
 *
 * How Whetstone changes it:
 *
 * - Both: the autoload's call goes through a new routine that adds confirm
 *   to the frame's pressed buttons in its state 5. On EU the language choice
 *   doesn't fade in or out and confirms its first frame, so the game keeps
 *   the PSP's language. The load step's next handler becomes Press START.
 * - `village`: the load step's own handler becomes a new one that puts the
 *   fade's state back (black) and ends task 2 with next = 5, so a cold boot
 *   reads the save once, in Load Game. While `save+0x494` is set (Load Game
 *   came from boot, not from the title menu), Load Game doesn't fade in,
 *   and its poll adds confirm in states 3 to 5, so the slot saved last loads
 *   on a black screen. Holding L, SELECT or START in those states, or a
 *   message (state 9 and up), fades in, clears `+0x494` and leaves the menu
 *   to the player for the rest of that Load Game (a flag word in the
 *   routine's own padding, which is fresh each time the overlay loads). Its fade-out after a load goes
 *   through the fade-in's routine, so a screen that's still black isn't
 *   faded again; and its post-load step applies the save's options first,
 *   the autoload's job.
 *
 * New code goes in padding: zero runs that end the overlay's image or come
 * before a 16-byte boundary, after a function's last word or a pointer into
 * the overlay's code (a handler or a jump table), a word kept clear after.
 */
import type { Edits } from "../edits.js";
import type { LoadedOverlay } from "../game/load.js";
import type { WhetstoneSettings } from "../settings.js";
import type { Report } from "../report.js";
import { codeSegment, findUnique, hi16, hiLo, jalTo, jumpTarget, signed16 } from "./mips.js";

export type BootSkip = WhetstoneSettings["boot.skip"];

/** START, which every title-screen check takes with confirm. */
const START = 0x8;
/** The PSP's L and SELECT, in the pad words. */
export const L_BUTTON = 0x100;
const SELECT = 0x1;
/** Any of these held as Load Game comes up from boot shows its menu. */
export const MENU_BUTTONS = L_BUTTON | SELECT | START;
/** The save's title flags: task 2 sets `+0x494`, the title menu reads both. */
export const TITLE_FIRST = 0x494;
export const TITLE_CURSOR = 0x498;
/** The select object's state; the ones that wait for confirm (the list, Yes/No, "Load completed."); the first message. */
export const SELECT_STATE = 0xc;
export const LIST = 3;
export const WAITS = 3;
export const MESSAGES = 9;
/** The autoload's "Auto-loaded Game data." state. */
export const AUTOLOADED = 5;

const OP = (word: number) => word >>> 26;
const JR_RA = 0x03e00008;
const NOP = 0;
/** Masks `lui`, `lw` and `jal` (addresses) and branches' offsets, keeping everything else. */
const addressMask = (word: number): number => {
  const op = OP(word);
  if (op === 0x03) return (word & 0xfc000000) >>> 0;
  if (op === 0x0f || op === 0x23) return (word & 0xffff0000) >>> 0;
  if (op >= 0x04 && op <= 0x07) return (word & 0xffff0000) >>> 0;
  if (op >= 0x14 && op <= 0x17) return (word & 0xffff0000) >>> 0;
  return word >>> 0;
};
const masked = (words: readonly number[]) => words.map(addressMask);

/**
 * Task 2's load step: it allocates the select object's buffer, starts it,
 * and then polls its autoload (EU 0x09A5F720). Addresses are masked.
 */
export const LOAD_STEP = masked([
  0x3c0209a1, // lui $v0, hi
  0x8c44b540, // lw $a0, lo($v0)
  0x24050018, // li $a1, 0x18: the heap's tag
  0x3c020016, // lui $v0, 0x16
  0x0e2261a5, // jal alloc
  0x3446a100, // ori $a2, $v0, 0xA100: the select buffer's size
  0x00403021, // move $a2, $v0
  0x3c0209a4, // lui $v0, hi(select)
  0x8c444c60, // lw $a0, lo(select)($v0)
  0x0e22e9d8, // jal start
  0x00002821, // move $a1, $zero
  0x8e22001c, // lw $v0, 0x1C($s1): the step's state...
  0x24420001, // addiu $v0, $v0, 1
  0xae22001c, // sw $v0, 0x1C($s1)
  0x3c0209a4, // lui $v0, hi(select)
  0x0e22f954, // jal autoload
  0x8c444c60, // lw $a0, lo(select)($v0)
]);
const AUTOLOAD_CALL = 15;

/** A handler that ends its task with next = 3 (EU 0x09A60578): Press START's way to the title menu. */
export const END_TO_TITLE = [0x24030001, 0xa0830011, 0x24030003, JR_RA, 0xac830018];
const NEXT_ID = 2; // the word with the next task's ID
const LOAD_GAME = 5;

/** Press START counts 480 frames (`slti $v0, $v0, 0x1E0`) before the attract demo. */
const PRESS_START_IDLE = 0x284201e0;

/** The language choice's state 5: once its window is ready, it fades in (EU 0x09A60754). */
export const LANGUAGE_FADE_IN = masked([
  0x3c02089d, // lui $v0, hi
  0x8c44c434, // lw $a0, lo($v0)
  0x8c990000, // lw $t9, ($a0)
  0x8f390038, // lw $t9, 0x38($t9)
  0x0320f809, // jalr $t9: is the window ready
  NOP,
  0x1440009b, // bnez $v0, out
  NOP,
  0x3c02089d, // lui $v0, hi(fade)
  0x8c44c01c, // lw $a0, lo(fade)($v0)
  0x24050010, // li $a1, 0x10
  0x0e2135e4, // jal fade
  0x00003021, // move $a2, $zero: in
]);
const LANGUAGE_FADE_CALL = 11;
/** Its state 6 takes START or confirm (EU 0x09A60898). */
export const LANGUAGE_CONFIRM = masked([
  0x8c632c6c, // lw $v1, lo(pad)($v1)
  0x30634008, // andi $v1, $v1, confirm | START
  0x1060004e, // beqz $v1, out
  NOP,
  0xafa00000, // sw $zero, ($sp)
  0x3c0208a6, // lui $v0, hi(sound)
  0x8c442d8c, // lw $a0, lo(sound)($v0)
  0x00002821, // move $a1, $zero
  0x24060001, // li $a2, 1: the confirm sound
]);
const LANGUAGE_WAIT = 2;
/** Then it plays the confirm sound and fades out (EU 0x09A608D4), at most this many words on. */
export const LANGUAGE_FADE_OUT = masked([
  0x3c02089d, // lui $v0, hi(fade)
  0x8c44c01c, // lw $a0, lo(fade)($v0)
  0x24050010, // li $a1, 0x10
  0x0e2135e4, // jal fade
  0x24060001, // li $a2, 1: out
]);
const LANGUAGE_FADE_OUT_WITHIN = 24;
const FADE_OUT_CALL = 3;

/** After a load, the load step applies the save's options (EU 0x09A5F7B4): `jal` at +3. */
export const APPLY_OPTIONS = masked([
  0x16030024, // bne $s0, $v1, out: only a load
  0xae24001c, // sw $a0, 0x1C($s1)
  0x3c02089d, // lui $v0, hi(save)
  0x0e215cba, // jal apply
  0x8c44c438, // lw $a0, lo(save)($v0)
]);
const APPLY_CALL = 3;

/** Load Game's state 2: it polls the select object and checks for a load (EU 0x09A5F430). */
export const POLL_CALL = masked([
  0x3c0209a4, // lui $v0, hi(select)
  0x0e22f1fc, // jal poll
  0x8c444c60, // lw $a0, lo(select)($v0)
  0x24060001, // li $a2, 1
  0x5446000b, // bnel $v0, $a2, ...
  0x24030002, // li $v1, 2
]);
const POLL_JAL = 1;
/** Right after: once the poll has copied a slot, Load Game fades out (EU 0x09A5F448). */
export const POLL_LOADED = masked([
  0x8e03001c, // lw $v1, 0x1C($s0)
  0x3c02089d, // lui $v0, hi(fade)
  0x24630001, // addiu $v1, $v1, 1
  0xae03001c, // sw $v1, 0x1C($s0)
  0x8c44c01c, // lw $a0, lo(fade)($v0)
  0x0e2135e4, // jal fade
  0x24050010, // li $a1, 0x10 ($a2 is 1, out)
]);
const LOADED_FADE_CALL = 5;
/** After its fade-out, Load Game sets the volume and runs its post-load step on the save (EU 0x09A5F5A0). */
export const POST_LOAD = masked([
  0x3c0208a6, // lui $v0, hi(sound)
  0x8c442d8c, // lw $a0, lo(sound)($v0)
  0x0e2201d8, // jal volume
  0x8065add9, // lb $a1, -0x5227($v1): from the save's options
  0x3c02089d, // lui $v0, hi(save)
  0x0e215b0d, // jal post-load
  0x8c44c438, // lw $a0, lo(save)($v0)
]);
const POST_LOAD_CALL = 5;
/** Load Game's state 0 fades in (EU 0x09A5F33C). */
export const CONT_FADE_IN = masked([
  0x3c02089d, // lui $v0, hi(fade)
  0x8c44c01c, // lw $a0, lo(fade)($v0)
  0x24050010, // li $a1, 0x10
  0x0e2135e4, // jal fade
  0x00003021, // move $a2, $zero: in
]);
const CONT_FADE_CALL = 3;

/**
 * The title menu's stub, from the save's title flag to the select object's
 * "a save exists" byte (EU 0x0887F690). Its `lui`/`lw` pair is the save's
 * pointer.
 */
export const TITLE_STUB = masked([
  0x3c02089d, // lui $v0, hi(save)
  0x8c43c438, // lw $v1, lo(save)($v0)
  0x90620494, // lbu $v0, 0x494($v1)
  0x10400009, // beqz $v0, +9
  NOP,
  0x3c0209a4, // lui $v0, hi(select)
  0x8c424c60, // lw $v0, lo(select)($v0)
  0x904209a2, // lbu $v0, 0x9A2($v0)
]);

interface Overlay {
  buf: Buffer;
  base: number;
  /** The end of its image: what's past it isn't loaded as data. */
  end: number;
}
const overlayOf = (buf: Buffer): Overlay => {
  const base = buf.readUInt32LE(8);
  return { buf, base, end: Math.min(buf.readUInt32LE(0x1c), base + buf.length) };
};
const at = (o: Overlay, vaddr: number): number => vaddr - o.base;
const word = (o: Overlay, vaddr: number): number | null => {
  const offset = at(o, vaddr);
  return offset >= 0x80 && vaddr + 4 <= o.end ? o.buf.readUInt32LE(offset) : null;
};
const owns = (o: Overlay, vaddr: number): boolean => word(o, vaddr) !== null;
const isHandler = (o: Overlay, vaddr: number): boolean =>
  word(o, vaddr) === 0 && word(o, vaddr + 4) === 0xffffffff && owns(o, word(o, vaddr + 8) ?? 0);

/** Every match of `signature` (masked by `addressMask`) in an overlay's image, as vaddrs. */
function findAll(o: Overlay, signature: readonly number[], mask = addressMask): number[] {
  const found: number[] = [];
  for (let v = o.base + 0x80; v + signature.length * 4 <= o.end; v += 4) {
    if (signature.every((s, k) => mask(word(o, v + k * 4)!) === s)) found.push(v);
  }
  return found;
}
const findOne = (o: Overlay, signature: readonly number[]): number | null => {
  const found = findAll(o, signature);
  return found.length === 1 ? found[0]! : null;
};

/** Padding to put new code in, first fit. */
export class Padding {
  private readonly runs: { from: number; to: number }[] = [];

  constructor(buf: Buffer) {
    const o = overlayOf(buf);
    for (let v = o.base + 0x84; v < o.end; v += 4) {
      if (word(o, v) !== 0 || word(o, v - 4) === 0) continue;
      let end = v;
      while (end < o.end && word(o, end) === 0) end += 4;
      // A handler's first word is 0.
      if (isHandler(o, end - 4)) end -= 4;
      if (end % 16 !== 0 && end !== o.end) continue;
      const before = word(o, v - 4)!;
      const afterCode = word(o, v - 8) === JR_RA;
      if (!afterCode && !owns(o, before)) continue;
      // A word clear before (unless a function ended there) and after.
      this.runs.push({ from: afterCode ? v : v + 4, to: end - 4 });
    }
  }

  take(words: number): number | null {
    const run = this.runs.find((r) => r.to - r.from >= words * 4);
    if (!run) return null;
    const from = run.from;
    run.from += words * 4;
    return from;
  }
}

export interface DemoTask {
  /** The handler the load step goes on to (EU 0x09A61BB0), and Press START. */
  next: number;
  pressStart: number;
  /** The load step's own handler (EU 0x09A61B90): the save check goes on to it on a cold boot only. */
  loadEntry: number;
  /** The EBOOT function that applies the save's options after a load. */
  applyOptions: number;
  /** The autoload's call and the autoload. */
  autoloadCall: number;
  autoload: number;
  /** The pressed-buttons word, and confirm's bit in it. */
  pad: number;
  confirm: number;
  /** The language choice's fade-in call, its wait for confirm and its fade-out call, where there's one (EU). */
  language: { fadeIn: number; wait: number; fadeOut: number } | null;
}

/** What `village` needs of the title menu's EBOOT stub: the save's pointer. */
export function findSavePointer(eboot: Buffer): number | string {
  const segment = codeSegment(eboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const found = findUnique(eboot, segment, [TITLE_STUB], addressMask)[0];
  if (found == null) return "this EBOOT's title menu doesn't match";
  const offset = segment.offset + (found - segment.vaddr);
  return hiLo(eboot.readUInt32LE(offset), eboot.readUInt32LE(offset + 4));
}

/** The pressed-buttons word and confirm, from the title screen's checks: `lui; lw; andi START | confirm`. */
function findPad(o: Overlay): { pad: number; confirm: number } | string {
  const pads = new Set<string>();
  for (let v = o.base + 0x80; v + 12 <= o.end; v += 4) {
    const [lui, lw, andi] = [0, 4, 8].map((k) => word(o, v + k)!);
    const reg = (lui! >>> 16) & 31;
    if (OP(lui!) !== 0x0f || OP(lw!) !== 0x23 || OP(andi!) !== 0x0c) continue;
    if (((lw! >>> 21) & 31) !== reg || ((lw! >>> 16) & 31) !== ((andi! >>> 21) & 31)) continue;
    const mask = andi! & 0xffff;
    if (mask !== (START | 0x4000) && mask !== (START | 0x2000)) continue;
    pads.add(`${hiLo(lui!, lw!)}:${mask & ~START}`);
  }
  if (pads.size !== 1) return "its title screen's button checks don't match";
  const [pad, confirm] = [...pads][0]!.split(":").map(Number);
  return { pad: pad!, confirm: confirm! };
}

export function findDemoTask(buf: Buffer): DemoTask | string {
  const o = overlayOf(buf);
  const step = findOne(o, LOAD_STEP);
  if (step === null) return "its load step doesn't match";
  const autoloadCall = step + AUTOLOAD_CALL * 4;
  const autoload = jumpTarget(word(o, autoloadCall)!, autoloadCall);
  // The step then loads its next handler: lui $v0, hi; lwc1 $f1, lo($v0).
  let next: number | null = null;
  for (let pc = step; pc < step + 0x100 && next === null; pc += 4) {
    const [lui, lwc1] = [word(o, pc) ?? 0, word(o, pc + 4) ?? 0];
    if (lui >>> 16 === 0x3c02 && lwc1 >>> 16 === 0xc441) next = hiLo(lui, lwc1);
  }
  if (next === null || !isHandler(o, next) || !isHandler(o, next - 16))
    return "its load step's next handler doesn't match";
  const pressStart = word(o, next - 16 + 8)!;
  // The table runs in order: the load step's own handler is the one before Press START.
  const loadEntry = next - 32;
  const stepStart = isHandler(o, loadEntry) ? word(o, loadEntry + 8)! : 0;
  if (stepStart > step || step - stepStart > 0x100) return "its load step's handler doesn't match";
  const apply = findAll(o, APPLY_OPTIONS).filter((v) => v > step && v - step < 0x100);
  if (apply.length !== 1) return "its load step doesn't apply options as expected";
  const applyCall = apply[0]! + APPLY_CALL * 4;
  const applyOptions = jumpTarget(word(o, applyCall)!, applyCall);
  const idles = Array.from({ length: 0x80 }, (_, k) => word(o, pressStart + k * 4));
  if (!idles.includes(PRESS_START_IDLE)) return "its Press START doesn't match";
  if (findAll(o, END_TO_TITLE, (w) => w).length === 0)
    return "its handlers don't end tasks as expected";
  const pad = findPad(o);
  if (typeof pad === "string") return pad;
  const fade = findOne(o, LANGUAGE_FADE_IN);
  const confirm = findOne(o, masked(LANGUAGE_CONFIRM_FOR(pad.confirm)));
  const fadeOut =
    confirm === null
      ? []
      : findAll(o, LANGUAGE_FADE_OUT).filter(
          (v) => v > confirm && v - confirm <= LANGUAGE_FADE_OUT_WITHIN * 4,
        );
  const language =
    fade !== null && confirm !== null && fadeOut.length === 1
      ? {
          fadeIn: fade + LANGUAGE_FADE_CALL * 4,
          wait: confirm + LANGUAGE_WAIT * 4,
          fadeOut: fadeOut[0]! + FADE_OUT_CALL * 4,
        }
      : null;
  return { next, pressStart, loadEntry, applyOptions, autoloadCall, autoload, ...pad, language };
}
/** The language choice's check, with this disc's confirm. */
const LANGUAGE_CONFIRM_FOR = (confirm: number): number[] =>
  LANGUAGE_CONFIRM.map((w, k) => (k === 1 ? (0x30630000 | START | confirm) >>> 0 : w));

export interface ContTask {
  /**
   * The poll's `jal` and the poll; the fade-out's `jal` once it loaded; the
   * fade-in's `jal`, the fade and the fade object's pointer.
   */
  call: number;
  poll: number;
  loadedCall: number;
  /** Its post-load step's `jal` (`$a0` the save) and the step. */
  postLoadCall: number;
  postLoad: number;
  fadeCall: number;
  fade: number;
  fadePointer: number;
}

export function findContTask(buf: Buffer): ContTask | string {
  const o = overlayOf(buf);
  const calls = findOne(o, POLL_CALL);
  const fadeIn = findOne(o, CONT_FADE_IN);
  if (calls === null || fadeIn === null) return "its Load Game doesn't match";
  const loaded = calls + POLL_CALL.length * 4;
  if (!POLL_LOADED.every((s, k) => addressMask(word(o, loaded + k * 4) ?? 0) === s))
    return "its Load Game doesn't fade out as expected";
  const postLoad = findOne(o, POST_LOAD);
  if (postLoad === null) return "its Load Game's post-load step doesn't match";
  const postLoadCall = postLoad + POST_LOAD_CALL * 4;
  const call = calls + POLL_JAL * 4;
  const fadeCall = fadeIn + CONT_FADE_CALL * 4;
  return {
    call,
    poll: jumpTarget(word(o, call)!, call),
    loadedCall: loaded + LOADED_FADE_CALL * 4,
    postLoadCall,
    postLoad: jumpTarget(word(o, postLoadCall)!, postLoadCall),
    fadeCall,
    fade: jumpTarget(word(o, fadeCall)!, fadeCall),
    fadePointer: hiLo(word(o, fadeIn)!, word(o, fadeIn + 4)!),
  };
}

/** Task 2's new handler: ends it with next = Load Game. */
export const toLoadGame = (): number[] =>
  END_TO_TITLE.map((w, k) => (k === NEXT_ID ? (w & 0xffff0000) | LOAD_GAME : w) >>> 0);

const lo = (address: number, base: number): number => {
  const offset = address - (hi16(base) << 16);
  if (signed16(offset) !== offset) throw new Error(`0x${address.toString(16)} is out of reach`);
  return offset & 0xffff;
};
const luiAt = (address: number) => (0x3c010000 | hi16(address)) >>> 0;
const j = (target: number) => ((0x02 << 26) | ((target >>> 2) & 0x03ffffff)) >>> 0;
/** A branch at `from` to `to`, its opcode and registers in `base`. */
const branch = (base: number, from: number, to: number) =>
  (base | (((to - from - 4) >> 2) & 0xffff)) >>> 0;

export const AUTOLOAD_WORDS = 9;
/** The autoload's routine: confirm in its state 5, then the autoload with its `$a0`. */
export function autoloadWords(
  cave: number,
  autoload: number,
  pad: number,
  confirm: number,
): number[] {
  const go = cave + 7 * 4;
  return [
    0x8c890000 | SELECT_STATE, // lw $t1, 0xC($a0)
    0x25290000 | (-AUTOLOADED & 0xffff), // addiu $t1, $t1, -5
    branch(0x15200000, cave + 2 * 4, go), // bnez $t1, go
    luiAt(pad), // lui $at, hi(pad)
    0x8c2a0000 | lo(pad, pad), // lw $t2, lo(pad)($at)
    0x354a0000 | confirm, // ori $t2, $t2, confirm
    0xac2a0000 | lo(pad, pad), // sw $t2, lo(pad)($at)
    j(autoload), // go: j autoload
    NOP,
  ].map((w) => w >>> 0);
}

export const HANDLER_WORDS = 11;
/**
 * Task 2's new handler in the load step's place: the save check before it
 * sets the fade's state to 0 and keeps the old one at `+0x30`, which the
 * load step puts back (the screen is black); so does this, then it ends the
 * task with next = Load Game.
 */
export function handlerWords(fadePointer: number): number[] {
  return [
    luiAt(fadePointer), // lui $at, hi(fade object)
    0x8c280000 | lo(fadePointer, fadePointer), // lw $t0, lo(fade object)($at)
    0x8d09001c, // lw $t1, 0x1C($t0): the fade's state
    0x8d0a0030, // lw $t2, 0x30($t0): the one kept
    0x0149480a, // movz $t1, $t2, $t1
    0xad09001c, // sw $t1, 0x1C($t0)
    ...toLoadGame(),
  ].map((w) => w >>> 0);
}

export const FADE_WORDS = 8;
/** Load Game's fade in or out: skipped while Load Game came from boot and the screen is black. */
export function fadeWords(save: number, fade: number): number[] {
  return [
    luiAt(save), // lui $at, hi(save)
    0x8c2b0000 | lo(save, save), // lw $t3, lo(save)($at)
    (0x3c190000 | hi16(fade)) >>> 0, // lui $t9, hi(fade)
    0x916a0000 | TITLE_FIRST, // lbu $t2, 0x494($t3)
    0x27390000 | lo(fade, fade), // addiu $t9, $t9, lo(fade)
    0x03eac80b, // movn $t9, $ra, $t2: from boot, straight back
    0x03200008, // jr $t9
    NOP,
  ].map((w) => w >>> 0);
}

export const POLL_WORDS = 26;
/** The flag word's index in the poll's routine: set once the menu is the player's. */
export const SHOWN = 25;
/**
 * The select object's copy of an option byte (`save+0x6ADDC`, which the
 * boot autoload would have read): set, the list opens with no animation or
 * hunter previews.
 */
export const QUICK_LIST = 0x964;
/**
 * Load Game's poll: from boot and until the menu is shown, the quick list
 * and confirm in the waits; L, SELECT or START held before the list (while
 * the save is read), or a message, goes to `show` instead. Showing it
 * then, before the select object picks the quick list, opens the list as
 * ever, NOW LOADING hidden. Uses `$at` and `$t0`–`$t5`, which the poll's caller doesn't keep.
 */
export function pollWords(
  cave: number,
  poll: number,
  show: number,
  save: number,
  pad: number,
  confirm: number,
): number[] {
  const POLL = cave + 23 * 4;
  const flag = cave + SHOWN * 4;
  const words = [
    luiAt(save), // lui $at, hi(save)
    0x8c2b0000 | lo(save, save), // lw $t3, lo(save)($at)
    0x8c890000 | SELECT_STATE, // lw $t1, 0xC($a0): the select object's state
    0x916a0000 | TITLE_FIRST, // lbu $t2, 0x494($t3): set until the title menu runs
    luiAt(flag), // lui $at, hi(flag)
    0x8c2b0000 | lo(flag, flag), // lw $t3, lo(flag)($at)
    0x000b500b, // movn $t2, $zero, $t3: not once the menu is shown
    branch(0x11400000, cave + 7 * 4, POLL), // beqz $t2, poll
    luiAt(pad), // lui $at, hi(pad)
    0xa08a0000 | QUICK_LIST, // sb $t2, 0x964($a0): 1, the quick list
    0x8c280000 | lo(pad - 4, pad), // lw $t0, lo(held)($at)
    0x252c0000 | (-LIST & 0xffff), // addiu $t4, $t1, -3
    0x2d8c0000 | WAITS, // sltiu $t4, $t4, 3: the list, Yes/No, "Load completed."
    0x31080000 | MENU_BUTTONS, // andi $t0, $t0, L | SELECT | START
    0x000c400b, // movn $t0, $zero, $t4: held counts until the list (the waits confirm)
    0x2d2d0000 | MESSAGES, // sltiu $t5, $t1, 9
    0x014d400a, // movz $t0, $t2, $t5: a message always
    branch(0x15000000, cave + 17 * 4, show), // bnez $t0, show
    0x8c2a0000 | lo(pad, pad), // lw $t2, lo(pad)($at): pressed
    branch(0x11800000, cave + 19 * 4, POLL), // beqz $t4, poll
    0x354a0000 | confirm, // ori $t2, $t2, confirm
    j(poll), // j poll
    0xac2a0000 | lo(pad, pad), // sw $t2, lo(pad)($at)
    j(poll), // poll: j poll
    NOP,
    0, // the flag
  ].map((w) => w >>> 0);
  if (words.length !== POLL_WORDS) throw new Error("the routine's length is off");
  return words;
}

export const SHOW_WORDS = 18;
/**
 * Fades in, drops the quick list and marks the menu shown, then polls. It clears `save+0x494`,
 * so Load Game fades out as ever once the menu has been on screen.
 */
export function showWords(
  flag: number,
  poll: number,
  fade: number,
  fadePointer: number,
  save: number,
): number[] {
  return [
    0x27bdfff0, // addiu $sp, $sp, -16
    0xafbf0000, // sw $ra, 0($sp)
    0xafa40004, // sw $a0, 4($sp)
    0xa0800000 | QUICK_LIST, // sb $zero, 0x964($a0): the list as ever
    luiAt(flag), // lui $at, hi(flag)
    0xac3f0000 | lo(flag, flag), // sw $ra, lo(flag)($at): nonzero
    luiAt(save), // lui $at, hi(save)
    0x8c290000 | lo(save, save), // lw $t1, lo(save)($at)
    0xa1200000 | TITLE_FIRST, // sb $zero, 0x494($t1)
    luiAt(fadePointer), // lui $at, hi(fade object)
    0x8c240000 | lo(fadePointer, fadePointer), // lw $a0, lo(fade object)($at)
    0x24050010, // li $a1, 0x10
    jalTo(fade), // jal fade
    0x00003021, // move $a2, $zero: in
    0x8fbf0000, // lw $ra, 0($sp)
    0x8fa40004, // lw $a0, 4($sp)
    j(poll), // j poll
    0x27bd0010, // addiu $sp, $sp, 16
  ].map((w) => w >>> 0);
}

export const APPLY_WORDS = 5;
/**
 * Load Game's post-load step, after the save's options are applied (the
 * boot autoload's job, which `village` skips). The options function only
 * reads `$a0`, the save, and keeps the `$t` registers.
 */
export function applyWords(applyOptions: number, postLoad: number): number[] {
  return [
    0x03e06821, // move $t5, $ra
    jalTo(applyOptions), // jal apply
    NOP,
    j(postLoad), // j post-load
    0x01a0f821, // move $ra, $t5
  ].map((w) => w >>> 0);
}

const writeWords = (buf: Buffer, o: Overlay, vaddr: number, words: readonly number[]) =>
  words.forEach((w, k) => buf.writeUInt32LE(w >>> 0, at(o, vaddr + k * 4)));

export interface BootPatch {
  /** Whether the language choice was taken out (EU). */
  language: boolean;
}

/**
 * Patches the title screens' overlays in `edits` (Load Game's only for
 * `village`), after finding everything in the unedited ones. Returns what
 * it did, or why it can't.
 */
export function patchBoot(
  choice: BootSkip,
  demoTask: LoadedOverlay,
  contTask: LoadedOverlay,
  eboot: Buffer,
  edits: Pick<Edits, "overlay">,
): BootPatch | string {
  if (choice === "normal") return { language: false };
  const vanillaDemo = demoTask.ovl.reader.buf;
  const d = findDemoTask(vanillaDemo);
  if (typeof d === "string") return `demo_task.ovl: ${d}`;
  const o = overlayOf(vanillaDemo);
  const demoSpace = new Padding(vanillaDemo);
  const autoloadCave = demoSpace.take(AUTOLOAD_WORDS);
  const handler = choice === "village" ? demoSpace.take(HANDLER_WORDS) : 0;
  if (autoloadCave === null || handler === null) return "demo_task.ovl: it has no room";

  let cont: (() => void) | null = null;
  if (choice === "village") {
    const vanillaCont = contTask.ovl.reader.buf;
    const c = findContTask(vanillaCont);
    if (typeof c === "string") return `cont_task.ovl: ${c}`;
    const save = findSavePointer(eboot);
    if (typeof save === "string") return save;
    const co = overlayOf(vanillaCont);
    const space = new Padding(vanillaCont);
    const fadeCave = space.take(FADE_WORDS);
    const pollCave = space.take(POLL_WORDS);
    const showCave = space.take(SHOW_WORDS);
    const applyCave = space.take(APPLY_WORDS);
    if (fadeCave === null || pollCave === null || showCave === null || applyCave === null)
      return "cont_task.ovl: it has no room";
    const flag = pollCave + SHOWN * 4;
    cont = () => {
      const buf = edits.overlay(contTask);
      writeWords(buf, co, fadeCave, fadeWords(save, c.fade));
      writeWords(buf, co, pollCave, pollWords(pollCave, c.poll, showCave, save, d.pad, d.confirm));
      writeWords(buf, co, showCave, showWords(flag, c.poll, c.fade, c.fadePointer, save));
      writeWords(buf, co, applyCave, applyWords(d.applyOptions, c.postLoad));
      // The fade-in's routine passes its arguments on: it serves the fade-out too.
      buf.writeUInt32LE(jalTo(fadeCave), at(co, c.fadeCall));
      buf.writeUInt32LE(jalTo(fadeCave), at(co, c.loadedCall));
      buf.writeUInt32LE(jalTo(pollCave), at(co, c.call));
      buf.writeUInt32LE(jalTo(applyCave), at(co, c.postLoadCall));
      writeWords(demo, o, handler, handlerWords(c.fadePointer));
      demo.writeUInt32LE(handler, at(o, d.loadEntry + 8));
    };
  }

  const demo = edits.overlay(demoTask);
  writeWords(demo, o, autoloadCave, autoloadWords(autoloadCave, d.autoload, d.pad, d.confirm));
  demo.writeUInt32LE(jalTo(autoloadCave), at(o, d.autoloadCall));
  if (d.language) {
    demo.writeUInt32LE(NOP, at(o, d.language.fadeIn));
    demo.writeUInt32LE(NOP, at(o, d.language.wait));
    demo.writeUInt32LE(NOP, at(o, d.language.fadeOut));
  }
  // The load step goes on to Press START either way; `village` doesn't reach it on a cold boot.
  demo.writeUInt32LE(d.pressStart, at(o, d.next + 8));
  if (cont) cont();
  return { language: d.language !== null };
}

const TITLE = "Boot";

export function bootReport(
  choice: BootSkip,
  demoTask: LoadedOverlay | null,
  contTask: LoadedOverlay | null,
  result: BootPatch | string,
  region: string,
): Report {
  const why =
    !demoTask || !contTask
      ? "its title overlays couldn't be read"
      : typeof result === "string"
        ? result
        : null;
  if (why !== null || typeof result === "string")
    return {
      title: TITLE,
      notes: [`The faster start isn't in this image: ${why}.`],
      lines: [],
      summary: `${TITLE}: not applied (${why})`,
    };
  const confirm = region === "jp" ? "○" : "×";
  const language = result.language
    ? ["The game keeps the PSP's language, with no language choice."]
    : [];
  const notes =
    choice === "title"
      ? ["The game boots to Press START: no notice, logos, intro movie or wait.", ...language]
      : [
          "The game boots straight into the village with the hunter saved last (else the first slot with a save), with no menu on screen.",
          `Hold START (or L or SELECT) from power-on to choose a slot; ${confirm} then works as ever.`,
          "Load Game from the title menu shows the slots as ever.",
          ...language,
        ];
  return { title: TITLE, notes, lines: [], summary: `${TITLE}: ${notes.join(" ")}` };
}
