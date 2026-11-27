/**
 * Monster AI reroll (`monsterAi.branches`): new weights for every weighted
 * choice in the AI scripts. Whetstone's `patches/monster-ai.ts` reads the
 * scripts and leans them for aggression and reach, after this.
 */
import type { Edits } from "whetstone/src/edits.js";
import type { MonsterNames } from "whetstone/src/names.js";
import { rerollWeights, type readScripts } from "whetstone/src/patches/monster-ai.js";
import type { Report } from "whetstone/src/report.js";
import type { Rng } from "../rng.js";

export function randomizeMonsterAi(
  spread: number,
  rng: Rng,
  edits: Edits,
  scripts: ReturnType<typeof readScripts>,
  monsterName: MonsterNames,
): Report {
  const factor = () => 1 - spread + 2 * spread * rng.float();
  const { files, unknown } = scripts;
  const lines: Report["lines"] = [];
  let total = 0;
  for (const { file, name, choices, emIds } of files) {
    if (!choices.length) continue;
    const buf = edits.overlay(file);
    for (const c of choices) {
      const next = rerollWeights(c.weights, factor);
      c.weightAt.forEach((at, k) => buf.writeUInt8(next[k]!, at));
    }
    total += choices.length;
    lines.push({
      where: name,
      text: `${choices.length} choices, for ${emIds.map(monsterName).join(", ")}`,
    });
  }
  const notes = [
    "Each weighted choice in the AI scripts has new weights; species that share scripts change together.",
  ];
  if (unknown.length) {
    notes.push(
      `Left alone, their scripts' overlay unknown: ${unknown.map(monsterName).join(", ")}.`,
    );
  }
  return {
    title: "Monster behaviour",
    notes,
    lines,
    summary: `Monster behaviour: ${total} choices`,
  };
}
