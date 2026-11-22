/**
 * Photo mode (`camera.photoMode`), and its setting in randomfu's START menu
 * entry: blob code (`blob/photo.c`) on the pad and quest frame hooks, and
 * one EBOOT patch. This finds what the blob calls, per disc, and patches the
 * pause's dimming.
 *
 * What the game does (EU addresses; found statically, from savestates):
 *
 * - The save's byte `+0x6AF1A` is the pause: `isPaused(save)` (EU
 *   0x088567B4) is it not being 0. `pause(save)` (EU 0x088567C8), which the
 *   HUD's update calls for SELECT, sets it to 1 and stops the sound, unless
 *   the game is online; `unpause(save)` (EU 0x0885683C) sets it to 4 and
 *   starts the sound, and game_task clears the 4 after a frame.
 *   `noPause(save, 0)` (EU 0x0884FA5C) is the HUD's other check before it
 *   pauses (the game mode, save `+0x2E`).
 * - game_task's frame (EU 0x09A62640) runs the play update (the hunters,
 *   monsters, the camera's update EU 0x08812BD0) only when not paused;
 *   paused, it runs the HUD's update and the dimming (EU 0x0885658C: the
 *   screen in black at alpha 0xA0), and the quest's frame (its clock) is
 *   skipped. The HUD's update draws its layer 9 (the gauges, and hook 1)
 *   and layer 11 (the map, the item bar) only when not paused.
 * - The camera's update copies its eye and target to the renderer's `+0x20`
 *   and `+0x30` and to `+0xB40` and `+0xB50`, then `look(renderer)` (EU
 *   0x08815384) rebuilds the projection if the field of view (`+0xC`)
 *   changed and the view (`+0xB80`) from the second pair.
 *
 * - The stage's ambient effects (rain) have a manager (EU `*0x09A4F060`)
 *   whose update (EU 0x088C33E8), in the play update, places them round the
 *   camera: paused, the rain stays where the camera was. Photo mode runs it.
 *
 * The patch: the dimming's first eight words test the byte for 1 instead of
 * calling `isPaused`, returning through the `jr $ra` just before it, so
 * photo mode's 2 pauses the game without it. The words are rearranged to
 * fit: the test comes before the frame is made, and `$ra` is stored in the
 * branch's delay slot where the frame will put it.
 */
import { decodeObjects } from "../blob/link.js";
import { PHOTO_OBJECTS } from "../blob/photo-object.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import type { HookSites } from "./game-hooks.js";
import { findRendererGlobal } from "./hitboxes.js";
import { codeSegment, findUnique, hiLo, jumpTarget, maskWord } from "./mips.js";

/** `isPaused`, `pause` and `unpause`, one after another (EU 0x088567B4), masked. */
export const PAUSE_SIGNATURE = [
  0x3c020000, 0x00821021, 0x9042af1a, 0x03e00008, 0x0002102b, 0x27bdfff0, 0xafbf0000, 0x3c030000,
  0x8c660000, 0x24050000, 0x3c030000, 0x00c31821, 0x8c630000, 0x30630001, 0x0003182b, 0x54650005,
  0x3c020000, 0x3c030000, 0x00831821, 0x1000000b, 0xa060af1a, 0x00821021, 0xa045af1a, 0x3c020000,
  0x0c000000, 0x8c440000, 0x3c020000, 0x8c440000, 0x24050000, 0x0c000000, 0x00003021, 0x8fbf0000,
  0x03e00008, 0x27bd0010, 0x27bdfff0, 0x3c020000, 0xafbf0000, 0x24030000, 0x00821021, 0xa043af1a,
  0x3c020000, 0x8c440000, 0x0c000000, 0x00002821, 0x3c020000, 0x8c440000, 0x24050000, 0x0c000000,
  0x00003021, 0x8fbf0000, 0x03e00008, 0x27bd0010,
];
/** Where `pause` and `unpause` start in it. */
export const PAUSE_AT = 5 * 4;
export const UNPAUSE_AT = 34 * 4;
/**
 * The dimming (EU 0x0885658C), from the `jr $ra; nop` that ends the function
 * before it: its frame, `jal isPaused`, and `bnel` out when it isn't 1.
 */
export const DIM_SIGNATURE = [
  0x03e00008, 0x00000000, 0x27bdffb0, 0xafbf0000, 0x0c000000, 0xafb00000, 0x304400ff, 0x24030000,
  0x54830080, 0x8fbf0000,
];
/** The dimming's distance before `isPaused` (the code between is the same on EU and JP). */
const DIM_BEFORE_PAUSED = 0x228;
/** `noPause(save, mode)` (EU 0x0884FA5C): the save's game mode, `+0x2E`, through a table. */
export const NO_PAUSE_SIGNATURE = [0x9082002e, 0x2442fffd, 0x2c410006, 0x50200014, 0x00001021];
/** `look(renderer)` (EU 0x08815384): the projection if the field of view changed, then the view. */
export const LOOK_SIGNATURE = [
  0x27bdffb0, 0xafbf0000, 0xafb00000, 0xc4810010, 0xc480000c, 0x46000832, 0x00000000, 0x45010003,
  0x00808021, 0x0c000000, 0x00000000, 0xc60c0b34, 0x26040b60, 0x26050020, 0x0c000000, 0x26060030,
];
/**
 * The stage's ambient effects (rain): their manager's update (EU 0x088C33E8),
 * each effect's update through its vtable (+0x1C) and the finished ones freed.
 */
export const AMBIENT_UPDATE_SIGNATURE = [
  0x27bdfff0, 0xafbf0000, 0xafb20000, 0xafb10000, 0x3c030000, 0xafb00000, 0x00831821, 0x8c720000,
  0x1240000f, 0x00808021, 0x8e590000, 0x8f390000, 0x0320f809, 0x02402021, 0x8e430000, 0x30630001,
  0x0003182b, 0x14600004, 0x8e510000, 0x02402821, 0x0c000000, 0x02002021, 0x1620fff3, 0x02209021,
];
/**
 * The manager's set-up (EU 0x088C3138), which stores it in its global first
 * (`lui v0, hi; sw a0, lo(v0)`).
 */
export const AMBIENT_SET_SIGNATURE = [
  0x3c020000, 0xac440000, 0x3c020000, 0x00821021, 0xac400000, 0x3c020000, 0x00821021, 0xac400000,
  0x3c020000, 0x00821021, 0xac400000, 0x3c020000, 0x00821021, 0xac400000, 0x34020000, 0xa482028a,
  0x03e00008, 0x00801021,
];

/**
 * The dimming's new first eight words, at `at` (the `jr $ra` is at `at - 8`):
 * return unless the pause byte (save in `$a0`) is 1, then the frame.
 */
export function dimWords(at: number): number[] {
  const back = (at - 8 - (at + 4 * 4 + 4)) / 4;
  return [
    0x3c020007, // lui v0, 7
    0x00821021, // addu v0, a0, v0
    0x9042af1a, // lbu v0, -0x50E6(v0): save + 0x6AF1A, the pause byte
    0x24030001, // li v1, 1
    (0x14430000 | (back & 0xffff)) >>> 0, // bne v0, v1, back to the jr $ra
    0xafbfffbc, // sw ra, -0x44(sp): 0xC of the frame to come (harmless if it returns)
    0x27bdffb0, // addiu sp, sp, -0x50
    0xafb00008, // sw s0, 8(sp)
  ];
}

export interface PhotoSites {
  /** `isPaused` (vaddr). */
  paused: number;
  /** The dimming's first word (vaddr). */
  dim: number;
  noPause: number;
  look: number;
  /** The global holding the ambient effects' manager, and their update. */
  ambient: number;
  ambientUpdate: number;
}

const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);

/** The game's pause and camera code in a vanilla EBOOT, or why not. */
export function findPhotoSites(vanillaEboot: Buffer): PhotoSites | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const [paused, noPause, look, ambientUpdate, ambientSet] = findUnique(vanillaEboot, segment, [
    PAUSE_SIGNATURE,
    NO_PAUSE_SIGNATURE,
    LOOK_SIGNATURE,
    AMBIENT_UPDATE_SIGNATURE,
    AMBIENT_SET_SIGNATURE,
  ]);
  if (paused == null) return "this EBOOT's pause code doesn't match";
  if (noPause == null) return "this EBOOT's pause check doesn't match";
  if (look == null) return "this EBOOT's camera code doesn't match";
  if (ambientUpdate == null || ambientSet == null) {
    return "this EBOOT's ambient effects (rain) code doesn't match";
  }
  const at = (vaddr: number) => word(vanillaEboot, segment.offset + (vaddr - segment.vaddr));
  const ambient = hiLo(at(ambientSet), at(ambientSet + 4));
  const dim = paused - DIM_BEFORE_PAUSED;
  const matches = DIM_SIGNATURE.every((w, k) => maskWord(at(dim - 8 + k * 4)) === w);
  if (!matches || jumpTarget(at(dim + 8), dim + 8) !== paused) {
    return "this EBOOT's pause dimming doesn't match";
  }
  return { paused, dim, noPause, look, ambient, ambientUpdate };
}

/** The blob's externs for photo mode, from the vanilla EBOOT, or why not. */
export function findPhotoExterns(
  vanillaEboot: Buffer,
  sites: HookSites,
  photo: PhotoSites,
  on: boolean,
): Record<string, number> | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const renderer = findRendererGlobal(vanillaEboot, segment);
  if (typeof renderer === "string") return renderer;
  const at = (vaddr: number) => word(vanillaEboot, segment.offset + (vaddr - segment.vaddr));
  return {
    rf_camera: renderer,
    // `lui v0, hi; jal padRead; lw a0, lo(pad)(v0)`: the pad object's global.
    rf_pad: hiLo(at(sites.pad - 4), at(sites.pad + 4)),
    rf_pause: photo.paused + PAUSE_AT,
    rf_unpause: photo.paused + UNPAUSE_AT,
    rf_no_pause: photo.noPause,
    rf_look: photo.look,
    rf_ambient: photo.ambient,
    rf_ambient_update: photo.ambientUpdate,
    // Off or on, + 1: an extern's address is never 0 (`blob/photo.c`).
    rf_photo_mode: on ? 2 : 1,
  };
}

/** Patches the dimming in `eboot` (a copy to edit) to draw only for the game's own pause. */
export function patchDim(eboot: Buffer, photo: PhotoSites): void {
  const segment = codeSegment(eboot)!;
  const offset = segment.offset + (photo.dim - segment.vaddr);
  dimWords(photo.dim).forEach((w, k) => eboot.writeUInt32LE(w, offset + k * 4));
}

export const photoObjects = () => decodeObjects(PHOTO_OBJECTS);

/** What the disc says about photo mode; `linked` when its code is on the disc. */
export function photoReport(linked: boolean): ShuffleReport {
  const notes = linked
    ? [
        "In a quest, hold L and R and press START: the game stops, the HUD goes and the camera is yours. The stick turns it round what it looks at, the D-pad moves it, △ and × raise and lower it, □ and ○ bring it nearer and further, L and R zoom, SELECT puts it back where it started; START again ends it.",
        "It can be turned off and on in game, from the START menu's randomfu entry.",
      ]
    : ["Photo mode isn't in this image: it's blob code, and the code loader isn't on this disc."];
  return {
    title: "Photo mode",
    notes,
    lines: [],
    summary: `Photo mode: ${linked ? "L+R+START in a quest" : "not applied"}`,
  };
}
