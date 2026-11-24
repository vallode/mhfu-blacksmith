/**
 * The target camera (`camera.target`): L turns the camera to face a large
 * monster from behind the hunter, marks it on screen, and two settings in
 * randomfu's START menu entry (Target camera, Target mark). The blob code is `blob/target-camera.c`, on a call of hook 8's stub
 * that this adds; this finds the game's addresses per disc.
 *
 * What the game does (EU addresses; JP's code is the same words, at
 * 0x08887318 for the ease):
 *
 * - The follow camera (EU 0x08886E50, the renderer's mode at +0xB0) keeps
 *   its yaw in the renderer's +0x150 sub-object: +0x80 the yaw it turns to,
 *   +0x82 the yaw it has (s16, the angle of the eye seen from the hunter,
 *   atan2(x, z) in 65536ths of a turn), +0x84 and +0x86 the buttons it sees,
 *   held and pressed (the renderer's +0xA70 and +0xA72, cleared in menus).
 * - Each frame something sets the yaw to turn to: L's recentre (the
 *   renderer's +0xA81, set from `game_task` by EU 0x08813188) to behind the
 *   hunter, D-pad left and right ±0x47E a frame, a forced view; then every
 *   path meets at the ease (EU 0x08887614), which moves the yaw it has a
 *   quarter of the way: `lh $v0, 0x80($s4); lh $v1, 0x82($s4); subu; seh;
 *   sra 2; seh; addu; sh $v0, 0x82($s4)`.
 *
 * The ease's first word becomes a `jal` to hook 8's stub, its delay slot
 * `move $a0, $s4`, and the rest the same ease (the second `seh` is a no-op
 * after `sra` and goes). The game's own call, used without the blob, is
 * two words in the projection update that `patchFov` leaves unreached
 * (`camera.ts`), `jr $ra; lh $v0, 0x80($a0)`, so the camera's EBOOT patch
 * always goes in with it.
 */
import { decodeObjects } from "../blob/link.js";
import { TARGET_CAMERA_OBJECTS } from "../blob/target-camera-object.js";
import type { Settings } from "../settings.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import type { OvlFile } from "mhfu-extract/src/container/ovl.js";
import { findProjectionUpdate, SCALE_WORD } from "./camera.js";
import { findImports } from "./code-loader.js";
import type { HookCall } from "./game-hooks.js";
import { findRendererGlobal } from "./hitboxes.js";
import { codeSegment, findUnique, maskWord } from "./mips.js";
import { findMonsterExterns } from "./monster-hp.js";
import { FILL_SIGNATURE } from "./pact.js";
import { SYSTEM_TIME_LOW_NID } from "./unknown-quests.js";

const MODES = ["off", "tap", "follow"] as const;

/**
 * The follow camera setting the yaw behind the hunter (`lw $v0,
 * 0x1f4($s3)`, `^ 0x8000`, an eighth of the way), then the ease: exact
 * words, the same on EU and JP.
 */
export const EASE_SIGNATURE = [
  0x8e6201f4, 0x86830080, 0x38428000, 0x00431023, 0x7c021620, 0x000210c3, 0x7c021620, 0x00621021,
  0xa6820080, 0xa2800089, 0xa296008f, 0x86820080, 0x86830082, 0x00431023, 0x7c021620, 0x00021083,
  0x7c021620, 0x00621021, 0xa6820082,
];
/** The ease's first word in the signature: `lh $v0, 0x80($s4)`. */
export const EASE_WORD = 11;
/** The ease after its `jal`: `move $a0, $s4`, then the ease without its first word and second `seh`. */
export const EASE_WORDS = [
  0x02802021, 0x86830082, 0x00431023, 0x7c021620, 0x00021083, 0x00621021, 0xa6820082,
];
/** The game's read, `jr $ra; lh $v0, 0x80($a0)`, at the projection update's word 9 (unreached after `patchFov`). */
export const READ_WORD = 9;
export const READ_WORDS = [0x03e00008, 0x84820080];

export interface TargetCamera {
  externs: Record<string, number>;
  /** The call it adds to hook 8. */
  calls: HookCall[];
  /** Writes the ease and the game's read into `eboot`, once the loader went in with the call. */
  patch(eboot: Buffer): void;
}

/** Where the ease's first word is in `eboot`, or why not. */
export function findEase(eboot: Buffer): number | string {
  const segment = codeSegment(eboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const code = eboot.subarray(segment.offset, segment.offset + segment.size);
  const bytes = Buffer.alloc(EASE_SIGNATURE.length * 4);
  EASE_SIGNATURE.forEach((w, k) => bytes.writeUInt32LE(w, k * 4));
  const at = code.indexOf(bytes);
  if (at < 0 || at % 4 || code.indexOf(bytes, at + 4) >= 0) {
    return "this EBOOT's follow camera doesn't match";
  }
  return segment.vaddr + at + EASE_WORD * 4;
}

/** The target camera's externs, call and patch, from the vanilla EBOOT and `game_task`, or why not. */
export function prepareTargetCamera(
  vanillaEboot: Buffer,
  gameTask: Buffer,
  ovl: OvlFile,
  settings: Settings,
): TargetCamera | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const ease = findEase(vanillaEboot);
  if (typeof ease === "string") return ease;
  const projection = findProjectionUpdate(vanillaEboot);
  if (typeof projection === "string") return projection;
  if (READ_WORD + READ_WORDS.length > SCALE_WORD) throw new Error("The read overlaps the scale");
  const renderer = findRendererGlobal(vanillaEboot, segment);
  if (typeof renderer === "string") return renderer;
  const monsters = findMonsterExterns(gameTask, ovl);
  if (typeof monsters === "string") return monsters;
  const time = findImports(vanillaEboot, segment).get(SYSTEM_TIME_LOW_NID);
  if (time === undefined) return "this EBOOT doesn't import sceKernelGetSystemTimeLow";
  const [fill] = findUnique(vanillaEboot, segment, [FILL_SIGNATURE.map(maskWord)]);
  if (fill == null) return "this EBOOT's HUD fill code doesn't match";
  const read = projection.at + READ_WORD * 4;
  const offsetOf = (vaddr: number) => segment.offset + (vaddr - segment.vaddr);
  return {
    externs: {
      rf_camera: renderer,
      rf_monsters: monsters.rf_monsters!,
      rf_game_task: monsters.rf_game_task!,
      rf_em_chunks: monsters.rf_em_chunks!,
      rf_target_yaw: read,
      rf_fill: fill,
      sceKernelGetSystemTimeLow: time,
      // The disc's mode + 1: an extern's address is never 0 (`blob/target-camera.c`).
      rf_camera_target: MODES.indexOf(settings["camera.target"]) + 1,
    },
    calls: [{ call: ease, target: read }],
    patch(eboot) {
      EASE_WORDS.forEach((w, k) => eboot.writeUInt32LE(w, offsetOf(ease + 4 + k * 4)));
      READ_WORDS.forEach((w, k) => eboot.writeUInt32LE(w, offsetOf(read + k * 4)));
    },
  };
}

export const targetCameraObjects = () => decodeObjects(TARGET_CAMERA_OBJECTS);

export function targetCameraReport(settings: Settings): ShuffleReport {
  const mode = settings["camera.target"];
  const notes = [
    mode === "off"
      ? "Target camera: off on this disc; the START menu's randomfu entry turns it on."
      : `Target camera: L turns the camera to a large monster${mode === "follow" ? " and keeps it in view" : ""}; hold L and press D-pad left or right for the next one, L twice for behind you.`,
  ];
  return { title: "Target camera", notes, lines: [], summary: notes[0]! };
}
