/**
 * The camera's field of view (`camera.fov`), distance (`camera.distance`)
 * and tilt (`camera.tilt`), and their settings in Whetstone's START menu entry:
 * an EBOOT patch and blob code (`blob/camera.c`). This patches the EBOOT and
 * finds the addresses the blob uses, per disc.
 *
 * What the game does (EU addresses; the US and JP code is the same):
 *
 * - The renderer behind an EBOOT global (EU 0x089CBBE4) keeps the near and
 *   far planes (+0, +4), the aspect (+8) and the vertical field of view in
 *   radians (+0xC, 50°: 79° across), which the camera eases towards a
 *   target. The projection update (EU 0x08815348, JP 0x08816108) builds
 *   the projection (+0xC00) and its inverse (+0xD00, which the frustum is
 *   worked out from) only when +0xC differs from +0x10, the angle it was
 *   last built with.
 * - The camera follows the hunter with presets from a block at the
 *   renderer's +0x1BC: a stage's own (pac entry 4 of `stage/*.pac`, at
 *   +0x50) or the EBOOT's (EU 0x08933AE0). A block is the field of view,
 *   seven zeros, then five presets of `{?, eye height, distance, 0, look
 *   height, 0, ?, 0}`: the usual quest camera is eye 270, distance 490,
 *   looking at 170. The block's field of view is read once, when a camera
 *   is set up; the presets as it follows, so writing them moves the camera
 *   at once.
 * - The presets are the steps D-pad up and down tilt the camera through.
 *   The renderer keeps the step at +0x14 as a level, 0 (the highest:
 *   preset 4) to 4 (the lowest: preset 3), the levels being presets 4, 0,
 *   1, 2, 3; a level written there sticks.
 *
 * How Whetstone changes them:
 *
 * - The projection update's first nine words record the angle in +0x10 as
 *   the game has it (so it still rebuilds only on a change), multiply it by
 *   a float kept in the function's last word, and tail-call the
 *   perspective builder. That float is the disc's field of view, so it
 *   works with no blob, from the title screen; the blob changes it to the
 *   save's choice and zeroes +0x10 to have the projection rebuilt.
 * - The blob scales the presets of whatever block the camera uses, once a
 *   frame on the pad hook (`blob/camera.c`), and for smooth tilt writes
 *   them all as one camera at the save's pitch, which a held step moves.
 */
import { decodeObjects } from "../blob/link.js";
import { CAMERA_OBJECTS } from "../blob/camera-object.js";
import type { WhetstoneSettings } from "../settings.js";
import type { Report } from "../report.js";
import { findImports } from "./code-loader.js";
import type { HookSites } from "./game-hooks.js";
import { findRendererGlobal } from "./hitboxes.js";
import { codeSegment, findUnique, hi16, hiLo, maskWord } from "./mips.js";
import { SYSTEM_TIME_LOW_NID } from "./code-loader.js";

/** The scales of each choice, as `blob/camera.c` has them. */
export const FOV_SCALES = { normal: 1, wide: 1.15, wider: 1.25, widest: 1.4 } as const;
export const DISTANCE_SCALES = { normal: 1, far: 1.15, farther: 1.3, farthest: 1.5 } as const;
/** Smooth tilt's speed, degrees a second; 0 for the game's steps. */
export const TILT_RATES = { steps: 0, slow: 30, smooth: 50, fast: 80 } as const;
const FOV_CHOICES = Object.keys(FOV_SCALES);
const DISTANCE_CHOICES = Object.keys(DISTANCE_SCALES);
const TILT_CHOICES = Object.keys(TILT_RATES);
/**
 * Where the renderer keeps the tilt level: seen in EU's RAM, and the code
 * that steps it and picks the preset from it (the EBOOT's and game_task's)
 * is the same on the US and JP discs, offsets and all.
 */
const LEVEL_OFFSET = 0x14;

/** Whether any camera option is off the game's own. */
export const cameraOn = (settings: WhetstoneSettings) =>
  settings["camera.fov"] !== "normal" ||
  settings["camera.distance"] !== "normal" ||
  settings["camera.tilt"] !== "steps";

/**
 * The projection update, `updateProjection(renderer)` (EU 0x08815348, JP
 * 0x08816108): loads the field of view, aspect, near and far planes, calls
 * the perspective builder, records the field of view it was built with.
 */
const PROJECTION_SIGNATURE = [
  0x27bdfff0, 0xafbf000c, 0xafb00008, 0xc48c000c, 0xc48d0008, 0xc48e0000, 0xc48f0004, 0x0e205171,
  0x00808021, 0xc600000c, 0xe6000010, 0x8fbf000c, 0x8fb00008, 0x03e00008, 0x27bd0010,
].map(maskWord);
/** The signature's `jal perspective`. */
const PERSPECTIVE_CALL = 7;
/** The word of the function that keeps the scale, past where the new code returns. */
export const SCALE_WORD = 14;

const floatBits = (value: number): number => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(value);
  return b.readUInt32LE(0);
};

/**
 * The projection update's new first words, at `at`: record the angle as the
 * game has it, multiply it by the float in word `SCALE_WORD`, then
 * tail-call the perspective builder with the other three as before (it
 * returns to our caller). The original's words in between stay, unreached.
 */
export function projectionWords(at: number, jal: number): number[] {
  const scale = at + SCALE_WORD * 4;
  return [
    0xc48c000c, // lwc1 $f12, 0xc($a0): field of view
    0xe48c0010, // swc1 $f12, 0x10($a0): the one built with
    0x3c010000 | hi16(scale), // lui $at, hi(scale)
    (0xc4200000 | (scale & 0xffff)) >>> 0, // lwc1 $f0, lo(scale)($at)
    0x46006302, // mul.s $f12, $f12, $f0
    0xc48d0008, // lwc1 $f13, 8($a0): aspect
    0xc48e0000, // lwc1 $f14, 0($a0): near
    ((0x02 << 26) | (jal & 0x03ffffff)) >>> 0, // j perspective
    0xc48f0004, // lwc1 $f15, 4($a0): far
  ];
}

/** Where the projection update is in `eboot`, or why not. */
export function findProjectionUpdate(eboot: Buffer): { at: number; offset: number } | string {
  const segment = codeSegment(eboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const at = findUnique(eboot, segment, [PROJECTION_SIGNATURE])[0];
  if (at == null) return "this EBOOT's projection update doesn't match";
  return { at, offset: segment.offset + (at - segment.vaddr) };
}

/**
 * Patches the projection update in `eboot` (a copy to edit) to scale the
 * field of view by its last word, set to `scale`. Returns the scale's
 * address, for the blob, or why it can't.
 */
export function patchFov(eboot: Buffer, scale: number): number | string {
  const found = findProjectionUpdate(eboot);
  if (typeof found === "string") return found;
  const { at, offset } = found;
  const jal = eboot.readUInt32LE(offset + PERSPECTIVE_CALL * 4);
  projectionWords(at, jal).forEach((word, k) => eboot.writeUInt32LE(word, offset + k * 4));
  eboot.writeUInt32LE(floatBits(scale), offset + SCALE_WORD * 4);
  return at + SCALE_WORD * 4;
}

/**
 * The blob's externs for the camera, from the vanilla EBOOT, or why not
 * (the blob's need the hook sites). The EBOOT is patched later
 * (`patchFov`), once it's known to be needed.
 */
export function prepareCamera(
  vanillaEboot: Buffer,
  settings: WhetstoneSettings,
  sites: HookSites | string,
): Record<string, number> | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const renderer = findRendererGlobal(vanillaEboot, segment);
  if (typeof renderer === "string") return renderer;
  const found = findProjectionUpdate(vanillaEboot);
  if (typeof found === "string") return found;
  const blob: Record<string, number> = {};
  if (typeof sites !== "string") {
    const time = findImports(vanillaEboot, segment).get(SYSTEM_TIME_LOW_NID);
    if (time === undefined) return "this EBOOT doesn't import sceKernelGetSystemTimeLow";
    const at = (vaddr: number) =>
      vanillaEboot.readUInt32LE(segment.offset + (vaddr - segment.vaddr));
    // `lui v0, hi; jal padRead; lw a0, lo(pad)(v0)`: the pad object's global.
    blob.rf_pad = hiLo(at(sites.pad - 4), at(sites.pad + 4));
    blob.sceKernelGetSystemTimeLow = time;
  }
  return {
    ...blob,
    // The level's offset + 1: an extern's address is never 0 (1 would turn tilt off).
    rf_camera_level: LEVEL_OFFSET + 1,
    rf_camera: renderer,
    rf_fov_scale: found.at + SCALE_WORD * 4,
    // The disc's choices + 1: an extern's address is never 0 (`blob/camera.c`).
    rf_camera_fov: FOV_CHOICES.indexOf(settings["camera.fov"]) + 1,
    rf_camera_distance: DISTANCE_CHOICES.indexOf(settings["camera.distance"]) + 1,
    rf_camera_tilt: TILT_CHOICES.indexOf(settings["camera.tilt"]) + 1,
  };
}

export const cameraObjects = () => decodeObjects(CAMERA_OBJECTS);

/** What the disc starts with; `linked` when the blob is in, to move the camera back. */
export function cameraReport(settings: WhetstoneSettings, linked: boolean): Report {
  const fov = FOV_SCALES[settings["camera.fov"]];
  const distance = DISTANCE_SCALES[settings["camera.distance"]];
  const tilt = TILT_RATES[settings["camera.tilt"]];
  const notes: string[] = [];
  if (fov !== 1) notes.push(`Field of view ×${fov}: 50° to ${(50 * fov).toFixed(1)}° high.`);
  const blob = (what: string) =>
    `${what} isn't in this image: it's blob code, and the code loader isn't on this disc.`;
  if (distance !== 1) {
    notes.push(linked ? `Camera ×${distance} as far back.` : blob("Camera distance"));
  }
  if (tilt) {
    notes.push(
      linked
        ? `D-pad up and down tilt the camera smoothly, ${tilt}° a second.`
        : blob("Camera tilt"),
    );
  }
  notes.push(
    linked
      ? "They can be changed in game, from the START menu's Whetstone entry."
      : "The field of view can't be changed in game on this disc.",
  );
  return { title: "Camera", notes, lines: [], summary: `Camera: ${notes.join(" ")}` };
}
