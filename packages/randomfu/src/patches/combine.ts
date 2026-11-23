/**
 * Bulk combine (`pouch.bulkCombine`): in the item pouch's Combine (the START
 * menus' second entry), "Combine?" gets a count, which left and right pick,
 * up to what the ingredients and the pouch allow; × with Yes combines that
 * many at once. The blob code is `blob/combine.c`, on the menu hook's run
 * and draw calls and one call of hook 8 in the EBOOT; this finds them and
 * the game's addresses per disc.
 *
 * What the game does (EU, the JP disc's the same code elsewhere):
 *
 * - Both menus' run (`run(hud, cursor, buttons)`, a jump table on the
 *   cursor) run entry 1 with `combine_run(hud, buttons)` (EU 0x0881DB5C), a
 *   state machine at the HUD's `+0x5B8`: 0 and 1 pick the two ingredients
 *   (their pouch slots at `+0x5B0`/`+0x5B1`, items at `+0x5AC`/`+0x5AE`, the
 *   recipe at `+0x5A8`), 2 asks "Combine?" (Yes/No at `+0x5B9`, up and down;
 *   left and right move the pouch's cursor; what's wrong in `+0x5BA`: the
 *   pouch full, an ingredient gone), 3 and 4 show and give the result.
 * - × on Yes calls `combine(object, &amount, hunter, item1, item2, 0)` (EU
 *   0x0885B82C): the recipe's chance, then the result and how many (up to
 *   the recipe's quantity class's most, `+5` into a table), or -1 for a
 *   failure; it takes one of each ingredient either way. State 3 turns a
 *   failure into one Garbage and state 4 gives `amount` of the result.
 *
 * The blob picks the count in state 2 (taking left and right from the
 * buttons) and draws it beside Yes/No; the combine call makes the game's
 * call that many times and answers with the sum, so the game's own result
 * message shows the lot. Failures past the first give their Garbage too,
 * and the message log says how many failed.
 */
import { decodeObjects } from "../blob/link.js";
import { COMBINE_OBJECTS } from "../blob/combine-object.js";
import type { LoadedOverlay } from "../game/load.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import type { HookCall, MenuSites } from "./game-hooks.js";
import { prepareHarvest } from "./harvest.js";
import { codeSegment, hiLo, jumpTarget, luiLwAddress } from "./mips.js";

/** The pouch's Combine, in both menus' run jump tables. */
const COMBINE_ENTRY = 1;
/** `move $a1, $zero`: the pouch's first slot, `slot(save, 0)`. */
const SLOT_ZERO = 0x00002821;
/** `move $t1, $zero`: combine()'s last argument (0, the pouch's), in its call's delay slot. */
const COMBINE_SLOT = 0x00004821;
/** `lhu $a1, 0x5b4($r)`: the result, for `room(save, item)`. */
const isRoomArg = (w: number) =>
  w >>> 26 === 0x25 && ((w >>> 16) & 31) === 5 && (w & 0xffff) === 0x5b4;
/** `lh $t0, 0($r)`: the second ingredient, before the call. */
const isItem2 = (w: number) => w >>> 26 === 0x21 && ((w >>> 16) & 31) === 8 && (w & 0xffff) === 0;
/** In combine(): `add_pouch(hunter, item, -1, 0)`, `li $a2, -1; jal; move $a3, $zero`. */
const TAKE_WORDS = [0x2406ffff, 0x00003821] as const;
const RUN_WORDS = 0x400;
const COMBINE_WORDS = 0x80;

const op = (w: number) => w >>> 26;
const rt = (w: number) => (w >>> 16) & 31;
const rs = (w: number) => (w >>> 21) & 31;

export interface Combine {
  externs: Record<string, number>;
  /** Its call of hook 8: the combine in `combine_run`. */
  calls: HookCall[];
}

/** The pouch's combine and the game's addresses, or why not. */
export function prepareCombine(
  vanillaEboot: Buffer,
  menus: MenuSites[],
  lobbyTask: LoadedOverlay,
): Combine | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const at = (vaddr: number) =>
    vaddr >= segment.vaddr && vaddr + 4 <= segment.vaddr + segment.size
      ? vanillaEboot.readUInt32LE(segment.offset + (vaddr - segment.vaddr))
      : 0;
  const mismatch = "this game's pouch combine doesn't match";

  // Each menu's run: its jump table's entry 1, and that case's call.
  const runs = menus.map(({ run }) => {
    const fn = run.target;
    for (let pc = fn; pc < fn + 0x40; pc += 4) {
      const w = at(pc);
      if (op(w) !== 0x0f) continue;
      // `lui $t, hi`, then (a word or two on) `addiu $t, $t, low`: the table.
      const low = [4, 8, 12].map((k) => at(pc + k)).find((l) => op(l) === 0x09 && rs(l) === rt(w));
      if (low == null || rt(low) !== rt(w)) continue;
      const entry = at(hiLo(w, low) + COMBINE_ENTRY * 4);
      for (let c = entry; c < entry + 0x10; c += 4) {
        if (op(at(c)) === 3) return jumpTarget(at(c), c);
      }
    }
    return 0;
  });
  const run = runs[0];
  if (!run || runs.some((r) => r !== run)) return mismatch;

  let slot = 0;
  let save = 0;
  let room = 0;
  let call = 0;
  for (let pc = run; pc < run + RUN_WORDS * 4; pc += 4) {
    const w = at(pc);
    if (op(w) !== 3) continue;
    const slotWord = at(pc + 4);
    if (!slot && slotWord === SLOT_ZERO && op(at(pc - 4)) === 0x23 && op(at(pc - 8)) === 0x0f) {
      slot = jumpTarget(w, pc);
      save = luiLwAddress(at(pc - 8), at(pc - 4));
    }
    if (!room && isRoomArg(slotWord)) room = jumpTarget(w, pc);
    if (!call && slotWord === COMBINE_SLOT && isItem2(at(pc - 4))) call = pc;
  }
  if (!slot || !room || !call) return mismatch;
  const combine = jumpTarget(at(call), call);

  let take = 0;
  let amounts = 0;
  for (let pc = combine; pc < combine + COMBINE_WORDS * 4; pc += 4) {
    const w = at(pc);
    if (!take && op(w) === 3 && at(pc - 4) === TAKE_WORDS[0] && at(pc + 4) === TAKE_WORDS[1]) {
      take = jumpTarget(w, pc);
    }
    // `lbu $r, 5(recipe)`, then the class table: `lui $t; addiu $t, $t, low`.
    if (!amounts && op(w) === 0x24 && (w & 0xffff) === 5) {
      for (let k = 4; k <= 12 && !amounts; k += 4) {
        const hi = at(pc + k);
        if (op(hi) !== 0x0f) continue;
        const low = [4, 8]
          .map((j) => at(pc + k + j))
          .find((l) => op(l) === 0x09 && rs(l) === rt(hi));
        if (low != null) amounts = hiLo(hi, low);
      }
    }
  }
  if (!take || !amounts) return mismatch;

  // The message log's text line, as the farm's gathering has it.
  const harvest = prepareHarvest(vanillaEboot, lobbyTask);
  if (typeof harvest === "string") return harvest;
  const { rf_log_text, rf_log_object } = harvest.externs;

  return {
    externs: {
      rf_combine: combine,
      rf_combine_amounts: amounts,
      rf_pouch_slot: slot,
      rf_pouch_room: room,
      rf_pouch_add: take,
      rf_save_object: save,
      rf_log_text: rf_log_text!,
      rf_log_object: rf_log_object!,
    },
    calls: [{ call, target: combine }],
  };
}

export const combineObjects = () => decodeObjects(COMBINE_OBJECTS);

export const combineReport = (): ShuffleReport => ({
  title: "Bulk combine",
  notes: [
    'In the item pouch\'s Combine, left and right pick how many to make at "Combine?", up to what the ingredients and the pouch allow; × on Yes combines them all at once.',
  ],
  lines: [],
  summary: "Bulk combine: pick how many to combine at once",
});
