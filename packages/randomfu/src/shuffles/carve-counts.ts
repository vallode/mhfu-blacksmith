/**
 * How many times a monster can be carved: a body count and a tail count,
 * two bytes in each monster's `bodytailshiny` entry in `game_sub.ovl`
 * (mhfu-extract's `monsters/rewards.ts`). They are separate from the item
 * lists, which `monster-rewards.ts` changes.
 *
 * A zero count means no tail, or a carve done another way (the elder
 * dragons' body carves, live carving), so zeros are never touched and no
 * monster gains or loses a carve kind.
 *
 * Shuffle moves counts between the monsters that have one of that kind.
 * Randomize rolls each count from 1 to the largest allowed.
 */
import {
  locateRewardTables,
  readCarveCounts,
  type CarveCounts,
} from "mhfu-extract/src/monsters/rewards.js";
import type { OvlFile } from "mhfu-extract/src/container/ovl.js";
import type { Edits } from "whetstone/src/edits.js";
import type { LoadedOverlay } from "whetstone/src/game/load.js";
import type { MonsterNames } from "whetstone/src/names.js";
import type { Rng } from "../rng.js";
import type { Report } from "whetstone/src/report.js";

type Kind = "body" | "tail";
const KINDS: readonly Kind[] = ["body", "tail"];
const KIND_OFFSET: Record<Kind, number> = { body: 0, tail: 1 };

/** Every monster's carve counts. */
export function collectCarveCounts(ovl: OvlFile): CarveCounts[] {
  const location = locateRewardTables(ovl);
  if (!location) throw new Error("game_sub.ovl: carve tables not found");
  return readCarveCounts(ovl, location.carves);
}

export const MAX_CARVE_COUNT = 9;

export function changeCarveCounts(
  counts: readonly CarveCounts[],
  options: { mode: "shuffle" | "randomize"; max: number },
  rng: Rng,
  edits: Edits,
  gameSub: LoadedOverlay,
  /** Names monsters in the report (`names.ts` `monsterNames`). */
  monsterName: MonsterNames,
): Report {
  const buf = edits.overlay(gameSub);
  const lines: { where: string; text: string }[] = [];
  for (const kind of KINDS) {
    const has = counts.filter((c) => c[kind] > 0);
    const values = has.map((c) => c[kind]);
    if (options.mode === "shuffle") {
      for (let i = values.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [values[i], values[j]] = [values[j]!, values[i]!];
      }
    } else {
      values.forEach((_, i) => (values[i] = 1 + rng.int(options.max)));
    }
    has.forEach((c, i) => {
      const value = values[i]!;
      buf.writeUInt8(value, c.offset + KIND_OFFSET[kind]);
      lines.push({
        where: `${monsterName(c.emId)} ${kind} carve`,
        text: `x${value} (was x${c[kind]})`,
      });
    });
  }
  return {
    title: "Carve counts",
    notes: [
      options.mode === "shuffle"
        ? "Body and tail carve counts move between the monsters that have one."
        : `Every body and tail carve count is rolled from 1 to ${options.max}.`,
      "Monsters with no tail, and carves done another way (elder dragons, live carving), are unchanged.",
    ],
    lines,
  };
}
