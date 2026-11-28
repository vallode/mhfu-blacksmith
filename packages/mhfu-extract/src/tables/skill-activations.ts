/**
 * Skill activations: which skill each skill tree turns on at which point
 * total. Not in eboot.hexpat; found on the EU and FUC discs (the same 686
 * bytes on both, EU file offset 0x1b6114, FUC 0x1b12b4).
 *
 * One 7-byte row per tree, trees 2 to 99 in order, then a row starting
 * 0xFF: the tree (`SkillID`), then the skill it turns on at -20, -15, -10,
 * +10, +15 and +20 points. A skill is an index into the activation names
 * (`skillEffectNames`, the EU message file's table 0 from entry 906); 0 is
 * "No Skill". A tree with fewer levels repeats a skill (Paralysis: Para
 * Duration Halved at +10, Paralysis Negated at +15 and +20). Torso Up
 * (tree 1) has no row.
 *
 * The one reader, EU 0x088d897c, walks the rows until the 0xFF and, for each
 * tree, picks a column from the tree's total with fixed comparisons (`slti`
 * -19, -14, -9, 20, 15, 10), the same for every tree, and passes that
 * column's skill on (0x088d8da4). So the point totals are code; the table
 * only says what each one gives.
 */
import type { BinaryReader } from "../binary/reader.js";
import { resolveTableOffset, SKILL_ACTIVATION_ENTRY_SIZE, TABLE_COUNTS } from "./offsets.js";
import type { TableAddressResolver } from "./resolver.js";

/** The points each column stands for, in row order. */
export const ACTIVATION_POINTS = [-20, -15, -10, 10, 15, 20] as const;

export interface SkillActivationRow {
  /** File offset of the row. */
  at: number;
  tree: number;
  /** The skill at each of `ACTIVATION_POINTS`; 0 for none. */
  skills: number[];
}

/** Every tree's row, in disc order. Throws if the rows aren't trees 2-99 and a 0xFF row. */
export function readSkillActivations(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): SkillActivationRow[] {
  const base = resolveTableOffset("skillActivations", reader, resolver);
  const rows: SkillActivationRow[] = [];
  for (let i = 0; i < TABLE_COUNTS.skillActivations; i++) {
    const at = base + i * SKILL_ACTIVATION_ENTRY_SIZE;
    const tree = reader.u8(at);
    if (tree !== i + 2) {
      throw new Error(`skillActivations: row ${i} is tree ${tree}, not ${i + 2}`);
    }
    const skills = ACTIVATION_POINTS.map((_, k) => reader.u8(at + 1 + k));
    rows.push({ at, tree, skills });
  }
  const end = reader.u8(base + TABLE_COUNTS.skillActivations * SKILL_ACTIVATION_ENTRY_SIZE);
  if (end !== 0xff) throw new Error(`skillActivations: no 0xFF row after tree 99 (${end})`);
  return rows;
}
