/**
 * Bowgun shots: each ammo's power, element and hits, from `game_task.ovl`
 * (a static read of the EU disc's code, not checked in game).
 *
 * How the game uses them (EU `game_task`):
 *
 * - A bowgun fires through 0x09B63710 with the loaded shot's ID (hunter
 *   `+0x55C`, the `ShotCoat` bit order) and a power factor of 1.0, or one of
 *   the rapid fire factors (EBOOT 0x0893123C) for a burst's shots; the
 *   bullet keeps the ID at `+0x0D` and the factor at `+0x11C`.
 * - The bullet's init (0x09B6F7A4, `SHOT_INIT_CODE`) copies attack row
 *   `ID + 1` (row 0 is empty) of its own 24-byte table, laid out like the
 *   Blademaster's (`tables/motion-values.ts`), into the bullet's attack: byte
 *   2 is the shot's motion value, the u16 at byte 12 its element and status
 *   bits (`ELEMENT_BITS`; 0x01 sleep, 0x02 poison, 0x04 paralysis) and byte
 *   14 their value. Pellet S's rows have water (5, 4 and 4 per pellet). It sets the attack's flags from a u32 per shot ID; 0x08
 *   sends its hits down the hit code's shot path (EU game_sub 0x09C441A8),
 *   which reads the part's shot hitzone and, for a bowgun (weapon class 1 or
 *   5), multiplies the physical damage by 1.15 (`BOWGUN_SHOT_MULTIPLIER`).
 * - Then (0x09B703C8) it scales the motion value by the hunter's true
 *   attack / 100 (hunter `+0x380`, set from `+0x420`) times the power
 *   factor, truncated and held to 1–255. For Flame, Water, Thunder and Freeze
 *   S (`ATTACK_SCALED_ELEMENT_SHOTS`, the 0x09B70570 case of the shot ID
 *   switch) it scales the element value the same way; Dragon S keeps its own.
 * - A 36-byte entry per shot ID (also given by the init) holds its flight;
 *   for pierce and spread shots, bytes 34 and 35 are how it hits and how
 *   many times (`SHOT_KIND`).
 *
 * The tables are found from the init's code, not their addresses.
 */
import type { OvlFile } from "../container/ovl.js";
import type { HitzoneColumn } from "../monsters/hitzones.js";
import { findCode, MOTION_ROW_SIZE, MotionTableError } from "./motion-values.js";

/**
 * `lbu a1,0xd(a0); lw s2,0x10(a0); lui v0,HI; …; addiu v0,v0,LO` (the
 * 36-byte entry for `+0x0D`), `lui v0,HI; addiu v0,v0,LO` (the flags), then
 * `jal <set flags>` and `lui a3,HI; …; jal <copier>; addiu a3,a3,LO` (the
 * attack table's pointer, row `+0x0D + 1`). Masked words: the `lui`s' and
 * `addiu`s' immediates and the `jal` targets.
 */
export const SHOT_INIT_CODE: readonly { word: number; mask: number }[] = [
  { word: 0x9085000d, mask: 0xffffffff },
  { word: 0x8c920010, mask: 0xffffffff },
  { word: 0x3c020000, mask: 0xffff0000 },
  { word: 0x000518c0, mask: 0xffffffff },
  { word: 0x00651821, mask: 0xffffffff },
  { word: 0x24420000, mask: 0xffff0000 },
  { word: 0x00031880, mask: 0xffffffff },
  { word: 0x00438021, mask: 0xffffffff },
  { word: 0xa48000c2, mask: 0xffffffff },
  { word: 0x9083000d, mask: 0xffffffff },
  { word: 0x3c020000, mask: 0xffff0000 },
  { word: 0x24420000, mask: 0xffff0000 },
  { word: 0x00031880, mask: 0xffffffff },
  { word: 0x00431021, mask: 0xffffffff },
  { word: 0x00809821, mask: 0xffffffff },
  { word: 0x8c450000, mask: 0xffffffff },
  { word: 0x0c000000, mask: 0xfc000000 },
  { word: 0x267100f0, mask: 0xffffffff },
  { word: 0x9262000d, mask: 0xffffffff },
  { word: 0x8e650010, mask: 0xffffffff },
  { word: 0x3c070000, mask: 0xffff0000 },
  { word: 0x02602021, mask: 0xffffffff },
  { word: 0x24460001, mask: 0xffffffff },
  { word: 0x0c000000, mask: 0xfc000000 },
  { word: 0x24e70000, mask: 0xffff0000 },
];
/** `SHOT_INIT_CODE` words holding each table's `lui` and `addiu`. */
const ENTRY_WORDS = [2, 5] as const;
const FLAGS_WORDS = [10, 11] as const;
const ATTACKS_WORDS = [20, 24] as const;

/** Bowgun shot IDs: one per `ShotCoat` bit (`SHOT_AMMO`). */
export const SHOT_COUNT = 32;
export const SHOT_ENTRY_SIZE = 36;
/** Attack flag sending a hit down the shot path, onto the shot hitzone. */
export const SHOT_PATH_FLAG = 0x08;
/** A bowgun's shots deal this times their physical damage (EU game_sub 0x09C44204). */
export const BOWGUN_SHOT_MULTIPLIER = 1.15;
/** Shot IDs whose element value scales with attack: Flame, Water, Thunder and Freeze S. */
export const ATTACK_SCALED_ELEMENT_SHOTS: ReadonlySet<number> = new Set([15, 16, 17, 18]);

/** Attack row bits for an element, and the hitzone column each one reads. */
export const ELEMENT_BITS: readonly [number, HitzoneColumn][] = [
  [0x10, "fire"],
  [0x20, "water"],
  [0x40, "thunder"],
  [0x80, "ice"],
  [0x100, "dragon"],
];

/**
 * Byte 34 of a shot's entry, for the shots whose byte 35 is a count: a
 * pierce shot (Pierce S, and Water, Thunder, Freeze and Dragon S) hits as it
 * passes, byte 35 times; Pellet S bursts into byte 35 pellets. Other shots
 * use the two bytes for other things (Crag S has 3 to 5 and 50, Clust S 7
 * and its level, Recovery, Demon and Armor S 9 and 5).
 */
export const SHOT_KIND = { pierce: 0x08, spread: 0x09 } as const;

export interface Shot {
  /** The shot ID: the `ShotCoat` bit. */
  shot: number;
  motionValue: number;
  /** Its element and that element's value; null if it has none. */
  element: { column: HitzoneColumn; value: number } | null;
  /** Its entry's bytes 34 (`SHOT_KIND`) and 35. */
  kind: number;
  count: number;
  /** Its flags send it down the shot path. */
  shotPath: boolean;
}

export interface ShotTables {
  /** File offset of the init's code. */
  code: number;
  shots: Shot[];
}

const address = (ovl: OvlFile, at: number, [hiWord, loWord]: readonly [number, number]) => {
  const hi = ovl.reader.u32(at + hiWord * 4) & 0xffff;
  const lo = (ovl.reader.u32(at + loWord * 4) << 16) >> 16;
  return ((hi << 16) + lo) >>> 0;
};

/** The bowgun shots, by shot ID. Throws if the init isn't there once or a table looks wrong. */
export function readShots(ovl: OvlFile): ShotTables {
  const { reader } = ovl;
  const code = findCode(ovl, SHOT_INIT_CODE, "bowgun shot init");
  const entries = address(ovl, code, ENTRY_WORDS);
  const flags = address(ovl, code, FLAGS_WORDS);
  const pointer = address(ovl, code, ATTACKS_WORDS);
  for (const [what, at, size] of [
    ["shot entries", entries, SHOT_COUNT * SHOT_ENTRY_SIZE],
    ["shot flags", flags, SHOT_COUNT * 4],
    ["shot attack pointer", pointer, 4],
  ] as const)
    if (!ovl.isOwnVaddr(at) || !ovl.isOwnVaddr(at + size - 1))
      throw new MotionTableError(`${what} at 0x${at.toString(16)} are outside the overlay`);
  const table = reader.u32(ovl.vaddrToOffset(pointer));
  const size = pointer - table;
  if (
    !ovl.isOwnVaddr(table) ||
    size % MOTION_ROW_SIZE !== 0 ||
    size / MOTION_ROW_SIZE <= SHOT_COUNT
  )
    throw new MotionTableError(
      `shot attacks at 0x${table.toString(16)} don't end at their pointer 0x${pointer.toString(16)}`,
    );
  const rows = ovl.vaddrToOffset(table);
  for (let i = 0; i < MOTION_ROW_SIZE; i++)
    if (reader.u8(rows + i) !== 0) throw new MotionTableError("shot attack row 0 isn't empty");
  const shots = Array.from({ length: SHOT_COUNT }, (_, shot): Shot => {
    const row = rows + (shot + 1) * MOTION_ROW_SIZE;
    const bits = reader.u16(row + 12);
    const elements = ELEMENT_BITS.filter(([bit]) => bits & bit);
    if (elements.length > 1)
      throw new MotionTableError(`shot ${shot} has ${elements.length} elements`);
    const value = reader.u8(row + 14);
    const entry = ovl.vaddrToOffset(entries) + shot * SHOT_ENTRY_SIZE;
    return {
      shot,
      motionValue: reader.u8(row + 2),
      element: elements[0] && value > 0 ? { column: elements[0][1], value } : null,
      kind: reader.u8(entry + 34),
      count: reader.u8(entry + 35),
      shotPath: (reader.u32(ovl.vaddrToOffset(flags) + shot * 4) & SHOT_PATH_FLAG) !== 0,
    };
  });
  if (!shots.slice(0, 3).every((s) => s.shotPath && s.motionValue > 0))
    throw new MotionTableError("Normal S doesn't look like a shot");
  return { code, shots };
}
