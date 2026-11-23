/**
 * Damage numbers (`hud.damageNumbers`): blob code (`blob/damage.c`) on the
 * code loader's hit, quest frame and HUD hooks (`game-hooks.ts`) pops a
 * number at the part each of the hunter's hits struck. This finds the
 * game's addresses the blob reads and calls, per disc.
 *
 * What the game does (found on the EU and JP discs, in PPSSPP's debugger):
 *
 * - The hit function (see `game-hooks.ts`) works the damage out as raw
 *   (the attack's power × its motion value × hitzone × sharpness × the
 *   hunter's attack multiplier) plus the element's share (the attack's
 *   element value × the part's element hitzone × elemental sharpness). The
 *   attack's `+0x28` flags say which element: 0x10 fire, 0x20 water, 0x40
 *   thunder, 0x80 ice, 0x100 dragon. For a melee hit it writes the hit's
 *   quality, hitzone × sharpness, to the attack's `+0x74`: 3 at 1.0 or more,
 *   2 at 0.45, then 1 and 0; shots leave it 0 and use the part's shot
 *   hitzone (the hitzone row's fourth byte).
 * - A monster's update takes the frame's part damage (`+0x3B8`, an s16 per
 *   part) off its HP times its defense multiplier (`+0x384`, a float).
 * - `jointPos(entity, out, joint)` (EU 0x08865F24) gives a joint's world
 *   position; a hitbox's first halfword is its joint.
 * - `project(camera, out, in)` (EU 0x08814674) puts a world position on the
 *   screen: x and y in pixels, then depth and w, with VFPU loads and stores
 *   that need both vectors 16-aligned. The game's name tags project the
 *   point above a hunter with the camera behind a global (EU `*0x089CBBE4`)
 *   and print at that x and y.
 * - The printer (see `pact.ts`) draws its glyphs at the size in its `+0x12C`
 *   (width) and `+0x12D` (height), with `+0x15F` its line height, as a
 *   setter (EU 0x08890DE8) shows. The numbers set them per number and put
 *   them back.
 *
 * Everything is found by code signatures, which match the EU and JP (FUC)
 * discs.
 */
import type { OvlFile } from "mhfu-extract/src/container/ovl.js";
import { DAMAGE_OBJECTS } from "../blob/damage-object.js";
import { decodeObjects } from "../blob/link.js";
import type { HookSites } from "./game-hooks.js";
import { findUnique, hiLo, jumpTarget } from "./mips.js";
import { findMonsterExterns } from "./monster-hp.js";
import { findTextExterns } from "./pact.js";

export const DAMAGE_NUMBERS = ["off", "total", "split"] as const;
export type DamageNumbers = (typeof DAMAGE_NUMBERS)[number];
/** The blob's `rf_damage_mode` (`blob/damage.c`): its mode + 1, as an extern's address is never 0. */
export const MODE = { off: 1, total: 2, split: 3 } as const;

/** `project(camera, out, in)` (EU 0x08814674, JP 0x08815434), masked. */
export const PROJECT_SIGNATURE = [
  0x27bdffe0, 0x3c030000, 0x8c670000, 0xc4e00000, 0x27a3001c, 0xe7a0001c, 0xd8c00000, 0xc8610000,
  0x65018080, 0xf8a00000, 0x3c030000, 0xaca30000, 0x44831000, 0x24830bc0,
];
/** `jointPos(entity, out, joint)` (EU 0x08865F24, JP 0x08865F1C), masked. */
export const JOINT_POS_SIGNATURE = [
  0x27bdfff0, 0xafbf0000, 0xafb00000, 0x00a08021, 0x7c062e20, 0x0c000000, 0x24840080, 0xc4400100,
  0xe6000000, 0xc4400104, 0xe6000004, 0xc4400108, 0xe6000008, 0x8fbf0000, 0x8fb00000, 0x03e00008,
];
const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);

/** The camera's global: what `lui r, hi; lw $a0, lo(r)` loads just before the `jal project`s. */
function findCamera(vanillaEboot: Buffer, sites: HookSites, project: number): number | null {
  const { segment } = sites;
  const holders = new Map<number, number>();
  for (let at = segment.offset + 8; at + 4 <= segment.offset + segment.size; at += 4) {
    const w = word(vanillaEboot, at);
    if (w >>> 26 !== 0x03 || jumpTarget(w, segment.vaddr + (at - segment.offset)) !== project) {
      continue;
    }
    const lw = word(vanillaEboot, at - 4);
    const lui = word(vanillaEboot, at - 8);
    const base = (lw >>> 21) & 31;
    if (lw >>> 26 !== 0x23 || ((lw >>> 16) & 31) !== 4) continue;
    if (lui >>> 26 !== 0x0f || ((lui >>> 16) & 31) !== base) continue;
    const holder = hiLo(lui, lw);
    holders.set(holder, (holders.get(holder) ?? 0) + 1);
  }
  return holders.size === 1 ? [...holders.keys()][0]! : null;
}

/** The blob's externs for damage numbers, or why they can't be found. */
export function findDamageExterns(
  vanillaEboot: Buffer,
  sites: HookSites,
  gameTask: Buffer,
  ovl: OvlFile,
  mode: DamageNumbers,
): Record<string, number> | string {
  const [project, jointPos] = findUnique(vanillaEboot, sites.segment, [
    PROJECT_SIGNATURE,
    JOINT_POS_SIGNATURE,
  ]);
  if (project == null) return "this EBOOT's projection code doesn't match";
  if (jointPos == null) return "this EBOOT's joint code doesn't match";
  const camera = findCamera(vanillaEboot, sites, project);
  if (camera == null) return "this EBOOT's camera wasn't found";
  const text = findTextExterns(vanillaEboot, sites);
  if (typeof text === "string") return text;
  const monsters = findMonsterExterns(gameTask, ovl);
  if (typeof monsters === "string") return monsters;
  return {
    rf_game_task: monsters.rf_game_task!,
    rf_printer: text.rf_printer!,
    rf_print: text.rf_print!,
    rf_camera: camera,
    rf_project: project,
    rf_joint_pos: jointPos,
    rf_damage_mode: MODE[mode],
  };
}

export const damageObjects = () => decodeObjects(DAMAGE_OBJECTS);
