/**
 * Runs the enabled shuffles on loaded game data. Pure apart from the RNG:
 * the same game, seed and settings always give the same edits and spoiler.
 */
import { Edits } from "./edits.js";
import { readGatheringItems } from "./game/gathering.js";
import type { GameData } from "./game/load.js";
import { itemTiers, monsterStars, questTier, type Tier } from "./game/tiers.js";
import { Rng } from "./rng.js";
import { collectPriceSlots, randomizeCosts } from "./shuffles/costs.js";
import {
  collectMonsterRewardSlots,
  collectRewardLists,
  shuffleMonsterRewards,
} from "./shuffles/monster-rewards.js";
import { collectQuestRewardSlots, shuffleQuestRewards } from "./shuffles/quest-rewards.js";
import { checkRecipes, collectRecipeSlots, randomizeRecipes } from "./shuffles/recipes.js";
import type { ShuffleReport } from "./shuffles/shuffle.js";

export const SHUFFLES = [
  "quest-rewards",
  "monster-rewards",
  "recipes",
  "recipe-amounts",
  "costs",
] as const;
export type ShuffleName = (typeof SHUFFLES)[number];

/** The EBOOT shuffles need the decrypted EBOOT, so they're opt-in. */
export const DEFAULT_SHUFFLES: readonly ShuffleName[] = ["quest-rewards", "monster-rewards"];
export const EBOOT_SHUFFLES: readonly ShuffleName[] = ["recipes", "recipe-amounts", "costs"];

export interface Settings {
  seed: string;
  shuffles: readonly ShuffleName[];
  /** `recipe-amounts`: quantities vary by up to this fraction. */
  amountSpread: number;
  /** `costs`: prices vary by up to this fraction. */
  costSpread: number;
}

export const DEFAULT_SPREAD = 0.5;

export interface SourceSummary {
  /** Each item's earliest tier in the unshuffled game, from rewards and gathering. */
  tiers: Map<number, Tier>;
  gatheringQuests: number;
  gatheringProblems: string[];
}

export interface RandomizeResult {
  edits: Edits;
  reports: ShuffleReport[];
  sources: SourceSummary;
  /** Recipe materials that can't be found at their old tier any more. Should be empty. */
  problems: string[];
}

/** Version of the randomization logic, in the spoiler log. Bump when a seed's output changes. */
export const LOGIC_VERSION = 3;

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

export function parseSpread(value: string, flag: string): number {
  const spread = Number(value);
  if (!Number.isFinite(spread) || spread < 0 || spread >= 1) {
    throw new Error(`--${flag} must be a number from 0 up to (not including) 1, e.g. 0.5`);
  }
  return spread;
}

/** Items from gathering points in quests the player can take. Never shuffled. */
function gatheringSources(game: GameData): {
  sources: { itemId: number; tier: Tier }[];
  quests: number;
  problems: string[];
} {
  const sources: { itemId: number; tier: Tier }[] = [];
  const problems: string[] = [];
  let quests = 0;
  for (const quest of game.quests) {
    const tier = questTier(quest.parsed);
    if (!tier) continue;
    const result = readGatheringItems(quest.file.payload, quest.parsed);
    if (result.problem) problems.push(`${quest.path}: ${result.problem}`);
    if (result.items.length > 0) quests++;
    for (const itemId of result.items) sources.push({ itemId, tier });
  }
  return { sources, quests, problems };
}

export function randomize(game: GameData, settings: Settings): RandomizeResult {
  const rng = new Rng(`randomfu/${LOGIC_VERSION}/${settings.seed}`);
  const enabled = new Set(settings.shuffles);
  const edits = new Edits(game);
  const reports: ShuffleReport[] = [];

  const questSlots = collectQuestRewardSlots(game.quests);
  const monsterSlots = collectMonsterRewardSlots(
    collectRewardLists(game.gameSub.ovl),
    monsterStars(game.quests.map((q) => q.parsed)),
  );
  const gathering = gatheringSources(game);
  const tiers = itemTiers([...questSlots, ...monsterSlots, ...gathering.sources]);

  let questAfter: { itemId: number; tier: Tier }[] = questSlots;
  if (enabled.has("quest-rewards")) {
    const result = shuffleQuestRewards(questSlots, rng.fork("quest-rewards"), edits);
    reports.push(result.report);
    questAfter = result.after;
  }

  let monsterAfter: { itemId: number; tier: Tier }[] = monsterSlots;
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
  const needsEboot = EBOOT_SHUFFLES.some((s) => enabled.has(s));
  if (needsEboot && !game.eboot) throw new Error("This shuffle needs the decrypted EBOOT");

  if (enabled.has("recipes") || enabled.has("recipe-amounts")) {
    const result = randomizeRecipes(
      collectRecipeSlots(game.eboot!, game.resolver),
      tiers,
      {
        materials: enabled.has("recipes"),
        amountSpread: enabled.has("recipe-amounts") ? settings.amountSpread : null,
      },
      { materials: rng.fork("recipes"), amounts: rng.fork("recipe-amounts") },
      edits,
    );
    reports.push(result.report);
    const tiersAfter = itemTiers([...questAfter, ...monsterAfter, ...gathering.sources]);
    for (const p of checkRecipes(result.assigned, tiersAfter)) {
      problems.push(`${p.recipe}: ${p.item} (${p.needs})`);
    }
  }

  if (enabled.has("costs")) {
    reports.push(
      randomizeCosts(
        collectPriceSlots(game.eboot!, game.resolver),
        settings.costSpread,
        rng.fork("costs"),
        edits,
      ),
    );
  }

  return {
    edits,
    reports,
    sources: {
      tiers,
      gatheringQuests: gathering.quests,
      gatheringProblems: gathering.problems,
    },
    problems,
  };
}
