/**
 * Harvest all (`farm.harvestAll`): standing at the farm's Item Box, its
 * prompt ("□ :Open Item Box") gets a second line, "△ :Harvest All to Item
 * Box", while the farm holds anything; △ sends everything every spot holds
 * to the Item Box. The blob code is `blob/harvest.c`, on one call of hook 8;
 * this finds it and the game's addresses per disc.
 *
 * What the game does (EU, the JP disc's the same code elsewhere):
 *
 * - The farm is in the save at `+0x6A238` (`lui 6; ori 0xa238`): level bytes,
 *   then each spot's stock, which the farm restock (EBOOT, after a quest)
 *   rolls for every table, owned or not:
 *   - `+0` the field's plots, `+2` the Mining Points, `+3` the Insect
 *     Thickets: the highest one there, from 0 (plot or point k is there
 *     when k <= the byte);
 *   - `+4` the Mushroom Tree and `+5` the Bee Hive: 0 none, else 1-3;
 *   - `+0x08` 5 Mining Points and `+0x30` 5 Insect Thickets of 4 u16 items;
 *     `+0x58` 3 Mushroom Trees of 8 and `+0x88` 3 Bee Hives of 6, one per
 *     level; `+0xB0` 3 field plots of 40 bytes: the seed, then 12 u16 items
 *     at `+4` and their u8 amounts at `+0x1C`. An empty slot is item 0.
 * - Gathering is one of the hunter's actions in `lobby_task`, one per kind
 *   of spot; the Mining Point's gives its item with the message log's
 *   "obtained" line and logs "nothing" when it's empty, which is where the
 *   log's calls are found.
 * - The hunter's interaction point is its `+0x554` (a record, `+2` its
 *   type): 6 the house's Item Box, 7 the farm's (which opens the box without
 *   Change Equipment). The village's interaction code (`lobby_task`) takes
 *   □ for every type, and a second button only for NPCs.
 * - The prompt (EBOOT, EU 0x08836124) switches on the type; the farm box's
 *   case prints "%s%s" (the message " :" after the button's sprite, then
 *   "Open Item Box") at (0x24, 0x12) and looks the text up again (EU
 *   0x08836BF8) for the banner's width, then the shared tail draws the
 *   banner and the □ sprite (53). An NPC's second choice is the same a line
 *   (16) lower with its own sprite.
 * - The buttons the Item Box's own menu reads, `buttons(save)` (EU
 *   0x0884FB6C, its update's first call), are this frame's presses, 0 while
 *   input is locked.
 *
 * Hook 8 takes the farm box case's last lookup: the blob makes it, then
 * draws its line under the game's (with △, sprite 52) and harvests on △.
 */
import { decodeObjects } from "../blob/link.js";
import { HARVEST_OBJECTS } from "../blob/harvest-object.js";
import type { LoadedOverlay } from "../game/load.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import type { HookCall } from "./game-hooks.js";
import { codeSegment, hiLo, jumpTarget, luiLwAddress, signed16 } from "./mips.js";
import { findBoxCalls } from "./send-all.js";

/** The farm's offset in the save, as `lui $at, 6; ori $at, $at, 0xa238`. */
const FARM_LUI = 0x3c010006;
const FARM_ORI = 0x3421a238;
const FARM = 0x6a238;
/** Each kind's stock, as the action reads it (`lhu $r, offset($r)`), in hook order. */
export const HARVEST_KINDS = [
  { name: "mining", stock: 0x08 },
  { name: "insects", stock: 0x30 },
  { name: "mushrooms", stock: 0x58 },
  { name: "honey", stock: 0x88 },
  { name: "field", stock: 0xb4 },
] as const;
/** The kinds that open a screen, unless the hunter's `+0x1D7` is set (`sb $r, 0x1d7($r)`). */
const SCREEN_FLAG = 0x1d7;
/** `move $a1, $zero`: frame()'s second argument, in its call's delay slot. */
const FRAME_SLOT = 0x00002821;
/** `addiu $a0, $r, 0x80`: its first, before the call. */
const isFrameArg = (w: number) =>
  w >>> 26 === 0x09 && ((w >>> 16) & 31) === 4 && (w & 0xffff) === 0x80;
/** How far after the farm's address an action's code goes. */
const ACTION_WORDS = 0x100;
const JR_RA = 0x03e00008;
/** `move $a1, $v0`: the log's text, from the message lookup, in its call's delay slot. */
const LOG_TEXT_SLOT = 0x00402821;
/** `li $t1, 1`: give()'s last argument, in its call's delay slot (the Mining Point's). */
const GIVE_SLOT = 0x24090001;
/** In give(): the log's "obtained" line `log(hud, 1, 0, item)`, `li $a1, 1; jal; move $a2, $zero`. */
const LOG_ITEM_WORDS = [0x24050001, null, 0x00003021] as const;
/** In give(): the item's sound `sound(object, item)`, `lw $a0; jal; move $a1, $s0`. */
const ITEM_SOUND_SLOT = 0x02002821;
const GIVE_WORDS = 0x80;

/** The box's cursor move, `addiu $a1, $s2, 0x36; jal; li $a3, 6`: six rows. */
const CURSOR_WORDS = [0x26450036, null, 0x24070006] as const;
/** The prompt's switch: `lw $s0, 0x554($s3); lhu $v1, 2($s0)`, the point and its type. */
const PROMPT_WORDS = [0x8e700554, 0x96030002] as const;
/** The farm's Item Box's type (the house's is 6). */
const FARM_BOX = 7;

export interface Harvest {
  externs: Record<string, number>;
  /** Its call of hook 8: the farm box prompt's text. */
  calls: HookCall[];
}

const op = (w: number) => w >>> 26;
const rt = (w: number) => (w >>> 16) & 31;
const rs = (w: number) => (w >>> 21) & 31;

/** The farm's actions in `lobby_task`, the game's addresses and the hook's calls; or why not. */
export function prepareHarvest(vanillaEboot: Buffer, lobbyTask: LoadedOverlay): Harvest | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const box = findBoxCalls(vanillaEboot, segment);
  if (typeof box === "string") return box;
  const ebootAt = (vaddr: number) =>
    vaddr >= segment.vaddr && vaddr + 4 <= segment.vaddr + segment.size
      ? vanillaEboot.readUInt32LE(segment.offset + (vaddr - segment.vaddr))
      : 0;

  const { reader, loadBase: base } = lobbyTask.ovl;
  const code = reader.buf;
  const words = code.length >>> 2;
  const at = (vaddr: number) =>
    vaddr >= base && vaddr + 4 <= base + code.length ? code.readUInt32LE(vaddr - base) : 0;

  // Each use of the farm's address, to the function's end: the actions are
  // those that ask frame() and then read one kind's stock.
  const found = new Map<number, { call: number; frame: number; start: number; end: number }[]>();
  for (let k = 1; k < words; k++) {
    if (code.readUInt32LE(k * 4) !== FARM_ORI) continue;
    const start = base + k * 4;
    if (![4, 8, 12, 16].some((back) => at(start - back) === FARM_LUI)) continue;
    let call = 0;
    for (let pc = start; pc < start + ACTION_WORDS * 4; pc += 4) {
      const w = at(pc);
      if (w === JR_RA) break;
      if (!call && op(w) === 3 && at(pc + 4) === FRAME_SLOT && isFrameArg(at(pc - 4))) {
        call = pc;
        continue;
      }
      if (call && op(w) === 0x25) {
        // The first read of a kind's stock (the anim's `+0xBC` comes first).
        const kind = HARVEST_KINDS.findIndex(({ stock }) => stock === (w & 0xffff));
        if (kind >= 0) {
          let end = pc;
          while (end < start + ACTION_WORDS * 8 && at(end) !== JR_RA) end += 4;
          const list = found.get(kind) ?? [];
          list.push({ call, frame: jumpTarget(at(call), call), start, end });
          found.set(kind, list);
          break;
        }
      }
    }
  }
  const actions = HARVEST_KINDS.map((_, kind) => found.get(kind));
  if (actions.some((list) => list?.length !== 1)) return "this game's farm gathering doesn't match";
  const [mining, ...rest] = actions.map((list) => list![0]!);
  const frame = mining!.frame;
  if (rest.some((a) => a.frame !== frame)) return "this game's farm gathering doesn't match";
  // The spots with a screen set the hunter's flag that keeps it shut.
  const setsFlag = ({ start, end }: { start: number; end: number }) => {
    for (let pc = start; pc < end; pc += 4) {
      const w = at(pc);
      if (op(w) === 0x28 && (w & 0xffff) === SCREEN_FLAG) return true;
    }
    return false;
  };
  if (!rest.slice(1).every(setsFlag)) return "this game's farm gathering doesn't match";

  // In the Mining Point's: give() and, on the empty path, the log's text.
  let give = 0;
  let logText = 0;
  let logObject = 0;
  for (let pc = mining!.call; pc < mining!.end; pc += 4) {
    const w = at(pc);
    if (op(w) !== 3) continue;
    if (!give && at(pc + 4) === GIVE_SLOT) give = jumpTarget(w, pc);
    if (
      !logText &&
      at(pc + 4) === LOG_TEXT_SLOT &&
      op(at(pc - 4)) === 0x23 &&
      op(at(pc - 8)) === 0x0f
    ) {
      logText = jumpTarget(w, pc);
      logObject = luiLwAddress(at(pc - 8), at(pc - 4));
    }
  }
  if (!give || !logText) return "this game's farm gathering doesn't match";
  let logItem = 0;
  let itemSound = 0;
  let soundObject = 0;
  for (let pc = give; pc < give + GIVE_WORDS * 4; pc += 4) {
    const w = ebootAt(pc);
    if (op(w) !== 3) continue;
    if (
      !logItem &&
      ebootAt(pc - 4) === LOG_ITEM_WORDS[0] &&
      ebootAt(pc + 4) === LOG_ITEM_WORDS[2]
    ) {
      logItem = jumpTarget(w, pc);
    }
    if (
      !itemSound &&
      ebootAt(pc + 4) === ITEM_SOUND_SLOT &&
      op(ebootAt(pc - 4)) === 0x23 &&
      op(ebootAt(pc - 8)) === 0x0f
    ) {
      itemSound = jumpTarget(w, pc);
      soundObject = luiLwAddress(ebootAt(pc - 8), ebootAt(pc - 4));
    }
  }
  if (!logItem || !itemSound) return "this game's item messages don't match";

  // The box: its update's buttons, then the farm's list of row names.
  let cursor = 0;
  for (let k = 0; k + 2 < words && !cursor; k++) {
    const pc = base + k * 4;
    if (at(pc) === CURSOR_WORDS[0] && op(at(pc + 4)) === 3 && at(pc + 8) === CURSOR_WORDS[2]) {
      cursor = pc;
    }
  }
  if (!cursor) return "this game's Item Box menu doesn't match";
  let update = cursor;
  while (update > cursor - 0x400 && (at(update) >>> 16 !== 0x27bd || !(at(update) & 0x8000))) {
    update -= 4;
  }
  let buttons = 0;
  for (let pc = update; pc < cursor; pc += 4) {
    const slot = at(pc + 4);
    if (op(at(pc)) === 3 && op(slot) === 0x23 && rt(slot) === 4) {
      buttons = pc;
      break;
    }
  }
  if (!buttons) return "this game's Item Box menu doesn't match";

  // The prompt: its switch on the point's type, the farm box's case and the banner after it.
  let prompt = 0;
  for (let pc = segment.vaddr; pc + 8 < segment.vaddr + segment.size && !prompt; pc += 4) {
    if (ebootAt(pc) === PROMPT_WORDS[0] && ebootAt(pc + 4) === PROMPT_WORDS[1]) prompt = pc;
  }
  if (!prompt) return "this game's interaction prompt doesn't match";
  let farmCase = 0;
  for (let pc = prompt + 8; pc < prompt + 0x20 && !farmCase; pc += 4) {
    const hi = ebootAt(pc);
    const lo = ebootAt(pc + 8);
    if (op(hi) === 0x0f && op(lo) === 0x09 && rs(lo) === rt(hi)) {
      farmCase = ebootAt(hiLo(hi, lo) + FARM_BOX * 4);
    }
  }
  // getter(prefix), getter(text), print(printer, x, y, format, prefix, text), getter(text), then b tail.
  const jals: number[] = [];
  let tail = 0;
  for (let pc = farmCase; pc < farmCase + 0x80 && !tail; pc += 4) {
    const w = ebootAt(pc);
    if (op(w) === 3) jals.push(pc);
    if (w >>> 16 === 0x1000) tail = pc + 4 + signed16(w & 0xffff) * 4;
  }
  if (jals.length !== 4 || !tail) return "this game's interaction prompt doesn't match";
  const [prefixCall, textCall, printCall, labelCall] = jals as [number, number, number, number];
  const getter = jumpTarget(ebootAt(prefixCall), prefixCall);
  if (
    [textCall, labelCall].some((c) => jumpTarget(ebootAt(c), c) !== getter) ||
    op(ebootAt(prefixCall - 4)) !== 0x0f ||
    op(ebootAt(prefixCall + 4)) !== 0x25
  ) {
    return "this game's interaction prompt doesn't match";
  }
  const prefixId = hiLo(ebootAt(prefixCall - 4), ebootAt(prefixCall + 4));
  // The format: `lui $a3, hi`, then `addiu $a3, $a3, low` (the print's delay slot, on EU).
  let format = 0;
  for (let pc = printCall + 4; pc > printCall - 0x20 && !format; pc -= 4) {
    const lo = ebootAt(pc);
    if (op(lo) !== 0x09 || rt(lo) !== 7 || rs(lo) !== 7) continue;
    for (let k = pc - 4; k > pc - 0x20; k -= 4) {
      const hi = ebootAt(k);
      if (op(hi) === 0x0f && rt(hi) === 7) {
        format = hiLo(hi, lo);
        break;
      }
    }
  }
  // The tail: width(printer, text), banner(hud, 0, y, w, h, colour, 0), icon(hud, x, y, sprite, blink, 0x14).
  const tailJals: number[] = [];
  for (let pc = tail; pc < tail + 0x80 && tailJals.length < 3; pc += 4) {
    if (op(ebootAt(pc)) === 3) tailJals.push(jumpTarget(ebootAt(pc), pc));
  }
  if (!format || tailJals.length !== 3) return "this game's interaction prompt doesn't match";
  const [width, banner, icon] = tailJals as [number, number, number];

  return {
    externs: {
      ...box,
      rf_farm: FARM,
      rf_buttons: jumpTarget(at(buttons), buttons),
      rf_prompt_prefix: prefixId,
      rf_prompt_print: jumpTarget(ebootAt(printCall), printCall),
      rf_prompt_format: format,
      rf_prompt_width: width,
      rf_prompt_banner: banner,
      rf_prompt_icon: icon,
      rf_log_item: logItem,
      rf_log_text: logText,
      rf_log_object: logObject,
      rf_item_sound: itemSound,
      rf_item_sound_object: soundObject,
    },
    calls: [{ call: labelCall, target: getter }],
  };
}

export const harvestObjects = () => decodeObjects(HARVEST_OBJECTS);

export const harvestReport = (): ShuffleReport => ({
  title: "Harvest all",
  notes: [
    "At the farm's Item Box, its prompt has a second line, \"△ :Harvest All to Item Box\": △ sends everything the farm holds (the field, Mining Points, Insect Thickets, Mushroom Tree and Bee Hive) to the Item Box; what doesn't fit stays on the farm.",
  ],
  lines: [],
  summary: "Harvest all: △ at the farm's Item Box",
});
