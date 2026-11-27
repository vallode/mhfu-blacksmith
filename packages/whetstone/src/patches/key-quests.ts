/**
 * Key quests (`quests.keyLabel`): a yellow star (★) in the top right corner of the
 * quest counter's card in town when the quest it shows is a key quest, one of
 * those its star needs cleared before the Urgent Quest shows. Drawn by blob code
 * (`blob/key-quests.c`) on a game hook around the card's drawing
 * (`game-hooks.ts`, hook 6).
 *
 * What the game does (found in `lobby_task.ovl` on the EU and JP (FUC)
 * discs, from savestates of the Village Chief's card):
 *
 * - The quest counters (the Village Chief's and the Guild's) draw from one
 *   object. Its draw step calls the card function (EU 0x09A8CA40, JP
 *   0x09A87B20) in two of its states, from one place, every frame the card
 *   shows: every page of it, and the confirmation after.
 * - The card reads the shown quest from a copy of its board record
 *   (`game/board.ts`: the header's 0x4c-0x7f, quest type first) at a fixed
 *   address (EU 0x09B03F40), which a getter returns (its first call). Bit 26
 *   of the quest type marks a key quest, bit 25 an Urgent Quest: on the EU
 *   disc's boards, 77 records have bit 26 and 22 bit 25.
 * - It draws every line with `print(printer, x, y, shadow, colour, text,
 *   dx, dy)` (EU 0x0889198C): the text in `colour` at x, y over itself in
 *   `shadow` at x + dx, y + dy. It sets the glyph size first with a setter
 *   (EU 0x08890DE8) on the printer, a global. "CLEAR!!" is glyph size 14,
 *   colour 5 (yellow) over shadow colour 1, offset 2, 2.
 * - Its layout is a table of (x, y) pairs (EU 0x09B04728, the same values on
 *   JP): the card's left and top at `+0x18` (232, 32), its width and height
 *   at `+0x1c` (240, 238), "CLEAR!!" at `+0x3c` (240, 42), 8 in from the
 *   card's left. The quest type is centred on that row, so the star mirrors
 *   "CLEAR!!": 8 in from the card's right (x 450), level with it, clear of
 *   even the longest quest type ("TreasureHuntersQuest" ends at x 422). The
 *   font has ★ (the quest details' "LV★★★"), two columns wide; both
 *   discs' text is UTF-8 (FUC's "LV★" too), so the blob's bytes are the
 *   game's own.
 *
 * The card function is found by its first 18 words with every immediate
 * masked (the two discs' differ only there), and the routines and globals by
 * what the card does with them, so both discs work. The blob sets the glyph
 * size by writing the three bytes the setter writes (it saves and restores
 * them, and the line height can be set apart from the size), so the setter's
 * code is checked to be just those stores.
 */
import { decodeObjects } from "../blob/link.js";
import { KEY_QUESTS_OBJECTS } from "../blob/key-quests-object.js";
import type { Report } from "../report.js";
import { codeSegment, findUnique, hiLo, jumpTarget, maskImmediates } from "./mips.js";

/** The card's first words, from its `addiu $sp, $sp, -n`, every immediate masked (`maskImmediates`). */
export const QUEST_CARD_SIGNATURE = [
  0x27bd0000, 0xafbf0000, 0xafbe0000, 0xafb70000, 0xafb60000, 0xafb50000, 0xafb40000, 0xafb30000,
  0xafb20000, 0xafb10000, 0xafb00000, 0x94850000, 0x3c120000, 0x3c110000, 0x0080a821, 0x26520000,
  0x0c000000, 0x26310000,
];
/**
 * The glyph size setter `(printer, w, h)`: `sb $a1, 0x12c($a0)`, `sb $a2,
 * 0x12d($a0)`, `lbu $v1, 0x12d($a0)`, `jr $ra`, `sb $v1, 0x15f($a0)`. The
 * offsets are the blob's `PRINTER_GLYPH_W`, `_H` and `PRINTER_LINE_H`.
 */
export const GLYPH_SETTER = [0xa085012c, 0xa086012d, 0x9083012d, 0x03e00008, 0xa083015f];
/** How far into the card the calls it's read for are. */
const SCAN_BYTES = 0x200;
/** How far before a call its `$a0` global's `lui` and `lw` may be. */
const GLOBAL_WINDOW = 8 * 4;
const SCREEN_WIDTH = 480;
/** The layout table's fields: the card's left and width, and "CLEAR!!" (the top row's left). */
const LAYOUT_CARD_LEFT = 0x18;
const LAYOUT_CARD_WIDTH = 0x1c;
const LAYOUT_CLEAR_X = 0x3c;
const LAYOUT_CLEAR_Y = 0x3e;

/** The label's width: ★, two columns of half the card's 14-pixel glyphs. */
export const LABEL_WIDTH = 2 * 7;

const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);

const DELAY = {
  /** `move $a2, $a1`: the glyph size setter's (printer, w, h) with w = h. */
  glyph: 0x00a03021,
  /** `move $t3, $t2`: the print's shadow offsets, dx = dy. */
  print: 0x01405821,
} as const;
const A0 = 4;
const V0 = 2;
const LW_A0_V0 = 0x8c440000;
const LUI_V0 = 0x3c020000;

/**
 * Whether `w` may change `reg` or leave straight-line code: a write to it,
 * or any jump, branch or call (a call clobbers the argument and return
 * registers). Stores, `jr`'s and the like write nothing.
 */
function clobbers(w: number, reg: number): boolean {
  const op = w >>> 26;
  const rt = (w >>> 16) & 31;
  const rd = (w >>> 11) & 31;
  if (op === 0) {
    const funct = w & 63;
    if (funct === 0x08 || funct === 0x09) return true; // jr, jalr
    if (funct >= 0x18 && funct <= 0x1b) return false; // mult, multu, div, divu
    return rd === reg;
  }
  if (op === 0x01 || op === 0x02 || op === 0x03) return true; // regimm branches, j, jal
  if ((op >= 0x04 && op <= 0x07) || (op >= 0x14 && op <= 0x17)) return true; // branches
  if (op >= 0x28 && op <= 0x2f) return false; // stores
  if (op === 0x1c || op === 0x1f) return rd === reg; // SPECIAL2, SPECIAL3
  return rt === reg;
}

export interface KeyQuestSites {
  /** The card function's vaddr. */
  card: number;
  /** File offset in `lobby_task.ovl` of its one call. */
  call: number;
  /** The blob's externs (`blob/key-quests.c`). */
  externs: Record<string, number>;
}

/**
 * The card, its call and what the label needs, or why they can't be found.
 * `eboot` is the vanilla EBOOT ELF, for the glyph size setter.
 */
export function findKeyQuestSites(
  lobbyTask: Buffer,
  base: number,
  eboot: Buffer,
): KeyQuestSites | string {
  const mismatch = "this game's quest card doesn't match";
  const lobby = { offset: 0, vaddr: base, size: lobbyTask.length };
  const [found] = findUnique(lobbyTask, lobby, [QUEST_CARD_SIGNATURE], maskImmediates);
  if (found == null) return mismatch;
  const card = found;
  const start = card - base;
  const offsetOf = (vaddr: number) => vaddr - base;
  const inFile = (vaddr: number, bytes = 4) =>
    offsetOf(vaddr) >= 0 && offsetOf(vaddr) + bytes <= lobbyTask.length;

  // The record: the getter (the card's first call) is `lui $v0; jr $ra; addiu $v0, $v0`.
  const getterCall = start + 0x40;
  const getter = jumpTarget(word(lobbyTask, getterCall), base + getterCall);
  if (!inFile(getter, 12)) return mismatch;
  const g = [0, 4, 8].map((k) => word(lobbyTask, offsetOf(getter) + k));
  if (g[0]! >>> 16 !== 0x3c02 || g[1] !== 0x03e00008 || g[2]! >>> 16 !== 0x2442) return mismatch;
  const record = hiLo(g[0]!, g[2]!);

  // The layout table: `lui $s2` (+0x30) and `addiu $s2, $s2` (+0x3c).
  const layout = hiLo(word(lobbyTask, start + 0x30), word(lobbyTask, start + 0x3c));
  if (!inFile(layout, LAYOUT_CLEAR_Y + 2)) return mismatch;
  const field = (at: number) => lobbyTask.readInt16LE(offsetOf(layout) + at);
  const cardRight = field(LAYOUT_CARD_LEFT) + field(LAYOUT_CARD_WIDTH);
  const inset = field(LAYOUT_CLEAR_X) - field(LAYOUT_CARD_LEFT);

  /**
   * The first call whose delay slot is `delay`, and with `global`, the
   * address its `$a0` is loaded from: `lui $v0, hi` then `lw $a0, lo($v0)`
   * a few words before it, with nothing between that changes `$v0`, and
   * nothing after the `lw` that changes `$a0`.
   */
  const callWith = (delay: number, global: boolean) => {
    const end = Math.min(start + SCAN_BYTES, lobbyTask.length - 8);
    for (let at = start; at <= end; at += 4) {
      if (word(lobbyTask, at) >>> 26 !== 0x03 || word(lobbyTask, at + 4) !== delay) continue;
      const target = jumpTarget(word(lobbyTask, at), base + at);
      if (!global) return { target, global: 0 };
      const from = Math.max(start, at - GLOBAL_WINDOW);
      let lw = at - 4;
      while (lw >= from && (word(lobbyTask, lw) & 0xffff0000) >>> 0 !== LW_A0_V0) {
        if (clobbers(word(lobbyTask, lw), A0)) return null;
        lw -= 4;
      }
      if (lw < from) return null;
      let lui = lw - 4;
      while (lui >= from && (word(lobbyTask, lui) & 0xffff0000) >>> 0 !== LUI_V0) {
        if (clobbers(word(lobbyTask, lui), V0)) return null;
        lui -= 4;
      }
      if (lui < from) return null;
      return { target, global: hiLo(word(lobbyTask, lui), word(lobbyTask, lw)) };
    }
    return null;
  };
  const glyph = callWith(DELAY.glyph, true);
  const print = callWith(DELAY.print, false);
  if (!glyph || !print) return mismatch;

  // The setter is in the EBOOT: the blob writes what it writes.
  const segment = codeSegment(eboot);
  const setter =
    segment &&
    glyph.target >= segment.vaddr &&
    glyph.target + GLYPH_SETTER.length * 4 <= segment.vaddr + segment.size
      ? segment.offset + (glyph.target - segment.vaddr)
      : null;
  if (setter === null || !GLYPH_SETTER.every((w, k) => word(eboot, setter + k * 4) === w)) {
    return "this game's glyph size setter doesn't match";
  }

  const calls: number[] = [];
  for (let at = 0; at + 4 <= lobbyTask.length; at += 4) {
    const w = word(lobbyTask, at);
    if (w >>> 26 === 0x03 && jumpTarget(w, base + at) === card) calls.push(at);
  }
  if (calls.length !== 1) return "this game's quest counter doesn't match";

  const x = cardRight - inset - LABEL_WIDTH;
  const y = field(LAYOUT_CLEAR_Y);
  if (inset < 0 || x <= field(LAYOUT_CLEAR_X) || x >= SCREEN_WIDTH || y <= 0) return mismatch;
  return {
    card,
    call: calls[0]!,
    externs: {
      rf_card_record: record,
      rf_card_printer: glyph.global,
      rf_card_print: print.target,
      rf_key_x: x,
      rf_key_y: y,
    },
  };
}

export const keyQuestsObjects = () => decodeObjects(KEY_QUESTS_OBJECTS);

const TITLE = "Key quests";

/** The spoiler's report, once the code loader says whether it went in. */
export const keyQuestsReport = (applied: boolean): Report => ({
  title: TITLE,
  notes: [
    applied
      ? "The quest counters' cards show a yellow ★ in their top right corner for a key quest: one its star needs cleared before the Urgent Quest shows."
      : "Key quests aren't marked: the code loader isn't in this image.",
  ],
  lines: [],
  summary: `${TITLE}: ${applied ? "marked on the quest cards" : "not applied (no code loader)"}`,
});
