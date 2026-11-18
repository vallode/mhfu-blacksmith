/**
 * Skill activations: what each skill tree turns on at which point total.
 *
 * The table (mhfu-extract's `tables/skill-activations.ts`) has a row per
 * tree with the skill at -20, -15, -10, +10, +15 and +20 points; the game
 * compares a tree's total with those six numbers in code, the same for
 * every tree, so only the skills in the columns can change. A row's good
 * half is its +10, +15 and +20 columns and its bad half the -10, -15 and
 * -20 ones; on the disc every half that has a skill has one from 10
 * points, and 50 trees have no bad half.
 *
 * Two modes:
 *
 * - **shuffle**: trees trade whole rows, good and bad halves together, so
 *   Attack +10 may give Guard +1 and Attack -10 Guard -1.
 * - **split**: good halves trade between trees, and bad halves between
 *   trees that have one, apart, so one tree's good skills and bad skills
 *   come from different trees.
 *
 * Either way, rows trade only between trees that suit the same pieces
 * (`skillTrees`: anyone, Blademasters, Gunners, or only pieces both can
 * wear), so Gunner skills stay on trees Gunner armor has. In `shuffle`, a
 * tree with a bad half trades only with others that have one: armor never
 * gives negative points to a tree with no bad half on the disc (one
 * decoration gives Auto-Reload -1), so those points keep doing nothing.
 * Every skill stays on exactly one tree. Trees no armor or decoration has
 * keep their rows, since a skill moved onto one could never turn on.
 *
 * With `thresholds`, each skill in a half needs 5 points more or fewer
 * (one column), within 10 to 20 and still weakest first: a lone skill at
 * +10 can move to +15, Paralysis Negated from +15 to +20, and a
 * half with three skills stays as it is. Trees no decoration adds points to
 * keep their columns, since armor alone may not reach the next one.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { skillEffectNames } from "mhfu-extract/src/strings/enums.js";
import {
  ACTIVATION_POINTS,
  readSkillActivations,
  type SkillActivationRow,
} from "mhfu-extract/src/tables/skill-activations.js";
import type { TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import type { Edits } from "../edits.js";
import type { Rng } from "../rng.js";
import { skillTrees, treeName, type TreeUse } from "./armor-skills.js";
import { permuteWithinGroups, type ShuffleReport } from "./shuffle.js";

export type SkillActivationMode = "off" | "shuffle" | "split";

export interface SkillActivationOptions {
  mode: SkillActivationMode;
  /** Each skill may need 5 points more or fewer. */
  thresholds: boolean;
}

/** A half's three columns, nearest 0 first: +10, +15, +20 or -10, -15, -20. */
type Half = [number, number, number];

const GOOD = [3, 4, 5] as const;
const BAD = [2, 1, 0] as const;

const halfOf = (skills: number[], columns: readonly number[]) =>
  columns.map((c) => skills[c]!) as Half;

function withHalf(skills: number[], columns: readonly number[], half: Half): number[] {
  const out = [...skills];
  columns.forEach((c, k) => (out[c] = half[k]!));
  return out;
}

const filled = (half: Half) => half.some((s) => s !== 0);

/** A half's skills, each with the first column it's in. */
function tiers(half: Half): { skill: number; from: number }[] {
  const out: { skill: number; from: number }[] = [];
  half.forEach((skill, k) => {
    if (skill !== 0 && skill !== out.at(-1)?.skill) out.push({ skill, from: k });
  });
  return out;
}

/** Each tier one column nearer or further, or where it is: kept in order, within the half. */
function shiftHalf(half: Half, rng: Rng): Half {
  const now = tiers(half);
  let options: number[][] = [[]];
  for (const { from } of now) {
    options = options.flatMap((o) => [-1, 0, 1].map((d) => [...o, from + d]));
  }
  options = options.filter((o) =>
    o.every((c, k) => c >= 0 && c <= 2 && (k === 0 || c > o[k - 1]!)),
  );
  const pick = options[rng.int(options.length)]!;
  return [0, 1, 2].map((c) => {
    let skill = 0;
    pick.forEach((from, k) => {
      if (from <= c) skill = now[k]!.skill;
    });
    return skill;
  }) as Half;
}

function skillName(skill: number): string {
  return skillEffectNames()[skill] ?? `Skill ${skill}`;
}

/** "Guard +1 (+10), Guard +2 (+15), Guard -1 (-10)". */
function describe(skills: number[]): string {
  const parts = [
    ...tiers(halfOf(skills, GOOD)).map((t) => `${skillName(t.skill)} (+${10 + t.from * 5})`),
    ...tiers(halfOf(skills, BAD)).map((t) => `${skillName(t.skill)} (-${10 + t.from * 5})`),
  ];
  return parts.length > 0 ? parts.join(", ") : "none";
}

/** Rows trade within these: the pieces the tree suits, and in `shuffle` whether it has a bad half. */
function trade(
  rows: SkillActivationRow[],
  uses: Map<number, TreeUse>,
  mode: Exclude<SkillActivationMode, "off">,
  rng: Rng,
): Map<SkillActivationRow, number[]> {
  const now = new Map(rows.map((r) => [r, r.skills]));
  const onGear = rows.filter((r) => uses.has(r.tree));
  const hasBad = (r: SkillActivationRow) => filled(halfOf(r.skills, BAD));
  if (mode === "shuffle") {
    const moved = permuteWithinGroups(
      onGear,
      (r) => `${uses.get(r.tree)}:${hasBad(r)}`,
      (r) => r.skills,
      rng,
    );
    onGear.forEach((r, i) => now.set(r, moved[i]!));
    return now;
  }
  for (const columns of [GOOD, BAD]) {
    const part = onGear.filter((r) => filled(halfOf(r.skills, columns)));
    const moved = permuteWithinGroups(
      part,
      (r) => uses.get(r.tree)!,
      (r) => halfOf(r.skills, columns),
      rng,
    );
    part.forEach((r, i) => now.set(r, withHalf(now.get(r)!, columns, moved[i]!)));
  }
  return now;
}

export function randomizeSkillActivations(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
  { mode, thresholds }: SkillActivationOptions,
  rngs: { trees: Rng; thresholds: Rng },
  edits: Edits,
): ShuffleReport {
  const rows = readSkillActivations(new BinaryReader(eboot), resolver);
  const { uses, armorOnly } = skillTrees(eboot, resolver);
  const now =
    mode === "off" ? new Map(rows.map((r) => [r, r.skills])) : trade(rows, uses, mode, rngs.trees);

  const keepsColumns = (r: SkillActivationRow) => !uses.has(r.tree) || armorOnly.includes(r.tree);
  if (thresholds) {
    for (const row of rows) {
      if (keepsColumns(row)) continue;
      let skills = now.get(row)!;
      for (const columns of [GOOD, BAD]) {
        const half = halfOf(skills, columns);
        if (filled(half)) skills = withHalf(skills, columns, shiftHalf(half, rngs.thresholds));
      }
      now.set(row, skills);
    }
  }

  const out = edits.eboot();
  const lines: ShuffleReport["lines"] = [];
  for (const row of rows) {
    const skills = now.get(row)!;
    skills.forEach((s, k) => out.writeUInt8(s, row.at + 1 + k));
    if (skills.every((s, k) => s === row.skills[k])) continue;
    lines.push({
      where: "Skill trees",
      text: `${treeName(row.tree)}: ${describe(skills)} (was ${describe(row.skills)})`,
    });
  }

  const unused = rows.filter((r) => !uses.has(r.tree)).map((r) => treeName(r.tree));
  const notes: string[] = [];
  if (mode !== "off") {
    notes.push(
      mode === "shuffle"
        ? "Skill trees traded what they turn on, good and bad skills together, with trees that suit the same pieces (anyone, Blademasters, Gunners, or only pieces both can wear) and that also have bad skills, or also have none."
        : "Skill trees traded their good skills, and apart from those their bad skills, with trees that suit the same pieces (anyone, Blademasters, Gunners, or only pieces both can wear). Trees with no bad skills still have none.",
      "Each skill is still turned on by exactly one tree. In game, the skill's own name shows, under the tree whose points turn it on.",
    );
  }
  if (thresholds) {
    notes.push(
      `Each skill needs 5 points more or fewer than before, from 10 to 20, weakest first. Skill trees no decoration has keep theirs: ${armorOnly.map(treeName).join(", ") || "none"}.`,
    );
  }
  notes.push(
    `Points are compared with ${ACTIVATION_POINTS.join(", ")} for every tree, in code; only what each total gives changed.`,
  );
  if (unused.length > 0) {
    notes.push(
      `No armor or decoration has these trees, so they kept their skills: ${unused.join(", ")}.`,
    );
  }
  notes.push(`${lines.length} of ${rows.length} skill trees turn on something new.`);
  return {
    title: "Skill activations",
    notes,
    lines,
    summary: `Skill activations: ${lines.length} of ${rows.length} trees`,
  };
}
