/**
 * Improve pips (`smithy.improvePips`): in the box picker the smithy's Improve
 * shows, a small pip in the top left corner of each weapon the hunter can
 * improve right now, with the materials (pouch and box) and zenny for at
 * least one of the weapons it improves into. The blob code is
 * `blob/improve-pips.c`, on hook 8: the picker's call to the grid it draws
 * goes through the hook's stub (a call of `calls`, in `lobby_task`). This
 * finds the addresses per disc.
 *
 * What the game does (`lobby_task.ovl`, found on the FUC disc from RAM with
 * the picker open, JP addresses; the EU disc's code is the same but for
 * addresses):
 *
 * - The box picker (its object JP 0x09B0AC78, kind at `+0x23`) draws a page
 *   of the box with `grid(object, cursor, flags, layout)` (JP 0x09AE74D8),
 *   from eight places; the picker's is the one Improve runs (JP 0x09A7BA20),
 *   with `ori $a2, $s2, 0x10` (0x10 the equipment box) and the flags of the
 *   picker's kind in `$s2`: Improve's is 0x400, which dims all but weapons.
 *   The grid's layouts are rows of 24 bytes (JP 0x09B05F88): the first
 *   cell's x, y, width, height, then the steps to the next column and row.
 *   It draws with the HUD object of a global, and its cells' icons with
 *   `equipmentIcon` (`pact.ts`).
 * - Choosing a weapon builds the list of what it improves into (JP
 *   0x09A9EB98): its row of the EBOOT's `EquipmentUpgrade` table (the melee
 *   section, or the ranged one when `listed(_, type, id)` says the ranged
 *   weapon has one), the five weapons at `+16`; for each, the four materials
 *   of its own row, each checked with `has(_, item, amount)` (the pouch and
 *   box together), and `afford(_, cost(_, type, id))`, half its price. A
 *   target either fails is greyed out.
 *
 * Every function is found by its code with the immediates masked
 * (`maskImmediates`), and the addresses from the words that load them.
 */
import { decodeObjects } from "../blob/link.js";
import { IMPROVE_PIPS_OBJECTS } from "../blob/improve-pips-object.js";
import type { LoadedOverlay } from "../game/load.js";
import type { Report } from "../report.js";
import type { HookCall } from "./game-hooks.js";
import {
  codeSegment,
  findUnique,
  hiLo,
  jumpTarget,
  luiLwAddress,
  maskImmediates,
  maskWord,
} from "./mips.js";
import { FILL_SIGNATURE } from "./hud-text.js";

/** The grid's first 40 words (JP 0x09AE74D8), masked. */
export const GRID_SIGNATURE = [
  0x27bd0000, 0xafbf0000, 0xafbe0000, 0xafb70000, 0xafb60000, 0xafb50000, 0xafb40000, 0xafb30000,
  0xafb20000, 0xafb10000, 0xafb00000, 0x3c020000, 0x8c430000, 0xa7a50000, 0xafa40000, 0x3c020000,
  0x8c440000, 0x90650000, 0xafa60000, 0x0c000000, 0xafa70000, 0x3c020000, 0x8c440000, 0x8fa20000,
  0x30420000, 0x0002182b, 0x24820000, 0xafa20000, 0x8fa20000, 0x30420000, 0x14400000, 0xafa20000,
  0x10000000, 0x24020000, 0x24020000, 0x30550000, 0x8fa20000, 0x30420000, 0x14400000, 0xafa20000,
];
/** Words of the grid that load what the pips need, from its start. */
const GRID = {
  layoutsLui: 0x1d4, // lui $v1, hi(layouts)
  layoutsAddiu: 0x1dc, // addiu $v1, $v1, lo(layouts)
  hudLui: 0x128, // lui $v0, hi(hud)
  hudLw: 0x12c, // lw $a0, lo(hud)($v0)
} as const;
const GRID_WORDS: readonly [number, number][] = [
  [GRID.layoutsLui, 0x3c030000],
  [GRID.layoutsAddiu, 0x24630000],
  [GRID.hudLui, 0x3c020000],
  [GRID.hudLw, 0x8c440000],
];

/**
 * The picker's call (JP 0x09A7BA0C), masked: `lw $v0, lo(object)($v0); lh
 * $a1, 0x40($s3); ori $a2, $s2, 0x10; addiu $a0, $v0, 0x2890; move $a3, $s1;
 * jal grid; addiu $a0, $a0, 0x7ff8`.
 */
export const PICKER_CALL_SIGNATURE = [
  0x8c420000, 0x86650000, 0x36460000, 0x24440000, 0x02203821, 0x0c000000, 0x24840000,
];
const PICKER_CALL = 5 * 4;
/** `ori $a2, $s2, 0x10`: the equipment box, with the picker's flags. */
const PICKER_FLAGS_WORD = 0x36460010;

/** The upgrade list's build (JP 0x09A9EB98), its first 120 words, masked. */
export const UPGRADE_LIST_SIGNATURE = [
  0x27bd0000, 0xafbf0000, 0xafbe0000, 0xafb70000, 0xafb60000, 0xafb50000, 0xafb40000, 0xafb30000,
  0xafb20000, 0xafb10000, 0xafb00000, 0x8c960000, 0x0080a821, 0x26b40000, 0x00002821, 0x24060000,
  0x0c000000, 0x02802021, 0x02801821, 0xaea30000, 0x00161840, 0x00761821, 0x00038880, 0x3c030000,
  0x8c640000, 0x02242021, 0x90930000, 0x24030000, 0x16630000, 0x94920000, 0x32440000, 0x000418c0,
  0x00641823, 0x00032080, 0x3c030000, 0x24630000, 0x00648821, 0x0000b821, 0x0000b021, 0x327e0000,
  0xa6800000, 0x96260000, 0x50c00000, 0x26d60000, 0x3c020000, 0x8c440000, 0x0c000000, 0x02602821,
  0xae820000, 0x96260000, 0x02a02021, 0x0c000000, 0x02602821, 0xae820000, 0xa69e0000, 0x96230000,
  0x3c020000, 0x24420000, 0xa6830000, 0x96230000, 0x00009021, 0xa6830000, 0x96240000, 0x000418c0,
  0x00641823, 0x00031880, 0x00438021, 0x96050000, 0x50a00000, 0x26520000, 0x86060000, 0x0c000000,
  0x02a02021, 0x30420000, 0x14400000, 0x00000000, 0x86820000, 0x14400000, 0x00000000, 0x24020000,
  0xa6820000, 0x26520000, 0x2a420000, 0x14400000, 0x26100000, 0x8e850000, 0x0c000000, 0x02a02021,
  0x30430000, 0x54600000, 0x26940000, 0x24030000, 0xa6830000, 0x26940000, 0x26f70000, 0x26d60000,
  0x2ac30000, 0x14600000, 0x26310000, 0xaeb70000, 0x24030000, 0xa6a30000, 0x10000000, 0xa6a00000,
  0x02a02021, 0x02602821, 0x0c000000, 0x02403021, 0x30440000, 0x24030000, 0x54830000, 0x3c020000,
];
/** Words of the build, from its start: the tables it reads and the checks it calls. */
const LIST = {
  meleeLui: 0x88,
  meleeAddiu: 0x8c,
  cost: 0xcc, // jal cost
  has: 0x11c, // jal has
  afford: 0x158, // jal afford
  listed: 0x1a8, // jal listed
  rangedLui: 0x1d0,
  rangedAddiu: 0x1d4,
} as const;
const LIST_WORDS: readonly [number, number][] = [
  [LIST.rangedLui, 0x3c030000],
  [LIST.rangedAddiu, 0x24630000],
];
/** The melee row's first material is `lhu $a1, 0($s0)`, so a row is its materials. */
const UPGRADE_ROW_BYTES = 28;

export interface ImprovePips {
  externs: Record<string, number>;
  /** The call it adds to hook 8, in `lobby_task`. */
  calls: HookCall[];
}

/** The pips' externs and call, from the vanilla EBOOT and `lobby_task`, or why not. */
export function prepareImprovePips(
  vanillaEboot: Buffer,
  lobbyTask: LoadedOverlay,
): ImprovePips | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const [fill] = findUnique(vanillaEboot, segment, [FILL_SIGNATURE.map(maskWord)]);
  if (fill == null) return "this EBOOT's HUD fill code doesn't match";

  const { reader, loadBase: base } = lobbyTask.ovl;
  const code = reader.buf;
  const lobby = { offset: 0, vaddr: base, size: code.length };
  const [grid, call, list] = findUnique(
    code,
    lobby,
    [GRID_SIGNATURE, PICKER_CALL_SIGNATURE, UPGRADE_LIST_SIGNATURE],
    maskImmediates,
  );
  if (grid == null || call == null) return "this game's box picker doesn't match";
  if (list == null) return "this game's smithy upgrade list doesn't match";
  const at = (vaddr: number) => code.readUInt32LE(vaddr - base);
  const matches = (start: number, words: readonly [number, number][]) =>
    words.every(([offset, w]) => maskImmediates(at(start + offset)) === w);
  const jal = call + PICKER_CALL;
  if (
    !matches(grid, GRID_WORDS) ||
    jumpTarget(at(jal), jal) !== grid ||
    at(call + 8) !== PICKER_FLAGS_WORD
  ) {
    return "this game's box picker doesn't match";
  }
  if (!matches(list, LIST_WORDS)) return "this game's smithy upgrade list doesn't match";
  const target = (offset: number) => jumpTarget(at(list + offset), list + offset);
  const melee = hiLo(at(list + LIST.meleeLui), at(list + LIST.meleeAddiu));
  const ranged = hiLo(at(list + LIST.rangedLui), at(list + LIST.rangedAddiu));
  // Both sections sit in the EBOOT's data, ranged after melee, whole rows apart.
  const inEboot = (vaddr: number) => vaddr >= segment.vaddr && vaddr < segment.vaddr + 0x400000;
  if (!inEboot(melee) || ranged <= melee || (ranged - melee) % UPGRADE_ROW_BYTES) {
    return "this game's smithy upgrade list doesn't match";
  }
  return {
    externs: {
      rf_pip_grid: grid,
      rf_pip_layouts: hiLo(at(grid + GRID.layoutsLui), at(grid + GRID.layoutsAddiu)),
      rf_pip_hud: luiLwAddress(at(grid + GRID.hudLui), at(grid + GRID.hudLw)),
      rf_pip_melee: melee,
      rf_pip_ranged: ranged,
      rf_pip_has: target(LIST.has),
      rf_pip_cost: target(LIST.cost),
      rf_pip_afford: target(LIST.afford),
      rf_pip_listed: target(LIST.listed),
      rf_fill: fill,
    },
    calls: [{ call: jal, target: grid, overlay: lobbyTask }],
  };
}

export const improvePipsObjects = () => decodeObjects(IMPROVE_PIPS_OBJECTS);

export const improvePipsReport = (): Report => ({
  title: "Improve pips",
  notes: [
    "The smithy's Improve marks each weapon in the box you can improve right now (the materials and zenny for at least one of the weapons it improves into) with a small orange pip in its top left corner.",
  ],
  lines: [],
  summary: "Improve pips: on the smithy's Improve",
});
