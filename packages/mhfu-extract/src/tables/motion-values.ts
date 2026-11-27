/**
 * Blademaster motion values: the 24-byte attack rows in `game_task.ovl` that
 * a melee swing copies into its attack (found on the EU disc).
 *
 * How the game uses them (EU `game_task`):
 *
 * - The weapon's action code (one dispatcher per weapon class, picked by the
 *   hunter's class at `+0x1E8`, the jump table at 0x09C0C730) spawns an
 *   attack through `0x09B62E48(attacks, hunter, row, 0)`; its init
 *   (0x09B681F0) stores the row index at the attack's `+0x0D`.
 * - The swing builder (0x09B68318) passes that index, and the address of a
 *   pointer to this table (EU 0x09BFC948, which holds 0x09BFBEF8), to the
 *   row copier (0x09B674C0), which copies row `+0x0D` to the attack's
 *   `+0x1C`. So the motion value is row byte 2 (the attack's `+0x1E`), and
 *   byte 3 is how another hunter it hits reacts (the monsters' attack rows,
 *   `monsters/attacks.ts`, have the same layout). Row 0 is empty.
 * - Then, for Dual Blades in Demon Mode (hunter `+0x410` bit 0x10), it
 *   multiplies the motion value by 1.35 as a float and truncates it
 *   (`DEMON_MODE_MULTIPLIER`).
 *
 * The other tables the copier is given (bowgun shots, gunlance shells,
 * Felyne comrades, …) sit after this one, each followed by its own
 * pointer, as this one is; they are not read here.
 *
 * The table is found from the builder's code, not its address: the copier
 * call right after the builder reads `+0x0D` (`MOTION_TABLE_CALL`), whose
 * `lui`/`addiu` give the pointer.
 */
import type { OvlFile } from "../container/ovl.js";

export const MOTION_ROW_SIZE = 24;
/** Row byte holding the motion value. */
const MOTION_VALUE = 2;
/** Row byte holding another hunter's reaction to the hit (`monsters/attacks.ts`). */
const REACTION = 3;
/** Dual Blades' motion values in Demon Mode: `trunc(mv × 1.35)` (EU game_task 0x09B68990). */
export const DEMON_MODE_MULTIPLIER = 1.35;

/** A Dual Blades motion value in Demon Mode, as the game works it out (in single-precision floats). */
export function demonModeValue(motionValue: number): number {
  return Math.trunc(Math.fround(Math.fround(DEMON_MODE_MULTIPLIER) * motionValue));
}

/**
 * `lbu a2,0xd(s2); move s1,v0; lui a3,HI; move a0,s2; move a1,s1;
 * jal <copier>; addiu a3,a3,LO`: the builder handing the copier the row
 * index and the table's pointer. Masked words: `lui`'s and `addiu`'s
 * immediates and the `jal` target.
 */
export const MOTION_TABLE_CALL: readonly { word: number; mask: number }[] = [
  { word: 0x9246000d, mask: 0xffffffff },
  { word: 0x00408821, mask: 0xffffffff },
  { word: 0x3c070000, mask: 0xffff0000 },
  { word: 0x02402021, mask: 0xffffffff },
  { word: 0x02202821, mask: 0xffffffff },
  { word: 0x0c000000, mask: 0xfc000000 },
  { word: 0x24e70000, mask: 0xffff0000 },
];

export interface MotionRow {
  /** The row's index: what an attack's `+0x0D` holds. */
  row: number;
  motionValue: number;
  /** How another hunter it hits reacts (1 flinch, 2 trip, 3 sent flying, as far as seen). */
  reaction: number;
}

export interface MotionTable {
  /** File offset of the builder's copier call. */
  call: number;
  /** File offset of row 0. */
  offset: number;
  rows: MotionRow[];
}

export class MotionTableError extends Error {}

function findCall(ovl: OvlFile): number {
  return findCode(ovl, MOTION_TABLE_CALL, "motion table call");
}

/**
 * The Blademaster motion value table in `game_task.ovl`. It runs from the
 * address the pointer holds up to the pointer itself, so its length is
 * known without a terminator. Throws if the call isn't there once, or the
 * table doesn't look like one.
 */
export function readMotionTable(ovl: OvlFile): MotionTable {
  const { reader } = ovl;
  const call = findCall(ovl);
  const hi = reader.u32(call + 2 * 4) & 0xffff;
  const lo = (reader.u32(call + 6 * 4) << 16) >> 16;
  const pointer = ((hi << 16) + lo) >>> 0;
  if (!ovl.isOwnVaddr(pointer))
    throw new MotionTableError(
      `motion table pointer 0x${pointer.toString(16)} is outside the overlay`,
    );
  const table = reader.u32(ovl.vaddrToOffset(pointer));
  const size = pointer - table;
  if (!ovl.isOwnVaddr(table) || size <= 0 || size % MOTION_ROW_SIZE !== 0)
    throw new MotionTableError(
      `motion table at 0x${table.toString(16)} doesn't end at its pointer 0x${pointer.toString(16)}`,
    );
  const offset = ovl.vaddrToOffset(table);
  const count = size / MOTION_ROW_SIZE;
  for (let i = 0; i < MOTION_ROW_SIZE; i++)
    if (reader.u8(offset + i) !== 0) throw new MotionTableError("motion table row 0 isn't empty");
  const rows: MotionRow[] = [];
  for (let row = 0; row < count; row++) {
    const at = offset + row * MOTION_ROW_SIZE;
    rows.push({
      row,
      motionValue: reader.u8(at + MOTION_VALUE),
      reaction: reader.u8(at + REACTION),
    });
  }
  return { call, offset, rows };
}

/**
 * How a hunter's hit picks its hitzone (EU game_sub 0x09C43A94, static):
 * it weighs the part's cut and impact values by the hunter's two hitzone
 * weights (percentages at hunter `+0x10F0` and `+0x10F1`) and takes the
 * larger, `max(cut × cutWeight, impact × impactWeight) / 10000`. Shot hits
 * read the shot column instead. Attack row byte 9 doesn't pick the column:
 * bit 0x01 lets an impact hit's KO and exhaust count and 0x02 a cut's tail
 * cut, and when both are set (every Lance row) the column that won decides.
 *
 * The weights come from a table of two bytes per weapon class
 * (`WEAPON_TYPE_NAMES` order), set whenever the weapon is readied (EU
 * game_task 0x09A68118, the table at 0x09BB74F0) every time the hunter
 * starts an action (0x09A67530). The setter also gives the Long Sword a cut
 * weight of 112 while its spirit gauge glows (hunter `+0x610`, a timer set
 * to 900 frames when the gauge reaches 100, 0x09BAE2BC), and the Lance 112
 * and 81 while hunter `+0x111C` bit 0x20 is set: its charge sets that bit
 * and those weights once it has run 82 frames and speeds up (0x09BA731C),
 * and every way out of the charge clears it before the next action, so only
 * the charge's own hits get them. The Great Sword's charged slashes set
 * their own cut weight (0x09BA3100: 110, 120, 130).
 */
export interface HitzoneWeights {
  cut: number;
  impact: number;
}

/**
 * `lbu a2,0x1e8(a0); lui v1,HI; lui a1,HI; addiu v1,v1,LO; sll a2,a2,1;
 * addu v1,v1,a2; lbu a2,0(v1); addiu a1,a1,LO+1; sb a2,0x10f0(a0)`: the
 * weights' setter indexing the table by the hunter's weapon class; then the
 * impact column the same way, `if (class == CLASS && h+0x610) cut = W`
 * (`addiu v1,zero,CLASS` … `lh v1,0x610(a0); beqz; nop; addiu v1,zero,W;
 * sb v1,0x10f0(a0)`), and `if (class == CLASS && h+0x111C & 0x20) cut = C,
 * impact = I`. Masked words: the `lui`s' and `addiu`s' immediates. It
 * matches once on the EU and FUC (JP) discs, with the same values.
 */
export const HITZONE_WEIGHTS_CODE: readonly { word: number; mask: number }[] = [
  { word: 0x908601e8, mask: 0xffffffff },
  { word: 0x3c030000, mask: 0xffff0000 },
  { word: 0x3c050000, mask: 0xffff0000 },
  { word: 0x24630000, mask: 0xffff0000 },
  { word: 0x00063040, mask: 0xffffffff },
  { word: 0x00661821, mask: 0xffffffff },
  { word: 0x90660000, mask: 0xffffffff },
  { word: 0x24a50000, mask: 0xffff0000 },
  { word: 0xa08610f0, mask: 0xffffffff },
  { word: 0x908601e8, mask: 0xffffffff },
  { word: 0x24030000, mask: 0xffff0000 },
  { word: 0x00063040, mask: 0xffffffff },
  { word: 0x00a62821, mask: 0xffffffff },
  { word: 0x90a50000, mask: 0xffffffff },
  { word: 0xa08510f1, mask: 0xffffffff },
  { word: 0x908501e8, mask: 0xffffffff },
  { word: 0x54a30007, mask: 0xffffffff },
  { word: 0x908501e8, mask: 0xffffffff },
  { word: 0x84830610, mask: 0xffffffff },
  { word: 0x10600003, mask: 0xffffffff },
  { word: 0x00000000, mask: 0xffffffff },
  { word: 0x24030000, mask: 0xffff0000 },
  { word: 0xa08310f0, mask: 0xffffffff },
  { word: 0x908501e8, mask: 0xffffffff },
  { word: 0x24030000, mask: 0xffff0000 },
  { word: 0x14a3000b, mask: 0xffffffff },
  { word: 0x00000000, mask: 0xffffffff },
  { word: 0x8c85111c, mask: 0xffffffff },
  { word: 0x24030001, mask: 0xffffffff },
  { word: 0x30a50020, mask: 0xffffffff },
  { word: 0x0005282b, mask: 0xffffffff },
  { word: 0x14a30005, mask: 0xffffffff },
  { word: 0x00000000, mask: 0xffffffff },
  { word: 0x24030000, mask: 0xffff0000 },
  { word: 0xa08310f0, mask: 0xffffffff },
  { word: 0x24030000, mask: 0xffff0000 },
  { word: 0xa08310f1, mask: 0xffffffff },
];
/** Words of `HITZONE_WEIGHTS_CODE` whose immediates are the boosts' classes and weights. */
const GLOW_CLASS_WORD = 10;
const GLOW_CUT_WORD = 21;
const CHARGE_CLASS_WORD = 24;
const CHARGE_CUT_WORD = 33;
const CHARGE_IMPACT_WORD = 35;

export interface HitzoneWeightTables {
  /** Each weapon class's weights, in `WEAPON_TYPE_NAMES` order. */
  classes: HitzoneWeights[];
  /** The Long Sword's cut weight while its spirit gauge glows. */
  spiritGlow: { weaponClass: number; cut: number };
  /** The Lance's weights once its charge runs at full speed. */
  charge: { weaponClass: number } & HitzoneWeights;
}

/** Weapon classes the weights table holds, `WEAPON_TYPE_NAMES` order. */
export const WEAPON_CLASS_COUNT = 11;

function findCode(ovl: OvlFile, code: readonly { word: number; mask: number }[], what: string) {
  const { reader } = ovl;
  const found: number[] = [];
  const last = reader.length - code.length * 4;
  for (let at = 0; at <= last; at += 4) {
    if (
      code.every(
        ({ word, mask }, k) => (reader.u32(at + k * 4) & mask) >>> 0 === (word & mask) >>> 0,
      )
    )
      found.push(at);
  }
  if (found.length !== 1)
    throw new MotionTableError(`expected one ${what} in ${ovl.name}, found ${found.length}`);
  return found[0]!;
}

/** Each weapon class's hitzone weights, and the spirit gauge's. */
export function readHitzoneWeights(ovl: OvlFile): HitzoneWeightTables {
  const { reader } = ovl;
  const at = findCode(ovl, HITZONE_WEIGHTS_CODE, "hitzone weights setter");
  const hi = reader.u32(at + 1 * 4) & 0xffff;
  const lo = (reader.u32(at + 3 * 4) << 16) >> 16;
  const table = ((hi << 16) + lo) >>> 0;
  const impactLo = (reader.u32(at + 7 * 4) << 16) >> 16;
  if ((((reader.u32(at + 2 * 4) & 0xffff) << 16) + impactLo) >>> 0 !== table + 1)
    throw new MotionTableError("the hitzone weights' impact column isn't next to the cut one");
  if (!ovl.isOwnVaddr(table) || !ovl.isOwnVaddr(table + WEAPON_CLASS_COUNT * 2 - 1))
    throw new MotionTableError(
      `hitzone weights at 0x${table.toString(16)} are outside the overlay`,
    );
  const offset = ovl.vaddrToOffset(table);
  const classes = Array.from({ length: WEAPON_CLASS_COUNT }, (_, i) => {
    const w = { cut: reader.u8(offset + i * 2), impact: reader.u8(offset + i * 2 + 1) };
    if (w.cut + w.impact === 0 || w.cut > 200 || w.impact > 200)
      throw new MotionTableError(`weapon class ${i}'s hitzone weights look wrong`);
    return w;
  });
  const spiritGlow = {
    weaponClass: reader.u32(at + GLOW_CLASS_WORD * 4) & 0xffff,
    cut: reader.u32(at + GLOW_CUT_WORD * 4) & 0xffff,
  };
  if (spiritGlow.weaponClass >= WEAPON_CLASS_COUNT || spiritGlow.cut === 0 || spiritGlow.cut > 200)
    throw new MotionTableError("the spirit gauge's hitzone weight looks wrong");
  const immediate = (word: number) => reader.u32(at + word * 4) & 0xffff;
  const charge = {
    weaponClass: immediate(CHARGE_CLASS_WORD),
    cut: immediate(CHARGE_CUT_WORD),
    impact: immediate(CHARGE_IMPACT_WORD),
  };
  if (
    charge.weaponClass >= WEAPON_CLASS_COUNT ||
    charge.cut + charge.impact === 0 ||
    charge.cut > 200 ||
    charge.impact > 200
  )
    throw new MotionTableError("the charge's hitzone weights look wrong");
  return { classes, spiritGlow, charge };
}
