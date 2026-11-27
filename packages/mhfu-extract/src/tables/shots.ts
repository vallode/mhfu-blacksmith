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
 * - Crag and Clust S hit like any shot, then burst (`ShotExplosion`). A Crag
 *   S (byte 34 its level + 2) sticks, and 50 frames on (byte 35) spawns an
 *   explosion (`CRAG_EXPLOSION_CODE`): its own attack, a row of the
 *   explosions' table (`EXPLOSION_ATTACK_CODE`), whose power is fixed. A
 *   Clust S (byte 34 7) bursts into bomblets (`CLUST_SPAWN_CODE`): bullets
 *   of shot ID 32, as many as its level's entry of a 4-byte table gives (u8
 *   shot ID, s16 count, indexed by byte 35), each initialised like a shot,
 *   so its power scales with attack. Neither attack's flags take the shot
 *   or melee path, so the hit code multiplies their power by 1 instead of
 *   the shot hitzone and the bowgun multiplier: fixed damage, plus their
 *   element on its hitzone. The init special-cases shot ID 32, and its
 *   entry, flags and attack row follow shot 31's in their tables (EU flags
 *   0, no path). If this code isn't found, the shots are read without their
 *   explosions (`ShotTables.explosionError`).
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

/**
 * A Clust S's burst (EU 0x09B6ECB8): `lbu v1,0x23(s0); lui v0,HI;
 * lwc1 f12,0x2c(s1); addiu v0,v0,LO; sll v1,v1,2; move a0,s2; jal <spawn>;
 * addu a1,v0,v1`: the bomblet table's entry for byte 35, passed with the
 * shot's power factor to the spawner.
 */
export const CLUST_SPAWN_CODE: readonly { word: number; mask: number }[] = [
  { word: 0x92030023, mask: 0xffffffff },
  { word: 0x3c020000, mask: 0xffff0000 },
  { word: 0xc62c002c, mask: 0xffffffff },
  { word: 0x24420000, mask: 0xffff0000 },
  { word: 0x00031880, mask: 0xffffffff },
  { word: 0x02402021, mask: 0xffffffff },
  { word: 0x0c000000, mask: 0xfc000000 },
  { word: 0x00432821, mask: 0xffffffff },
];
const CLUST_TABLE_WORDS = [1, 3] as const;
const CLUST_CALL_WORD = 6;
/** The spawner's reads of the entry: `lbu s1,0(a1); lh s0,2(a1)`, this many words in. */
const CLUST_SPAWNER_READS = { at: 9, words: [0x90b10000, 0x84b00002] } as const;
const CLUST_ENTRY_SIZE = 4;
/** More entries than Clust S has levels, to catch a byte 35 that isn't an index. */
const CLUST_MAX_ENTRIES = 8;

/**
 * A stuck Crag S's explosion (EU 0x09B70FD4): `lbu v1,0x22(s0)`, then for
 * each of three byte 34 values `addiu v0,zero,KIND; beql v1,v0,<case>`, and
 * the cases `lw a0,…; lw a1,0x10(s2); lhu t0,0x18(s2); addiu a2,s2,0x40;
 * jal <explode>; addiu a3,zero,ID` (the explosion's ID). Masked: the kinds,
 * IDs, the `lui`s' and `lw`s' immediates and the `jal` targets.
 */
const CRAG_CASE = (id: number) => [
  { word: 0x8c440000, mask: 0xffff0000 },
  { word: 0x8e450010, mask: 0xffffffff },
  { word: 0x96480018, mask: 0xffffffff },
  { word: 0x26460040, mask: 0xffffffff },
  { word: 0x0c000000, mask: 0xfc000000 },
  { word: 0x24070000 | id, mask: 0xffff0000 },
];
export const CRAG_EXPLOSION_CODE: readonly { word: number; mask: number }[] = [
  { word: 0x92030022, mask: 0xffffffff },
  { word: 0x24020005, mask: 0xffff0000 },
  { word: 0x50620019, mask: 0xffffffff },
  { word: 0x3c020000, mask: 0xffff0000 },
  { word: 0x24020004, mask: 0xffff0000 },
  { word: 0x5062000e, mask: 0xffffffff },
  { word: 0x3c020000, mask: 0xffff0000 },
  { word: 0x24020003, mask: 0xffff0000 },
  { word: 0x50620003, mask: 0xffffffff },
  { word: 0x3c020000, mask: 0xffff0000 },
  { word: 0x10000017, mask: 0xffffffff },
  { word: 0x00000000, mask: 0xffffffff },
  ...CRAG_CASE(8),
  { word: 0x1000000f, mask: 0xffffffff },
  { word: 0x00000000, mask: 0xffffffff },
  ...CRAG_CASE(14),
  { word: 0x10000007, mask: 0xffffffff },
  { word: 0x00000000, mask: 0xffffffff },
  ...CRAG_CASE(15),
];
/** `CRAG_EXPLOSION_CODE`'s `addiu v0,zero,KIND`s, each followed by its `beql`. */
const CRAG_KIND_WORDS = [1, 4, 7] as const;
/** A case's `addiu a3,zero,ID`, this many words after its first. */
const CRAG_ID_WORD = 5;

/**
 * The attack of the explosions Crag S spawns (EU 0x09B81948, the case for
 * explosion IDs 7, 8, 14 and 15): `move a0,s0; jal <set flags>; addiu
 * a1,zero,FLAGS; lbu v0,0xd(s0); lw a1,0x10(s0); lui a3,HI; move a0,s0;
 * addiu a2,v0,1; jal <copier>; addiu a3,a3,LO` (row ID + 1 of the
 * explosions' table, through its pointer), then `lw a0,0x10(s0); jal
 * <skill>; addiu a1,zero,0xb8`: with that skill, ×1.5 power and element.
 */
export const EXPLOSION_ATTACK_CODE: readonly { word: number; mask: number }[] = [
  { word: 0x02002021, mask: 0xffffffff },
  { word: 0x0c000000, mask: 0xfc000000 },
  { word: 0x24050000, mask: 0xffff0000 },
  { word: 0x9202000d, mask: 0xffffffff },
  { word: 0x8e050010, mask: 0xffffffff },
  { word: 0x3c070000, mask: 0xffff0000 },
  { word: 0x02002021, mask: 0xffffffff },
  { word: 0x24460001, mask: 0xffffffff },
  { word: 0x0c000000, mask: 0xfc000000 },
  { word: 0x24e70000, mask: 0xffff0000 },
  { word: 0x8e040010, mask: 0xffffffff },
  { word: 0x0c000000, mask: 0xfc000000 },
  { word: 0x240500b8, mask: 0xffffffff },
];
const EXPLOSION_FLAGS_WORD = 2;
const EXPLOSION_ATTACKS_WORDS = [5, 9] as const;

/** Bowgun shot IDs: one per `ShotCoat` bit (`SHOT_AMMO`). */
export const SHOT_COUNT = 32;
export const SHOT_ENTRY_SIZE = 36;
/** Attack flag sending a hit down the shot path, onto the shot hitzone. */
export const SHOT_PATH_FLAG = 0x08;
/** Attack flag sending a hit down the melee path (motion value and sharpness). */
export const MELEE_PATH_FLAG = 0x40;
/** Either path reads a hitzone; an explosion with neither deals its power as it is. */
const HITZONE_PATH_FLAGS = SHOT_PATH_FLAG | MELEE_PATH_FLAG;
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
 * passes, byte 35 times; Pellet S bursts into byte 35 pellets; a cluster
 * shot (Clust S) bursts into bomblets, byte 35 its entry in their table.
 * Other shots use the two bytes for other things (Crag S has its level + 2
 * and its fuse, 50 frames; Recovery, Demon and Armor S 9 and 5).
 */
export const SHOT_KIND = { pierce: 0x08, spread: 0x09, cluster: 0x07 } as const;

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
  /** What it bursts into: Crag S's explosion, Clust S's bomblets. */
  explosion: ShotExplosion | null;
}

/** The attack a Crag or Clust S bursts into, and how many of them. */
export interface ShotExplosion {
  /** Its attack row's byte 2: a motion value if `attackScaled`, else its power as it is. */
  power: number;
  /** It is initialised as a shot, so true attack / 100 scales its power (Clust S's bomblets). */
  attackScaled: boolean;
  element: { column: HitzoneColumn; value: number } | null;
  count: number;
}

export interface ShotTables {
  /** File offset of the init's code. */
  code: number;
  shots: Shot[];
  /**
   * Why the explosions couldn't be read, when they couldn't: every shot's
   * `explosion` is then null, and the rest of the shots stand.
   */
  explosionError: string | null;
}

const address = (ovl: OvlFile, at: number, [hiWord, loWord]: readonly [number, number]) => {
  const hi = ovl.reader.u32(at + hiWord * 4) & 0xffff;
  const lo = (ovl.reader.u32(at + loWord * 4) << 16) >> 16;
  return ((hi << 16) + lo) >>> 0;
};

/** An attack row's motion value (byte 2) and element (bits at 12, value at 14). */
function readAttackRow(ovl: OvlFile, row: number, what: string) {
  const { reader } = ovl;
  const bits = reader.u16(row + 12);
  const elements = ELEMENT_BITS.filter(([bit]) => bits & bit);
  if (elements.length > 1) throw new MotionTableError(`${what} has ${elements.length} elements`);
  const value = reader.u8(row + 14);
  return {
    motionValue: reader.u8(row + 2),
    element: elements[0] && value > 0 ? { column: elements[0][1], value } : null,
  };
}

/** The 24-byte rows a pointer's `lui`/`addiu` give, ending at the pointer, at least `min` of them. */
function readAttackTable(ovl: OvlFile, pointer: number, min: number, what: string) {
  const { reader } = ovl;
  if (!ovl.isOwnVaddr(pointer) || !ovl.isOwnVaddr(pointer + 3))
    throw new MotionTableError(`${what} pointer 0x${pointer.toString(16)} is outside the overlay`);
  const table = reader.u32(ovl.vaddrToOffset(pointer));
  const size = pointer - table;
  if (!ovl.isOwnVaddr(table) || size % MOTION_ROW_SIZE !== 0 || size / MOTION_ROW_SIZE < min)
    throw new MotionTableError(
      `${what} at 0x${table.toString(16)} don't end at their pointer 0x${pointer.toString(16)}`,
    );
  const rows = ovl.vaddrToOffset(table);
  for (let i = 0; i < MOTION_ROW_SIZE; i++)
    if (reader.u8(rows + i) !== 0) throw new MotionTableError(`${what} row 0 isn't empty`);
  return { rows, count: size / MOTION_ROW_SIZE };
}

const branchTarget = (ovl: OvlFile, at: number, word: number) =>
  word + 1 + ((ovl.reader.u32(at + word * 4) << 16) >> 16);
const imm = (ovl: OvlFile, at: number, word: number) => ovl.reader.u32(at + word * 4) & 0xffff;

/** Crag S's explosion IDs by byte 34, and their attacks. */
function readCragExplosions(ovl: OvlFile) {
  const at = findCode(ovl, CRAG_EXPLOSION_CODE, "Crag S explosion");
  const ids = new Map<number, number>();
  for (const word of CRAG_KIND_WORDS) {
    const target = branchTarget(ovl, at, word + 1);
    if (target + CRAG_ID_WORD >= CRAG_EXPLOSION_CODE.length)
      throw new MotionTableError("a Crag S explosion case is outside its code");
    ids.set(imm(ovl, at, word), imm(ovl, at, target + CRAG_ID_WORD));
  }
  const attack = findCode(ovl, EXPLOSION_ATTACK_CODE, "explosion attack");
  const flags = imm(ovl, attack, EXPLOSION_FLAGS_WORD);
  const table = readAttackTable(
    ovl,
    address(ovl, attack, EXPLOSION_ATTACKS_WORDS),
    Math.max(...ids.values()) + 2,
    "explosion attacks",
  );
  if (flags & HITZONE_PATH_FLAGS)
    throw new MotionTableError(`the explosions' flags 0x${flags.toString(16)} read a hitzone`);
  return { ids, rows: table.rows };
}

/** The bomblet table Clust S's burst reads, as a vaddr. */
function readClustTable(ovl: OvlFile) {
  const at = findCode(ovl, CLUST_SPAWN_CODE, "Clust S burst");
  const spawner = ((ovl.reader.u32(at + CLUST_CALL_WORD * 4) & 0x03ffffff) << 2) | 0x08000000;
  if (
    !ovl.isOwnVaddr(spawner) ||
    CLUST_SPAWNER_READS.words.some(
      (w, k) => ovl.reader.u32(ovl.vaddrToOffset(spawner) + (CLUST_SPAWNER_READS.at + k) * 4) !== w,
    )
  )
    throw new MotionTableError("the Clust S bomblet spawner doesn't read a shot ID and count");
  return address(ovl, at, CLUST_TABLE_WORDS);
}

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
  ] as const)
    if (!ovl.isOwnVaddr(at) || !ovl.isOwnVaddr(at + size - 1))
      throw new MotionTableError(`${what} at 0x${at.toString(16)} are outside the overlay`);
  const { rows, count: rowCount } = readAttackTable(ovl, pointer, SHOT_COUNT + 1, "shot attacks");
  const entry = (shot: number) => ovl.vaddrToOffset(entries) + shot * SHOT_ENTRY_SIZE;
  const flagsOf = (shot: number) => {
    const at = flags + shot * 4;
    if (!ovl.isOwnVaddr(at + 3))
      throw new MotionTableError(`shot ${shot}'s flags are outside the overlay`);
    return reader.u32(ovl.vaddrToOffset(at));
  };
  const row = (shot: number) => {
    if (shot + 1 >= rowCount) throw new MotionTableError(`shot ${shot} has no attack row`);
    return readAttackRow(ovl, rows + (shot + 1) * MOTION_ROW_SIZE, `shot ${shot}`);
  };

  const shots = Array.from({ length: SHOT_COUNT }, (_, shot): Shot => {
    const kind = reader.u8(entry(shot) + 34);
    const count = reader.u8(entry(shot) + 35);
    return {
      shot,
      ...row(shot),
      kind,
      count,
      shotPath: (flagsOf(shot) & SHOT_PATH_FLAG) !== 0,
      explosion: null,
    };
  });
  if (!shots.slice(0, 3).every((s) => s.shotPath && s.motionValue > 0))
    throw new MotionTableError("Normal S doesn't look like a shot");

  // The explosions are read apart, so a disc whose Crag or Clust S code
  // isn't recognised still has its other shots.
  let explosionError: string | null = null;
  try {
    const explosions = readExplosions(ovl, shots, row, flagsOf);
    shots.forEach((s, i) => (s.explosion = explosions[i] ?? null));
  } catch (error) {
    if (!(error instanceof MotionTableError)) throw error;
    explosionError = error.message;
  }
  return { code, shots, explosionError };
}

/** Each shot's explosion, by shot ID. Throws if the code or a table looks wrong. */
function readExplosions(
  ovl: OvlFile,
  shots: readonly Shot[],
  row: (shot: number) => ReturnType<typeof readAttackRow>,
  flagsOf: (shot: number) => number,
): (ShotExplosion | null)[] {
  const { reader } = ovl;
  const crag = readCragExplosions(ovl);
  const clust = readClustTable(ovl);
  return shots.map(({ kind, count }): ShotExplosion | null => {
    const id = crag.ids.get(kind);
    if (id !== undefined) {
      const blast = readAttackRow(ovl, crag.rows + (id + 1) * MOTION_ROW_SIZE, `explosion ${id}`);
      return { power: blast.motionValue, attackScaled: false, element: blast.element, count: 1 };
    }
    if (kind !== SHOT_KIND.cluster) return null;
    const at = clust + count * CLUST_ENTRY_SIZE;
    if (count >= CLUST_MAX_ENTRIES || !ovl.isOwnVaddr(clust) || !ovl.isOwnVaddr(at + 3))
      throw new MotionTableError(`Clust S bomblet entry ${count} is outside their table`);
    const bomblet = reader.u8(ovl.vaddrToOffset(at));
    const bomblets = (reader.u16(ovl.vaddrToOffset(at) + 2) << 16) >> 16;
    if (bomblet < SHOT_COUNT || bomblets <= 0)
      throw new MotionTableError(
        `Clust S bomblets ${bomblet} × ${bomblets} don't look like bomblets`,
      );
    const flags = flagsOf(bomblet);
    if (flags & HITZONE_PATH_FLAGS)
      throw new MotionTableError(`the bomblets' flags 0x${flags.toString(16)} read a hitzone`);
    const blast = row(bomblet);
    return {
      power: blast.motionValue,
      attackScaled: true,
      element: blast.element,
      count: bomblets,
    };
  });
}
