/**
 * Runs the enabled shuffles on loaded game data. Pure apart from the RNG:
 * the same game, seed and settings always give the same edits and spoiler.
 */
import { Edits } from "./edits.js";
import { itemBands, reachableMonsters, type Band } from "./game/bands.js";
import type { GameData } from "./game/load.js";
import { Rng } from "./rng.js";
import {
  collectMonsterRewardSlots,
  collectRewardLists,
  shuffleMonsterRewards,
} from "./shuffles/monster-rewards.js";
import { collectQuestRewardSlots, shuffleQuestRewards } from "./shuffles/quest-rewards.js";
import { checkRecipes, collectRecipeSlots, shuffleRecipes } from "./shuffles/recipes.js";
import type { ShuffleReport } from "./shuffles/shuffle.js";

export const SHUFFLES = ["quest-rewards", "monster-rewards", "recipes"] as const;
export type ShuffleName = (typeof SHUFFLES)[number];

/** Recipes need the decrypted EBOOT, so they're opt-in. */
export const DEFAULT_SHUFFLES: readonly ShuffleName[] = ["quest-rewards", "monster-rewards"];

export interface Settings {
  seed: string;
  shuffles: readonly ShuffleName[];
}

export interface RandomizeResult {
  edits: Edits;
  reports: ShuffleReport[];
  /** Recipe materials that can't be found at their old rank any more. Should be empty. */
  problems: string[];
}

/** Version of the randomization logic, in the spoiler log. Bump when a seed's output changes. */
export const LOGIC_VERSION = 1;

export function parseShuffles(value: string): ShuffleName[] {
  const names = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const name of names) {
    if (!(SHUFFLES as readonly string[]).includes(name)) {
      throw new Error(`Unknown shuffle "${name}" (expected ${SHUFFLES.join(", ")})`);
    }
  }
  return names as ShuffleName[];
}

export function randomize(game: GameData, settings: Settings): RandomizeResult {
  const rng = new Rng(`randomfu/${LOGIC_VERSION}/${settings.seed}`);
  const enabled = new Set(settings.shuffles);
  const edits = new Edits(game);
  const reports: ShuffleReport[] = [];

  const questSlots = collectQuestRewardSlots(game.quests);
  const monsterSlots = collectMonsterRewardSlots(
    collectRewardLists(game.gameSub.ovl),
    reachableMonsters(game.quests.map((q) => q.parsed)),
  );
  const vanillaSources = [...questSlots, ...monsterSlots];

  let questAfter: { itemId: number; band: Band }[] = questSlots;
  if (enabled.has("quest-rewards")) {
    const result = shuffleQuestRewards(questSlots, rng.fork("quest-rewards"), edits);
    reports.push(result.report);
    questAfter = result.after;
  }

  let monsterAfter: { itemId: number; band: Band }[] = monsterSlots;
  if (enabled.has("monster-rewards")) {
    const result = shuffleMonsterRewards(
      monsterSlots,
      rng.fork("monster-rewards"),
      edits,
      game.gameSub,
    );
    reports.push(result.report);
    monsterAfter = result.after;
  }

  const problems: string[] = [];
  if (enabled.has("recipes")) {
    if (!game.eboot) throw new Error("Shuffling recipes needs the decrypted EBOOT");
    const result = shuffleRecipes(
      collectRecipeSlots(game.eboot, game.resolver),
      itemBands(vanillaSources),
      rng.fork("recipes"),
      edits,
    );
    reports.push(result.report);
    for (const p of checkRecipes(result.assigned, itemBands([...questAfter, ...monsterAfter]))) {
      problems.push(`${p.recipe}: ${p.item} (${p.needs})`);
    }
  }

  return { edits, reports, problems };
}
