/**
 * Runs the enabled shuffles on loaded game data. Pure apart from the RNG:
 * the same game, seed and settings always give the same edits and spoiler.
 */
import { Edits } from "./edits.js";
import { readGatheringItems } from "./game/gathering.js";
import type { GameData } from "./game/load.js";
import { coarsen, itemTiers, monsterStars, questTier, type Tier } from "./game/tiers.js";
import { Rng } from "./rng.js";
import { needsEboot, type Settings } from "./settings.js";
import { collectPriceSlots, randomizeCosts } from "./shuffles/costs.js";
import {
  collectMonsterRewardSlots,
  collectRewardLists,
  shuffleMonsterRewards,
} from "./shuffles/monster-rewards.js";
import { collectQuestRewardSlots, shuffleQuestRewards } from "./shuffles/quest-rewards.js";
import { checkRecipes, collectRecipeSlots, randomizeRecipes } from "./shuffles/recipes.js";
import type { ShuffleReport } from "./shuffles/shuffle.js";
import { findShops, locateItemTable, randomizeShops } from "./shuffles/shops.js";
import { tableName } from "./names.js";
import { TABLE_COUNTS } from "../../mhfu-extract/src/tables/offsets.js";
import { shuffleWeapons } from "./shuffles/weapons.js";
import { LOGIC_VERSION } from "./version.js";

export { LOGIC_VERSION };

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

/**
 * The item table for shop prices: required when prices or carry limits
 * change; otherwise used when the EBOOT happens to be loaded, to price items
 * that are never normally sold.
 */
function shopItemTable(game: GameData, required: boolean) {
  if (required) return locateItemTable(game.eboot!, game.resolver);
  if (!game.eboot) return null;
  try {
    return locateItemTable(game.eboot, game.resolver);
  } catch {
    return null;
  }
}

/** Every item with a name and an item record: what "any item" shops can sell. */
function sellableItems(): number[] {
  const out: number[] = [];
  for (let id = 1; id < TABLE_COUNTS.regularItems + TABLE_COUNTS.decorations; id++) {
    if (tableName("ItemID", id) !== null) out.push(id);
  }
  return out;
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
  const edits = new Edits(game);
  const reports: ShuffleReport[] = [];
  const mode = settings["logic.tiers"];
  // Shuffles group by these tiers; the spoiler's item list keeps the real ones.
  const grouped = <T extends { tier: Tier }>(slots: T[]): T[] =>
    slots.map((s) => ({ ...s, tier: coarsen(s.tier, mode) }));

  const questSlots = collectQuestRewardSlots(game.quests);
  const monsterSlots = collectMonsterRewardSlots(
    collectRewardLists(game.gameSub.ovl),
    monsterStars(game.quests.map((q) => q.parsed)),
  );
  const gathering = gatheringSources(game);
  const realTiers = itemTiers([...questSlots, ...monsterSlots, ...gathering.sources]);
  const gatheringGrouped = grouped(gathering.sources);

  let questAfter: { itemId: number; tier: Tier }[] = grouped(questSlots);
  if (settings["questRewards.enabled"]) {
    const result = shuffleQuestRewards(grouped(questSlots), rng.fork("quest-rewards"), edits);
    reports.push(result.report);
    questAfter = result.after;
  }

  let monsterAfter: { itemId: number; tier: Tier }[] = grouped(monsterSlots);
  if (settings["monsterRewards.enabled"]) {
    const withCaptures = settings["monsterRewards.captureAndBreaks"];
    const shuffled = grouped(monsterSlots.filter((s) => withCaptures || s.list.stride === 4));
    const kept = grouped(monsterSlots.filter((s) => !withCaptures && s.list.stride !== 4));
    const result = shuffleMonsterRewards(
      shuffled,
      rng.fork("monster-rewards"),
      edits,
      game.gameSub,
    );
    reports.push(result.report);
    monsterAfter = [...result.after, ...kept];
  }

  const problems: string[] = [];
  if (needsEboot(settings) && !game.eboot) {
    throw new Error("These settings need the decrypted EBOOT");
  }

  // Weapons first: it moves upgrade materials between entries, and the
  // recipe shuffles then work on the tables as it left them.
  if (settings["weapons.enabled"]) {
    reports.push(
      shuffleWeapons(
        game.eboot!,
        game.resolver,
        settings["weapons.mix"],
        rng.fork("weapons"),
        edits,
      ),
    );
  }

  if (settings["recipes.materials"] || settings["recipes.amounts"]) {
    const vanillaTiers = itemTiers([
      ...grouped(questSlots),
      ...grouped(monsterSlots),
      ...gatheringGrouped,
    ]);
    const result = randomizeRecipes(
      collectRecipeSlots(edits.eboot(), game.resolver),
      vanillaTiers,
      {
        materials: settings["recipes.materials"],
        amountSpread: settings["recipes.amounts"] ? settings["recipes.amountSpread"] : null,
        maxQuantity: settings["recipes.maxQuantity"],
      },
      { materials: rng.fork("recipes"), amounts: rng.fork("recipe-amounts") },
      edits,
    );
    reports.push(result.report);
    const tiersAfter = itemTiers([...questAfter, ...monsterAfter, ...gatheringGrouped]);
    for (const p of checkRecipes(result.assigned, tiersAfter)) {
      problems.push(`${p.recipe}: ${p.item} (${p.needs})`);
    }
  }

  if (settings["shops.enabled"]) {
    const prices = settings["shops.prices"];
    const stacks = settings["shops.stacks"];
    reports.push(
      randomizeShops(
        findShops(game.lobbyTask.ovl),
        {
          pool: settings["shops.pool"],
          mix: settings["shops.mix"],
          keepEssentials: settings["shops.keepEssentials"],
          special: settings["shops.special"],
          countSpread: settings["shops.countSpread"],
          priceSpread: prices ? settings["shops.priceSpread"] : null,
          stackSpread: stacks ? settings["shops.stackSpread"] : null,
        },
        {
          bands: new Map([...realTiers].map(([item, tier]) => [item, tier.band])),
          allItems: sellableItems(),
          items: shopItemTable(game, prices || stacks),
        },
        {
          stock: rng.fork("shops"),
          prices: rng.fork("shop-prices"),
          stacks: rng.fork("shop-stacks"),
        },
        edits,
        game.lobbyTask,
      ),
    );
  }

  if (settings["costs.enabled"]) {
    reports.push(
      randomizeCosts(
        collectPriceSlots(game.eboot!, game.resolver),
        settings["costs.spread"],
        rng.fork("costs"),
        edits,
      ),
    );
  }

  return {
    edits,
    reports,
    sources: {
      tiers: realTiers,
      gatheringQuests: gathering.quests,
      gatheringProblems: gathering.problems,
    },
    problems,
  };
}
