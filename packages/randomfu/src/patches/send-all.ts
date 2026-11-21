/**
 * Send All to Item Box (`rewards.sendAll`): a fourth row in the reward
 * screen's menu, between "Send to Item Box" and "End", that sends every
 * reward the Item Box can take at once and ends the screen (as End does with
 * nothing left). The blob code is `blob/send-all.c`,
 * on the pad hook and hook 8 (the quest START menu's draw, and the reward
 * menu's label call, which this adds: `CALL_SITE.rewardLabel`); this finds
 * the game's addresses per disc and lengthens the game's menu.
 *
 * What the game does (EBOOT code, the same on the EU and JP discs but for
 * addresses and the confirm button, × on EU and ○ on JP):
 *
 * - A completed quest's results step (`game_task` runs it, EU 0x08874C58)
 *   rolls the rewards into the save's `+0x390` (32 slots of u16 item, s16
 *   amount: 8 a row, 4 rows; the Felyne comrade's items use 2), then runs
 *   the reward screen each frame: `update(hud, 1)` (EU 0x08823E18) and
 *   `draw(hud, 0)` (EU 0x08824B14), right after it. Town (`lobby_task`)
 *   runs the same screen with `update(hud, 0)` and `draw(hud, 1)`, whose
 *   own list (EU 0x089AD0FC, rows 22) this leaves at three rows.
 * - The screen's state is in the HUD object: `+0x120A` (0 the menu, 1
 *   taking items to the pouch, 2 sending them to the box, 3 swapping with
 *   the pouch, 4 the "Sell remaining items?" question, 6 done), `+0x120B`
 *   the menu row, `+0x120C` the item cursor, `+0x1214` the time left
 *   (3600, a tick a frame) and `+0x1218` set for the comrade's items.
 * - The menu is a list window from a template (EU 0x08938628, only this
 *   screen's: rows at `+0xA`, 3, and the row height at `+8`, which the draw
 *   writes before each list) whose names are game_task message IDs
 *   (box()'s names 4): "Take reward", "Send to Item Box", "End" (EU
 *   0x089B5564), or "Take Comrade's Items" first (EU 0x089B556C). Each list
 *   is 3 IDs and a 0xFFFF; box() stops at its rows, so the 0xFFFF can be a
 *   fourth ID.
 * - In the menu, up and down move the row (`nav(hud, &row, buttons, 3)`),
 *   the confirm button takes row 0 to state 1, row 1 to state 2 and any
 *   other row to the end (state 4 with rewards left, else 6), and the back
 *   button moves to row 2 (`li $v0, 2`). The help bar shows message row + 4
 *   of group 6 (HUD `+0x5FE`, `+0x5FC`), drawn by the quest HUD's menu
 *   layer (hook 8's quest draw); 0xFFFF draws none.
 * - Sending one item: `can_store(obj, item)` (EU 0x0885C498) is 0 for an
 *   item the box can't take; `add_to_box(save, item, amount, 0xFFFF)` (EU
 *   0x08853ABC) returns the amount that didn't fit; then `item_seen(save,
 *   item)` (EU 0x08858F1C), the slot's emptied or left with what didn't
 *   fit, and sound 25 plays (21 when nothing fit).
 * - Ending with rewards left sells them: their sell price (the item table's
 *   `+0x10`) times the amount goes to the zenny.
 *
 * The EBOOT changes, for the quest's screen and not town's: each draw branch
 * writes its rows with its row height (an `sw` of both halves for the
 * `sh`), 4 rows of 20 pixels for the quest's two lists and 3 of 22 for
 * town's, with the window 14 higher (town's too) to clear the time left
 * below it; each quest list's 0xFFFF becomes End's ID (so row 2 reads "End"
 * unless the blob renames it); and the update's `nav` rows and back row
 * become 3 + and 2 + its second argument (`$s7`: 1 in the quest, 0 in
 * town). Without the blob the new row ends, as End.
 */
import { SEND_ALL_OBJECTS } from "../blob/send-all-object.js";
import { decodeObjects } from "../blob/link.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import type { HookCall, HookSites } from "./game-hooks.js";
import { BOX_SIGNATURE } from "./menu.js";
import { findUnique, hi16, hiLo, jalTo, jumpTarget, luiLwAddress, maskImmediates } from "./mips.js";

/** The reward screen's update (EU 0x08823E18), masked. */
export const REWARD_UPDATE_SIGNATURE = [
  0x27bd0000, 0xafbf0000, 0xafb70000, 0xafb60000, 0xafb50000, 0xafb40000, 0xafb30000, 0xafb20000,
  0xafb10000, 0xafb00000, 0x0080a021, 0x3c020000, 0x8c440000, 0x0c000000, 0x00a0b821, 0x30530000,
  0x92820000, 0x54400000, 0x24120000, 0x24120000,
];
/** Its draw (EU 0x08824B14), masked. */
export const REWARD_DRAW_SIGNATURE = [
  0x27bd0000, 0xafbf0000, 0xafb10000, 0xafb00000, 0x24020000, 0xa0820000, 0x00808821, 0x3c020000,
  0x00a08021, 0x8c440000, 0x0c000000, 0x24050000, 0x0c000000, 0x02202021, 0x56000000, 0x24020000,
  0x24020000, 0xa2220000, 0x3c020000, 0x8c440000,
];
/** The help bar's draw (EU 0x08819128), masked. */
export const HELP_DRAW_SIGNATURE = [
  0x27bd0000, 0xafbf0000, 0xafb50000, 0xafb40000, 0xafb30000, 0xafb20000, 0xafb10000, 0x00808821,
  0x30a40000, 0xafb00000, 0x28810000, 0x10200000, 0x00e08021, 0x30d20000, 0x34030000, 0x52430000,
  0x8fbf0000, 0x24020000, 0x54820000, 0x8e230000,
];

/** Words of the update, from its start, as they are on both discs (masked: `maskImmediates`). */
const UPDATE = {
  soundLui: 0x6c, // lui $v0, hi(sound object)
  soundLw: 0x70, // lw $a0, lo($v0)
  sound: 0x8c, // jal sound
  canStoreLui: 0xf4,
  canStoreLw: 0x14c,
  canStore: 0x150,
  rows: 0x1a4, // li $a3, 3: nav's rows
  confirm: 0x1c0, // andi $v0, $v1, confirm
  back: 0x1c8, // andi $v0, $v1, back
  backRow: 0x264, // li $v0, 2: the row back goes to
  addToBox: 0x72c,
  itemSeen: 0x74c,
} as const;
const UPDATE_WORDS: readonly [number, number][] = [
  [UPDATE.soundLui, 0x3c020000],
  [UPDATE.soundLw, 0x8c440000],
  [UPDATE.sound, 0x0c000000],
  [UPDATE.canStoreLui, 0x3c020000],
  [UPDATE.canStoreLw, 0x8c440000],
  [UPDATE.canStore, 0x0c000000],
  [UPDATE.rows - 4, 0x0c000000], // jal nav
  [UPDATE.confirm, 0x30620000],
  [UPDATE.back, 0x30620000],
  [UPDATE.backRow - 4, 0x92830000], // lbu $v1, row($s4)
  [UPDATE.backRow + 4, 0x10620000], // beq $v1, $v0
  [UPDATE.backRow + 0xc, 0xa2820000], // sb $v0, row($s4)
  [UPDATE.addToBox, 0x0c000000],
  [UPDATE.itemSeen, 0x0c000000],
];
/** The exact words changed: nav's 3 rows and back's row 2. */
const ROWS_WORD = 0x24070003;
const BACK_ROW_WORD = 0x24020002;

/** Words of the draw: where it sets the template's names, from its start. */
const DRAW = {
  comradeLui: 0x464,
  comradeAddiu: 0x468,
  templateLui: 0x480,
  templateAddiu: 0x48c,
  rewardLui: 0x4ac, // in the delay slot of the branch to its addiu
  rewardAddiu: 0x4f4,
} as const;
const DRAW_WORDS: readonly [number, number][] = [
  [DRAW.comradeLui, 0x3c030000],
  [DRAW.comradeAddiu, 0x24630000],
  [DRAW.templateLui, 0x3c050000],
  [DRAW.templateAddiu, 0x24a50000],
  [DRAW.rewardLui, 0x3c030000],
  [DRAW.rewardAddiu, 0x24630000],
  [0x498, 0x0c000000], // each list's jal box-from-template, names 4
  [0x49c, 0x24090000],
  [0x524, 0x0c000000],
  [0x528, 0x24090000],
];
const NAMES_MESSAGES = 0x24090004; // li $t1, 4
/**
 * The update and draw's second argument says whose screen it is (above), so
 * each must be called with 0 or 1 (`move $a1, $zero` or `li $a1, 1` in the
 * delay slot). Checked on each disc, in the EBOOT and the overlays given:
 * every `jal`, and no pointer to them (a word, or a `lui` and `addiu` making
 * the address) that could call them otherwise.
 */
const SECOND_ARGS = [0x00002821, 0x24050001];

/** Code to check for calls to the draw: the buffer and the bytes of it that are code. */
export interface CodeRange {
  code: Buffer;
  offset: number;
  size: number;
}

/** The `jal`s of `target` in `ranges`, by what's in their delay slot; null if anything else refers to it. */
function callsTo(ranges: readonly CodeRange[], target: number): number[] | null {
  const jal = jalTo(target);
  const hi = target >>> 16;
  const high = ((target + 0x8000) >>> 16) & 0xffff;
  const low = target & 0xffff;
  const slots: number[] = [];
  for (const { code, offset, size } of ranges) {
    const end = Math.min(code.length, offset + size);
    const word = (at: number) => (at + 4 <= end ? code.readUInt32LE(at) : 0);
    for (let at = offset; at + 4 <= end; at += 4) {
      const w = word(at);
      if (w === jal) slots.push(word(at + 4));
      else if (w === target) return null;
      else if (w >>> 26 === 0x0f && ((w & 0xffff) === high || (w & 0xffff) === hi)) {
        // lui $r: an addiu (its sign-adjusted half) or ori of the low half on $r in the next few words.
        const r = (w >>> 16) & 31;
        for (let k = 1; k <= 4; k++) {
          const next = word(at + k * 4);
          const op = next >>> 26;
          if (((next >>> 21) & 31) !== r || (next & 0xffff) !== low) continue;
          if ((op === 0x09 && (w & 0xffff) === high) || (op === 0x0d && (w & 0xffff) === hi)) {
            return null;
          }
        }
      }
    }
  }
  return slots;
}
const TEMPLATE_ROWS = 0xa;
/** The window's top, in the template. */
const TEMPLATE_Y = 0x2;
/** The row height, the half before the rows. */
const TEMPLATE_ROW_HEIGHT = 0x8;
/**
 * Where each draw branch sets the template's row height: `li $v1, height;
 * lui $v0, hi(template); sh $v1, lo(template + 8)($v0)`, after `lui $v0`
 * (the same) and `sw` of its names. Four rows of the quest's heights (24 the
 * comrade's, 22 the rewards') would run into the time left below, so they're
 * made 20 and the window moved up 14, where its bottom was with the rewards'
 * three (the comrade's ends 6 higher). Town's keeps 3 rows of 22.
 */
const BRANCHES = [
  { offset: 0x474, height: 24, rows: 4 }, // the comrade's
  { offset: 0x4c0, height: 22, rows: 3 }, // town's
  { offset: 0x500, height: 22, rows: 4 }, // the rewards'
] as const;
const ROW_HEIGHT = 20;
const RAISE = 14;
const LIST_ROWS = 3;
/** The update's `nav` rows and back row, from its second argument in `$s7`: `addiu $a3, $s7, 3`. */
const ROWS_BY_ARG = 0x26e70003;
const BACK_ROW_BY_ARG = 0x26e20002;

/** box()'s names 4: `lui $v0; jal msg; lw $a0`, its IDs in `$a2` (`lw $a2, 0x14($s4)`). */
const BOX = { names: 0x2a8, call: 0x328 } as const;
/** `lw $a2, 0x14($s4)`: the list's IDs. */
const BOX_NAMES_WORD = 0x8e860014;
const BOX_WORDS: readonly [number, number][] = [
  [BOX.names, 0x8e860000],
  [BOX.call - 4, 0x3c020000],
  [BOX.call, 0x0c000000],
  [BOX.call + 4, 0x8c440000],
];
/** The help draw's usual rect: `lui $s0; addiu $s0`. */
const HELP_RECT = 0x25c;

export interface SendAll {
  externs: Record<string, number>;
  /** The call it adds to hook 8: the first of `calls`, `CALL_SITE.rewardLabel`. */
  calls: HookCall[];
  /** The EBOOT changes, once the loader is in. */
  patch: (eboot: Buffer) => void;
}

/** The reward screen's sites, the blob's externs and the EBOOT changes, or why they can't be found. */
export function prepareSendAll(
  vanillaEboot: Buffer,
  sites: HookSites,
  overlays: readonly CodeRange[] = [],
): SendAll | string {
  const { segment } = sites;
  const [update, draw, list, help] = findUnique(
    vanillaEboot,
    segment,
    [REWARD_UPDATE_SIGNATURE, REWARD_DRAW_SIGNATURE, BOX_SIGNATURE, HELP_DRAW_SIGNATURE],
    maskImmediates,
  );
  if (update == null || draw == null) return "this EBOOT's reward screen doesn't match";
  if (list == null || help == null) return "this EBOOT's list window code doesn't match";
  const offsetOf = (vaddr: number) => segment.offset + (vaddr - segment.vaddr);
  const inSegment = (vaddr: number) =>
    vaddr >= segment.vaddr && vaddr + 4 <= segment.vaddr + segment.size;
  const at = (vaddr: number) => vanillaEboot.readUInt32LE(offsetOf(vaddr));
  const matches = (base: number, words: readonly [number, number][]) =>
    words.every(([offset, w]) => maskImmediates(at(base + offset)) === w);
  if (!matches(update, UPDATE_WORDS) || !matches(draw, DRAW_WORDS)) {
    return "this EBOOT's reward screen doesn't match";
  }
  if (at(draw + 0x49c) !== NAMES_MESSAGES || at(draw + 0x528) !== NAMES_MESSAGES) {
    return "this EBOOT's reward menu doesn't use the names randomfu expects";
  }
  if (at(update + UPDATE.rows) !== ROWS_WORD || at(update + UPDATE.backRow) !== BACK_ROW_WORD) {
    return "this EBOOT's reward menu doesn't have the rows randomfu expects";
  }
  const code = [{ code: vanillaEboot, ...segment }, ...overlays];
  for (const target of [update, draw]) {
    const slots = callsTo(code, target);
    if (!slots?.length || slots.some((slot) => !SECOND_ARGS.includes(slot))) {
      return "this disc runs the reward screen in a way randomfu doesn't expect";
    }
  }
  if (!matches(list, BOX_WORDS) || at(list + BOX.names) !== BOX_NAMES_WORD) {
    return "this EBOOT's list window code doesn't match";
  }

  const call = (offset: number) => jumpTarget(at(update + offset), update + offset);
  const template = hiLo(at(draw + DRAW.templateLui), at(draw + DRAW.templateAddiu));
  const rewardNames = hiLo(at(draw + DRAW.rewardLui), at(draw + DRAW.rewardAddiu));
  const comradeNames = hiLo(at(draw + DRAW.comradeLui), at(draw + DRAW.comradeAddiu));
  const helpRect = hiLo(at(help + HELP_RECT), at(help + HELP_RECT + 4));
  const half = (vaddr: number) => vanillaEboot.readUInt16LE(offsetOf(vaddr));
  if (![template + TEMPLATE_ROWS, rewardNames + 6, comradeNames + 6, helpRect].every(inSegment)) {
    return "this EBOOT's reward menu wasn't found";
  }
  const templateLui = 0x3c020000 | hi16(template);
  const heightLow = (template + TEMPLATE_ROW_HEIGHT) & 0xffff;
  const laidOut = BRANCHES.every(({ offset, height }) => {
    const word = (k: number) => at(draw + offset + k * 4);
    return (
      word(-2) === templateLui &&
      word(-1) >>> 16 === 0xac43 && // sw $v1, names($v0)
      word(0) === (0x24030000 | height) &&
      word(1) === templateLui &&
      word(2) === (0xa4430000 | heightLow) >>> 0 // sh $v1, height($v0)
    );
  });
  if (!laidOut || half(template + TEMPLATE_Y) < RAISE || (template + TEMPLATE_ROW_HEIGHT) % 4) {
    return "this EBOOT's reward menu isn't laid out as randomfu expects";
  }
  if (half(template + TEMPLATE_ROWS) !== LIST_ROWS) {
    return "this EBOOT's reward menu doesn't have the rows randomfu expects";
  }
  if (half(rewardNames + 6) !== 0xffff || half(comradeNames + 6) !== 0xffff) {
    return "this EBOOT's reward menu labels aren't where randomfu expects";
  }
  const confirm = at(update + UPDATE.confirm) & 0xffff;
  if (confirm !== 0x4000 && confirm !== 0x2000) {
    return "this EBOOT's reward menu buttons aren't the ones randomfu expects";
  }
  const label = list + BOX.call;

  return {
    externs: {
      rf_add_to_box: call(UPDATE.addToBox),
      rf_item_seen: call(UPDATE.itemSeen),
      rf_can_store: call(UPDATE.canStore),
      rf_can_store_object: luiLwAddress(
        at(update + UPDATE.canStoreLui),
        at(update + UPDATE.canStoreLw),
      ),
      rf_sound: call(UPDATE.sound),
      rf_sound_object: luiLwAddress(at(update + UPDATE.soundLui), at(update + UPDATE.soundLw)),
      rf_reward_names: rewardNames,
      rf_comrade_names: comradeNames,
      rf_reward_confirm: confirm,
      rf_help_rect: helpRect,
    },
    calls: [{ call: label, target: jumpTarget(at(label), label) }],
    patch(eboot) {
      eboot.writeUInt16LE(half(template + TEMPLATE_Y) - RAISE, offsetOf(template + TEMPLATE_Y));
      for (const { offset, height, rows } of BRANCHES) {
        // lui $v1, rows; ori $v1, $v1, height; sw $v1, height($v0): both halves.
        const words = [
          0x3c030000 | rows,
          0x34630000 | (rows === LIST_ROWS ? height : ROW_HEIGHT),
          0xac430000 | heightLow,
        ];
        words.forEach((w, k) => eboot.writeUInt32LE(w >>> 0, offsetOf(draw + offset + k * 4)));
      }
      for (const names of [rewardNames, comradeNames]) {
        eboot.writeUInt16LE(half(names + 4), offsetOf(names + 6)); // End's ID, again
      }
      eboot.writeUInt32LE(ROWS_BY_ARG, offsetOf(update + UPDATE.rows));
      eboot.writeUInt32LE(BACK_ROW_BY_ARG, offsetOf(update + UPDATE.backRow));
    },
  };
}

export const sendAllObjects = () => decodeObjects(SEND_ALL_OBJECTS);

export const sendAllReport = (): ShuffleReport => ({
  title: "Send All to Item Box",
  notes: [
    "The reward screen's menu has a Send All to Item Box row, which sends every reward the Item Box can take and ends the screen; what doesn't fit stays, with the menu.",
  ],
  lines: [],
  summary: "Send All to Item Box: in the reward screen's menu",
});
