/**
 * Runs the enabled shuffles on loaded game data. Pure apart from the RNG:
 * the same game, seed and settings always give the same edits and spoiler.
 */
import { Edits } from "./edits.js";
import { loadEmOverlays, type GameData, type LoadedQuest } from "./game/load.js";
import {
  itemTiers,
  monsterStars,
  questTier,
  type Band,
  type Tier,
  type TierMode,
} from "./game/tiers.js";
import { Rng } from "./rng.js";
import type { Settings } from "./settings.js";
import { drawStarterArmor, pieceName, readArmorPieces, shuffleArmor } from "./shuffles/armor.js";
import { randomizeArmorSkills } from "./shuffles/armor-skills.js";
import { ARMOR_STATS, randomizeArmorStats } from "./shuffles/armor-stats.js";
import { collectPriceSlots, randomizeCosts } from "./shuffles/costs.js";
import {
  deliveryTargets,
  isNeverDrawn,
  isQuestItem,
  readSupplySlots,
} from "./game/quest-fields.js";
import { changeCarveCounts, collectCarveCounts } from "./shuffles/carve-counts.js";
import { collectDeliveries, shuffleDeliveries } from "./shuffles/deliveries.js";
import { randomizeGoals } from "./shuffles/quest-goals.js";
import {
  collectGatheringSlots,
  randomizeGathering,
  randomizeGatherCounts,
  shuffleGathering,
} from "./shuffles/gathering.js";
import {
  carvesOf,
  collectMonsterRewardSlots,
  collectRewardLists,
  randomizeMonsterRewards,
  isDeliveryCarve,
  shuffleMonsterRewards,
  type DeliveryCarve,
  type RewardList,
} from "./shuffles/monster-rewards.js";
import {
  collectQuestRewardSlots,
  randomizeQuestRewards,
  randomizeRewardDraws,
  shuffleQuestRewards,
} from "./shuffles/quest-rewards.js";
import { checkRecipes, collectRecipeSlots, randomizeRecipes } from "./shuffles/recipes.js";
import type { ShuffleReport } from "./shuffles/shuffle.js";
import { findShops } from "mhfu-extract/src/shops/shops.js";
import {
  itemsOnSale,
  locateItemTable,
  randomizeShopPrices,
  randomizeShops,
} from "./shuffles/shops.js";
import { itemName, monsterNames, questLabel, tableName } from "./names.js";
import { TABLE_COUNTS } from "mhfu-extract/src/tables/offsets.js";
import { collectSupplyRuns, randomizeSupplies, shuffleSupplies } from "./shuffles/supplies.js";
import { collectTermsSlots, randomizeTerms } from "./shuffles/terms.js";
import { findSmithyStore, findStarterBox, gearReport } from "./shuffles/store.js";
import { shuffleWeapons } from "./shuffles/weapons.js";
import { collectTradeSlots, randomizeTrades, shuffleTrades } from "./shuffles/veggie-trades.js";
import { collectWeaponStats, randomizeWeaponStats } from "./shuffles/weapon-stats.js";
import { randomizeSharpness } from "./shuffles/sharpness.js";
import {
  collectQuestMonsters,
  collectStartPoints,
  hpLimit,
  MAX_HP,
  multiplierSets,
  randomizeDifficulty,
  randomizeCrownSpread,
  randomizeQuestSize,
  randomizeSmallCounts,
  swapSpecies,
  type HpMultiplierOf,
} from "./shuffles/quest-monsters.js";
import { locateMultiplierTables, multiplierRow } from "mhfu-extract/src/monsters/multipliers.js";
import { renameQuestText } from "./shuffles/quest-text.js";
import {
  collectDocQuests,
  moveQuests,
  randomizeStarts,
  updateBoardMaps,
  type DocQuest,
} from "./shuffles/quest-maps.js";
import { swapSmallSpecies } from "./shuffles/small-monsters.js";
import { largestQuest, questPayload, rebuildQuest } from "./game/rebuild.js";
import { itemSources, lostSources } from "./game/first-tiers.js";
import {
  baseHpOf,
  collectMonsterChunks,
  randomizeMonsterStats,
  shuffleWeaknesses,
} from "./shuffles/monster-stats.js";
import { makeMonstersAggressive, randomizeMonsterAi, readScripts } from "./shuffles/monster-ai.js";
import { writeGuides } from "./hints/guides.js";
import { DEMO_OBJECTS } from "./blob/demo-object.js";
import { decodeObjects } from "./blob/link.js";
import { addCodeLoader } from "./patches/code-loader.js";
import { findKeyQuestSites, keyQuestsObjects, keyQuestsReport } from "./patches/key-quests.js";
import { addNodeMap } from "./patches/node-map.js";
import { findHitboxExterns, hitboxObjects } from "./patches/hitboxes.js";
import { findMonsterHpExterns, monsterHpObjects } from "./patches/monster-hp.js";
import {
  ARMOR_BOX_TYPE,
  MELEE_BOX_TYPE,
  RANGED_BOX_TYPE,
  encodePactPool,
  findPactExterns,
  pactObjects,
  pactPool,
  readItemValues,
} from "./patches/pact.js";
import { eliteObjects, findEliteExterns } from "./patches/elite.js";
import { RUNTIME_OBJECTS } from "./blob/runtime-object.js";
import { prepareUnknownQuests, unknownQuestsObjects } from "./patches/unknown-quests.js";
import {
  findHitSite,
  findHookSites,
  findPadSites,
  type HitSite,
  type MenuSites,
} from "./patches/game-hooks.js";
import { menuObjects, prepareMenu } from "./patches/menu.js";
import { poogieObjects, preparePoogieLuck } from "./patches/poogie-luck.js";
import { damageObjects, findDamageExterns } from "./patches/damage.js";
import { patchElementMotion } from "./patches/element-motion.js";
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
  /** Testing options that changed this disc, for the log and spoiler (not in the settings string). */
  testing: string[];
}

/**
 * The item table for shop prices: required when prices or carry limits
 * change; otherwise used when it's found, to price items that are never
 * normally sold.
 */
function shopItemTable(game: GameData, required: boolean) {
  if (required) return locateItemTable(game.eboot, game.resolver);
  try {
    return locateItemTable(game.eboot, game.resolver);
  } catch {
    return null;
  }
}

/**
 * Every item with a name and an item record, but the ones no pool draws
 * (`isNeverDrawn`: quest items, placeholders, junk, the guides): what the
 * any-item pools (shops, gathering, rewards, supplies, trades) draw from.
 */
function sellableItems(): number[] {
  const out: number[] = [];
  for (let id = 1; id < TABLE_COUNTS.regularItems + TABLE_COUNTS.decorations; id++) {
    if (tableName("ItemID", id) !== null && !isNeverDrawn(id)) out.push(id);
  }
  return out;
}

/** The amounts quests give of each item, in supply boxes and rewards. */
function observedAmounts(
  game: GameData,
  rewards: readonly { itemId: number; amount: number }[],
): (itemId: number) => readonly number[] {
  const out = new Map<number, number[]>();
  const add = (entries: Iterable<{ itemId: number; amount: number }>) => {
    for (const { itemId, amount } of entries) {
      if (amount < 1) continue;
      const list = out.get(itemId);
      if (list) list.push(amount);
      else out.set(itemId, [amount]);
    }
  };
  add(game.quests.flatMap((q) => readSupplySlots(q.file.payload)));
  add(rewards);
  return (itemId) => out.get(itemId) ?? [];
}

export interface RandomizeOptions {
  /** For testing in game: a happy Poogie always gives the rarest reward. */
  poogieTest?: boolean;
  /** Prototype: the code loader with its demo blob (see `docs/code-loader.md`). */
  loaderDemo?: boolean;
  /** Adds research detail to the spoiler log. */
  debug?: boolean;
}

/**
 * How strictly rebuilding quests keeps where items are first found: as
 * strictly as the recipe materials need, star level unless they reach wider.
 */
function keepTiers(settings: Settings): TierMode {
  if (settings["recipes.mode"] === "off") return "star";
  const scope = settings["recipes.scope"];
  return scope === "star" ? "star" : scope === "any" ? "none" : "rank";
}

/**
 * The shuffles that rebuild quests: map moves, monster starts and small
 * monster species, on quest documents. Returns the quests with every
 * rebuilt one in place of its original, for every later shuffle to work on,
 * and items found later than before that no quest could be blamed for.
 *
 * A quest whose changes took away an item's earliest source (`first-tiers.ts`)
 * is put back as on the disc, so items are first found where they were.
 */
function reshapeQuests(
  game: GameData,
  settings: Settings,
  lists: readonly RewardList[],
  rng: Rng,
  edits: Edits,
  reports: ShuffleReport[],
): { quests: LoadedQuest[]; lost: number[] } {
  const maps = settings["questMaps.enabled"];
  const starts = settings["questMaps.starts"];
  const small = settings["questMonsters.smallSpecies"];
  if (!maps && !starts && !small) return { quests: game.quests, lost: [] };

  const monsterName = monsterNames(game);
  const maxLength = largestQuest(game.quests);
  const { list, locked } = collectDocQuests(game.quests);
  const before = new Map(list.map((e) => [e, e.doc]));
  const own: ShuffleReport[] = [];
  let moved = new Set<DocQuest>();
  let mapReport: ShuffleReport | null = null;
  if (maps) {
    const result = moveQuests(
      list,
      settings["questMaps.pool"],
      rng.fork("quest-maps"),
      (entry, doc) => questPayload(entry.quest, doc, maxLength) !== null,
      monsterName,
    );
    moved = result.moved;
    mapReport = result.report;
    own.push(result.report);
  }
  if (starts) own.push(randomizeStarts(list, moved, rng.fork("monster-starts"), monsterName));
  if (small) own.push(swapSmallSpecies(list, rng.fork("small-species"), monsterName));

  const rebuilt = new Map<number, { entry: DocQuest; quest: LoadedQuest }>();
  for (const entry of list) {
    if (entry.doc === before.get(entry)) continue;
    const quest = rebuildQuest(entry.quest, entry.doc, maxLength);
    // Starts and species swaps keep a quest's size, and moves were checked to fit.
    if (!quest) throw new Error(`${entry.quest.path} no longer fits its sectors`);
    rebuilt.set(quest.index, { entry, quest });
  }

  const sources = itemSources(game.quests, lists);
  const putBack: DocQuest[] = [];
  let lost: number[] = [];
  for (;;) {
    const now = game.quests.map((q) => rebuilt.get(q.index)?.quest ?? q);
    const check = lostSources(
      game.quests,
      sources,
      itemSources(now, lists),
      new Set(rebuilt.keys()),
      lists,
      keepTiers(settings),
    );
    lost = check.lost;
    if (check.blame.size === 0) break;
    for (const index of check.blame) {
      putBack.push(rebuilt.get(index)!.entry);
      rebuilt.delete(index);
    }
  }
  for (const entry of putBack) moved.delete(entry);
  // Each report loses the quests put back, then counts the ones left.
  const putBackLabels = new Set(putBack.map((e) => questLabel(e.quest)));
  for (const report of own) {
    const back = new Set(report.lines.map((l) => l.where).filter((w) => putBackLabels.has(w)));
    report.lines = report.lines.filter((l) => !back.has(l.where));
    const count = new Set(report.lines.map((l) => l.where)).size;
    report.notes.push(`${count} quests ${report === mapReport ? "moved" : "changed"}.`);
    if (back.size > 0) {
      report.notes.push(
        `${back.size} quests were put back as on the disc: their changes took away where an item is first found (${[...back].join(", ")}).`,
      );
    }
    if (locked.length > 0) {
      report.notes.push(
        `${locked.length} quests can't be rebuilt and were left alone: ${locked.join(", ")}.`,
      );
    }
  }
  reports.push(...own);

  for (const { quest } of rebuilt.values()) edits.quest(quest);
  updateBoardMaps(moved, game.boards, edits);
  return { quests: game.quests.map((q) => rebuilt.get(q.index)?.quest ?? q), lost };
}

export function randomize(
  input: GameData,
  settings: Settings,
  options: RandomizeOptions = {},
): RandomizeResult {
  const monsterName = monsterNames(input);
  const rng = new Rng(`randomfu/${LOGIC_VERSION}/${settings.seed}`);
  const edits = new Edits(input);
  const reports: ShuffleReport[] = [];
  const problems: string[] = [];
  const rewardLists = collectRewardLists(input.gameSub.ovl);
  // Map moves first: every other shuffle works on the quests as they'll be.
  const reshaped = reshapeQuests(input, settings, rewardLists, rng, edits, reports);
  for (const item of reshaped.lost)
    problems.push(`${itemName(item)}: found later after quest changes`);
  const game: GameData = { ...input, quests: reshaped.quests };

  // Monster swaps first: carves are found where their monsters now are.
  const questMonsters = collectQuestMonsters(game.quests);
  const setOf = multiplierSets(game.gameTask.ovl);
  const multipliers = locateMultiplierTables(game.gameTask.ovl);
  const hpOf: HpMultiplierOf = (set, table, power) =>
    multipliers ? (multiplierRow(multipliers, set, table, power)?.hp ?? null) : null;
  /** Whether a monster's HP at a level stays within the s16 it's kept in, given its base HP. */
  const hpFits =
    (baseHp: (emId: number) => number) => (emId: number, table: number, power: number) => {
      const hp = hpOf(setOf(emId), table, power);
      return hp === null || Math.trunc(baseHp(emId) * hp) <= MAX_HP;
    };
  const fitsHp = hpFits(baseHpOf(game.gameTask.ovl));
  // A delivery quest's item, from the quests as they are before any shuffle.
  const deliveries = deliveryTargets(game.quests);
  /** Whether a monster's carves give an item at a rank, on the disc. */
  const carves = (emId: number, band: Band, itemId: number) =>
    rewardLists.some((l) => carvesOf(l, emId, band) && l.entries.some((e) => e.itemId === itemId));
  let questsAfter = game.quests.map((q) => q.parsed);
  if (settings["questMonsters.mode"] !== "off") {
    const result = swapSpecies(
      questMonsters,
      settings["questMonsters.mode"] === "shuffle" ? "variants" : settings["questMonsters.scope"],
      rng.fork("monster-species"),
      edits,
      game.quests,
      setOf,
      collectStartPoints(game.quests),
      monsterName,
      game.boards,
      fitsHp,
    );
    reports.push(result.report);
    questsAfter = result.questsAfter;
    if (settings["questMonsters.text"]) {
      reports.push(
        renameQuestText(result.swaps, game.quests, edits, monsterName, game.boards, options.debug),
      );
    }
  }
  // Goals after every shuffle that changes a quest's monsters, before small
  // monster counts (which keep as many as a slay goal needs).
  if (settings["questGoals.enabled"]) {
    reports.push(
      randomizeGoals(
        game.quests,
        input.quests,
        {
          capture: settings["questGoals.capture"],
          small: settings["questGoals.smallMonsters"],
        },
        rng.fork("quest-goals"),
        edits,
        monsterName,
        game.boards,
      ),
    );
  }
  if (settings["questMonsters.difficulty"]) {
    reports.push(
      randomizeDifficulty(
        questMonsters,
        {
          spread: settings["questMonsters.difficultySpread"],
          range: settings["questMonsters.difficultyRange"],
        },
        rng.fork("monster-difficulty"),
        edits,
        setOf,
        monsterName,
        fitsHp,
      ),
    );
  }
  if (settings["questMonsters.size"]) {
    reports.push(
      randomizeQuestSize(
        questMonsters,
        settings["questMonsters.sizeSpread"],
        rng.fork("quest-size"),
        edits,
      ),
    );
  }
  if (settings["questMonsters.crowns"]) {
    reports.push(
      randomizeCrownSpread(
        questMonsters,
        settings["questMonsters.crownSpread"],
        rng.fork("crown-spread"),
        edits,
      ),
    );
  }
  if (settings["questMonsters.smallCounts"]) {
    reports.push(
      randomizeSmallCounts(
        questMonsters,
        settings["questMonsters.smallCountSpread"],
        rng.fork("small-monster-counts"),
        edits,
        monsterName,
        // A delivery carved from a small monster (Popo Tongues) keeps as many of it.
        (quest, emId) => {
          const item = deliveries.get(quest.index)?.itemId;
          const band = questTier(quest.parsed)?.band;
          return item !== undefined && band !== undefined && carves(emId, band, item);
        },
      ),
    );
  }

  const stats = {
    hpSpread: settings["monsterStats.hp"] ? settings["monsterStats.hpSpread"] : null,
    sizeSpread: settings["monsterStats.size"] ? settings["monsterStats.sizeSpread"] : null,
    statusSpread: settings["monsterStats.status"] ? settings["monsterStats.statusSpread"] : null,
  };
  const weaknesses = {
    elements: settings["weaknesses.elements"],
    parts: settings["weaknesses.parts"],
  };
  const statsOn = Object.values(stats).some((v) => v !== null);
  if (statsOn || weaknesses.elements || weaknesses.parts) {
    const chunks = collectMonsterChunks(game.gameTask.ovl, questsAfter);
    if (statsOn) {
      reports.push(
        randomizeMonsterStats(
          chunks,
          stats,
          {
            hp: rng.fork("monster-hp"),
            size: rng.fork("monster-size"),
            status: rng.fork("monster-status"),
          },
          edits,
          game.gameTask,
          monsterName,
          hpLimit(game.quests, edits, setOf, hpOf),
        ),
      );
    }
    if (weaknesses.elements || weaknesses.parts) {
      reports.push(
        shuffleWeaknesses(
          chunks,
          weaknesses,
          { elements: rng.fork("weakness-elements"), parts: rng.fork("weakness-parts") },
          edits,
          game.gameTask,
          monsterName,
        ),
      );
    }
  }
  const aggression = settings["monsterAi.aggression"];
  if (settings["monsterAi.branches"] || aggression !== "off") {
    const scripts = readScripts(game.gameTask, loadEmOverlays(game));
    if (settings["monsterAi.branches"]) {
      reports.push(
        randomizeMonsterAi(
          settings["monsterAi.branchSpread"],
          rng.fork("monster-ai"),
          edits,
          scripts,
          monsterName,
        ),
      );
    }
    // After the reroll, so it leans whatever odds the choices have by then.
    if (aggression !== "off") {
      reports.push(makeMonstersAggressive(aggression, edits, scripts, monsterName));
    }
  }

  const questSlots = collectQuestRewardSlots(game.quests);
  const monsterSlots = collectMonsterRewardSlots(rewardLists, monsterStars(questsAfter));
  const gathering = collectGatheringSlots(game.quests);
  // A delivery quest's own item stays at its gathering points, and on the
  // carves of its monsters (Anteka Antlers, Piscine Livers), so the
  // quest can still be finished whether or not its target changes.
  const isDeliveryItem = (s: (typeof gathering.slots)[number]) =>
    deliveries.get(s.quest.index)?.itemId === s.itemId;
  const realTiers = itemTiers([...questSlots, ...monsterSlots, ...gathering.slots]);

  let questAfter: { itemId: number; tier: Tier }[] = questSlots;
  const rewardMode = settings["questRewards.mode"];
  if (rewardMode !== "off") {
    const scope = settings["questRewards.scope"];
    const result =
      rewardMode === "shuffle"
        ? shuffleQuestRewards(questSlots, scope, rng.fork("quest-rewards"), edits)
        : randomizeQuestRewards(
            questSlots,
            {
              scope,
              slotSpread: settings["questRewards.slots"],
              chances: settings["questRewards.chances"],
              keepItems: settings["questRewards.keepItems"],
            },
            {
              tiers: realTiers,
              allItems: sellableItems(),
              amounts: observedAmounts(game, questSlots),
              largestQuest: largestQuest(game.quests),
            },
            rng.fork("quest-rewards"),
            edits,
          );
    reports.push(result.report);
    questAfter = result.after;
  }

  if (settings["questRewards.draws"] > 0) {
    reports.push(
      randomizeRewardDraws(
        game.quests,
        settings["questRewards.draws"],
        rng.fork("reward-draws"),
        edits,
      ),
    );
  }

  let monsterAfter: { itemId: number; tier: Tier }[] = monsterSlots;
  const monsterMode = settings["monsterRewards.mode"];
  if (monsterMode !== "off") {
    const withCaptures = settings["monsterRewards.captureAndBreaks"];
    // A delivery quest's item stays on its monsters' carves at its rank.
    const deliveryCarves: DeliveryCarve[] = [];
    game.quests.forEach((quest, i) => {
      const itemId = deliveries.get(quest.index)?.itemId;
      const band = questTier(quest.parsed)?.band;
      if (itemId === undefined || !band) return;
      const after = questsAfter[i]!;
      const met = [...after.largeMonsters, ...after.smallMonsters.flatMap((t) => t.monsters)].map(
        (m) => m.monsterId,
      );
      for (const emId of new Set(met)) deliveryCarves.push({ emId, band, itemId });
    });
    const pin = (s: (typeof monsterSlots)[number]) => isDeliveryCarve(s, deliveryCarves);
    const changes = (s: (typeof monsterSlots)[number]) =>
      !pin(s) && (withCaptures || s.list.stride === 4);
    const changed = monsterSlots.filter(changes);
    const kept = monsterSlots.filter((s) => !changes(s));
    const pinned = monsterSlots.filter(pin).length;
    const scope = settings["monsterRewards.scope"];
    const result =
      monsterMode === "shuffle"
        ? shuffleMonsterRewards(
            changed,
            scope,
            rng.fork("monster-rewards"),
            edits,
            game.gameSub,
            monsterName,
          )
        : randomizeMonsterRewards(
            changed,
            { scope, chances: settings["monsterRewards.chances"] },
            {
              tiers: realTiers,
              allItems: sellableItems(),
              amounts: observedAmounts(game, questSlots),
            },
            rng.fork("monster-rewards"),
            edits,
            game.gameSub,
            monsterName,
          );
    if (pinned > 0) {
      result.report.notes.push(
        `${pinned} carves stay where they are: they give a delivery quest's item (Popo Tongues, Piscine Livers) on a monster in that quest.`,
      );
    }
    reports.push(result.report);
    monsterAfter = [...result.after, ...kept];
  }

  const carveCountsMode = settings["carveCounts.mode"];
  if (carveCountsMode !== "off")
    reports.push(
      changeCarveCounts(
        collectCarveCounts(game.gameSub.ovl),
        { mode: carveCountsMode, max: settings["carveCounts.max"] },
        rng.fork("carve-counts"),
        edits,
        game.gameSub,
        monsterName,
      ),
    );

  // Gathering points are item sources too: the recipe check below uses them as shuffled.
  let gatheringAfter: { itemId: number; tier: Tier }[] = gathering.slots;
  const gatheringMode = settings["gathering.mode"];
  if (gatheringMode !== "off") {
    const pinned = gathering.slots.filter(isDeliveryItem);
    const changed = gathering.slots.filter((s) => !isDeliveryItem(s));
    const scope = settings["gathering.scope"];
    const result =
      gatheringMode === "shuffle"
        ? shuffleGathering(changed, scope, rng.fork("gathering"), edits)
        : randomizeGathering(
            changed,
            {
              scope,
              chances: settings["gathering.chances"],
              keepItems: settings["gathering.keepItems"],
            },
            { tiers: realTiers, allItems: sellableItems() },
            rng.fork("gathering"),
            edits,
          );
    reports.push(result.report);
    gatheringAfter = [...result.after, ...pinned];
  }

  if (settings["gathering.counts"]) {
    reports.push(
      randomizeGatherCounts(
        game.quests,
        settings["gathering.countSpread"],
        (quest) => deliveries.get(quest.index)?.itemId,
        rng.fork("gather-counts"),
        edits,
      ),
    );
  }

  const suppliesMode = settings["supplies.mode"];
  if (suppliesMode !== "off") {
    const scope = settings["supplies.scope"];
    const keepEssentials = settings["supplies.keepEssentials"];
    const deliveryItem = (quest: LoadedQuest) => deliveries.get(quest.index)?.itemId;
    reports.push(
      suppliesMode === "shuffle"
        ? shuffleSupplies(
            collectSupplyRuns(
              game.quests,
              (quest, itemId) =>
                (keepEssentials && isQuestItem(itemId)) || deliveryItem(quest) === itemId,
            ),
            { scope, keepEssentials },
            { deliveryItem },
            rng.fork("supplies"),
            edits,
          )
        : randomizeSupplies(
            game.quests,
            { scope, slotSpread: settings["supplies.slots"], keepEssentials },
            {
              deliveryItem,
              tiers: realTiers,
              allItems: sellableItems(),
              amounts: observedAmounts(game, questSlots),
            },
            rng.fork("supplies"),
            edits,
          ),
    );
  }

  if (settings["terms.money"] || settings["terms.time"]) {
    reports.push(
      randomizeTerms(
        collectTermsSlots(game.quests),
        {
          moneySpread: settings["terms.money"] ? settings["terms.moneySpread"] : null,
          timeSpread: settings["terms.time"] ? settings["terms.timeSpread"] : null,
        },
        { money: rng.fork("quest-money"), time: rng.fork("time-limits") },
        edits,
        game.boards,
      ),
    );
  }

  // After gathering and supplies: targets come from the points as shuffled,
  // and never from the supply box.
  if (settings["deliveries.enabled"]) {
    reports.push(
      shuffleDeliveries(collectDeliveries(game.quests), rng.fork("deliveries"), edits, game.boards),
    );
  }

  if (settings["trades.mode"] !== "off") {
    const tradeSlots = collectTradeSlots(game.gameTask);
    reports.push(
      settings["trades.mode"] === "shuffle"
        ? shuffleTrades(
            tradeSlots,
            settings["trades.mix"],
            rng.fork("veggie-trades"),
            edits,
            game.gameTask,
          )
        : randomizeTrades(
            tradeSlots,
            { mix: settings["trades.mix"], scope: settings["trades.scope"] },
            {
              bands: new Map([...realTiers].map(([item, tier]) => [item, tier.band])),
              allItems: sellableItems(),
            },
            rng.fork("veggie-trades"),
            edits,
            game.gameTask,
          ),
    );
  }

  // The smithy's store and a new hunter's equipment follow the weapons and
  // armor shuffles: found once, for both.
  const startArmor = settings["armor.start"];
  const followsGear =
    settings["weapons.enabled"] || settings["armor.enabled"] || startArmor !== "smithy";
  const store = followsGear ? findSmithyStore(game.lobbyTask) : null;
  const starter = followsGear ? findStarterBox(game.editTask) : null;
  const gear = [store, starter].filter((list) => list !== null);

  // Weapons first: it moves upgrade materials between entries, and the
  // recipe shuffles then work on the tables as it left them.
  if (settings["weapons.enabled"]) {
    reports.push(
      shuffleWeapons(
        game.eboot,
        game.resolver,
        settings["weapons.mix"],
        rng.fork("weapons"),
        edits,
        gear,
      ),
    );
  }

  // Sharpness and stats are in each weapon's own record, which the weapons
  // shuffle never touches, so they go with the weapon and that order
  // doesn't matter. Sharpness goes first, and the stats are read after it:
  // the affinity they bound is shown with a bonus by sharpness amount.
  if (settings["weapons.sharpness"]) {
    reports.push(
      randomizeSharpness(
        game.eboot,
        game.resolver,
        settings["weapons.sharpnessMode"],
        rng.fork("weapon-sharpness"),
        edits,
      ),
    );
  }
  const weaponSpreads = {
    attack: settings["weapons.attack"] ? settings["weapons.attackSpread"] : null,
    affinity: settings["weapons.affinity"] ? settings["weapons.affinitySpread"] : null,
    element: settings["weapons.element"] ? settings["weapons.elementSpread"] : null,
    slots: settings["weapons.slots"] ? settings["weapons.slotSpread"] : null,
  };
  if (Object.values(weaponSpreads).some((v) => v !== null)) {
    // The resolver is pinned to the vanilla EBOOT, so it reads the edited one too.
    const weapons = collectWeaponStats(edits.eboot(), game.resolver);
    reports.push(
      randomizeWeaponStats(
        weapons,
        {
          ...weaponSpreads,
          elementGain: settings["weapons.elementGain"],
          elementKind: settings["weapons.elementKind"],
          range: settings["weapons.statRange"],
        },
        {
          attack: rng.fork("weapon-attack"),
          affinity: rng.fork("weapon-affinity"),
          element: rng.fork("weapon-element"),
          elementKind: rng.fork("weapon-element-kind"),
          slots: rng.fork("weapon-slots"),
        },
        edits,
      ),
    );
  }

  if (settings["weapons.elementMotion"]) {
    reports.push(
      patchElementMotion(game.gameTask, game.gameSub, settings["weapons.elementMotionFrom"], edits),
    );
  }

  // Armor only changes which piece each create entry makes, so the recipe
  // shuffles' spoiler names the new pieces.
  // A drawn starting set takes its entries out of the box's list first, so
  // the armor shuffle doesn't move them.
  if (starter && startArmor !== "smithy") {
    drawStarterArmor(
      game.eboot,
      game.resolver,
      starter,
      startArmor,
      rng.fork("starting-armor"),
      edits,
    );
  }
  if (settings["armor.enabled"]) {
    reports.push(
      shuffleArmor(
        game.eboot,
        game.resolver,
        settings["armor.scope"],
        rng.fork("armor"),
        edits,
        gear,
      ),
    );
  }
  if (followsGear) {
    if (settings["weapons.enabled"] || settings["armor.enabled"]) {
      reports.push(gearReport("Smithy store", store));
    }
    reports.push(gearReport("Starting equipment", starter));
  }

  // Stats are the pieces' own, in bytes the armor and skill shuffles don't
  // touch. They go before the skill shuffle so its spoiler shows each
  // piece's new rarity.
  if (ARMOR_STATS.some((stat) => settings[`armorStats.${stat}`] !== "off")) {
    reports.push(
      randomizeArmorStats(
        game.eboot,
        game.resolver,
        {
          defense: settings["armorStats.defense"],
          defenseSpread: settings["armorStats.defenseSpread"],
          resistances: settings["armorStats.resistances"],
          resistanceSpread: settings["armorStats.resistanceSpread"],
          slots: settings["armorStats.slots"],
          rarity: settings["armorStats.rarity"],
          raritySpread: settings["armorStats.raritySpread"],
        },
        {
          defense: rng.fork("armor-defense"),
          resistances: rng.fork("armor-resistances"),
          slots: rng.fork("armor-slots"),
          rarity: rng.fork("armor-rarity"),
        },
        edits,
      ),
    );
  }

  // Skills are the pieces' own, so they go with a piece wherever the armor shuffle puts it.
  if (settings["armorSkills.enabled"]) {
    reports.push(
      randomizeArmorSkills(
        game.eboot,
        game.resolver,
        {
          mode: settings["armorSkills.mode"],
          keepArmorOnly: settings["armorSkills.keepArmorOnly"],
        },
        rng.fork("armor-skills"),
        edits,
      ),
    );
  }

  if (settings["recipes.mode"] !== "off" || settings["recipes.amounts"]) {
    const scope = settings["recipes.scope"];
    const result = randomizeRecipes(
      collectRecipeSlots(edits.eboot(), game.resolver),
      realTiers,
      {
        materials: settings["recipes.mode"],
        scope,
        amountSpread: settings["recipes.amounts"] ? settings["recipes.amountSpread"] : null,
        maxQuantity: settings["recipes.maxQuantity"],
      },
      { materials: rng.fork("recipes"), amounts: rng.fork("recipe-amounts") },
      edits,
    );
    reports.push(result.report);
    const tiersAfter = itemTiers([...questAfter, ...monsterAfter, ...gatheringAfter]);
    for (const p of checkRecipes(result.assigned, tiersAfter, scope)) {
      problems.push(`${p.recipe}: ${p.item} (${p.needs})`);
    }
  }

  const prices = settings["shops.prices"];
  const stacks = settings["shops.stacks"];
  const shopsMode = settings["shops.mode"];
  if (shopsMode !== "off" || prices || stacks) {
    const shops = findShops(game.lobbyTask.ovl);
    const items = shopItemTable(game, prices || stacks);
    // Prices are the item's own, so they need no stock shuffle: without
    // one, they go to what the shops sell anyway.
    let sold = itemsOnSale(shops);
    if (shopsMode !== "off") {
      const stock = randomizeShops(
        shops,
        {
          pool: shopsMode === "shuffle" ? "shop" : settings["shops.scope"],
          mix: settings["shops.mix"],
          keepEssentials: settings["shops.keepEssentials"],
          special: settings["shops.special"],
          countSpread: shopsMode === "randomize" ? settings["shops.countSpread"] : 0,
        },
        {
          bands: new Map([...realTiers].map(([item, tier]) => [item, tier.band])),
          allItems: sellableItems(),
          canPrice: items !== null,
        },
        rng.fork("shops"),
        edits,
        game.lobbyTask,
      );
      reports.push(stock.report);
      sold = stock.sold;
    }
    const report = randomizeShopPrices(
      sold,
      {
        priceSpread: prices ? settings["shops.priceSpread"] : null,
        stackSpread: stacks ? settings["shops.stackSpread"] : null,
      },
      items,
      { prices: rng.fork("shop-prices"), stacks: rng.fork("shop-stacks") },
      edits,
    );
    if (report) reports.push(report);
  }

  if (settings["costs.enabled"]) {
    reports.push(
      randomizeCosts(
        collectPriceSlots(game.eboot, game.resolver),
        settings["costs.spread"],
        rng.fork("costs"),
        edits,
      ),
    );
  }

  const testing: string[] = [];
  if (options.loaderDemo) {
    const loader = addCodeLoader(game.eboot, game.gameSub, edits, {
      objects: decodeObjects(DEMO_OBJECTS),
    });
    reports.push(loader);
    if (loader.applied) {
      testing.push(
        `Code loader demo: Guild Cards are capped at ${loader.kept} and every save load adds 1000z. This disc is not for play.`,
      );
    }
    if (settings["poogie.enabled"]) {
      const why = "the loader demo's blob replaces its code";
      reports.push({
        title: "Poogie",
        notes: [`Poogie's luck isn't in this image: ${why}.`],
        lines: [],
        summary: `Poogie: not applied (${why})`,
      });
    }
  } else {
    // Each feature is resolved on its own first: one that doesn't match this
    // disc is left out, and the loader (which caps Guild Cards) only goes in
    // for the ones that do. Monster health, attack hitboxes and damage numbers
    // can be turned on in game (the START menu's randomfu entry), so they go
    // in even when they're off; only an option that's on reports not fitting.
    const notApplied = (title: string, why: string): ShuffleReport => ({
      title,
      notes: [`${title} isn't in this image: ${why}.`],
      lines: [],
      summary: `${title}: not applied (${why})`,
    });
    const objects = decodeObjects(RUNTIME_OBJECTS);
    // The features that are off but go in so the START menu can turn them on,
    // and the menu itself: left out if the loader doesn't fit with them.
    const optional: typeof objects = [];
    const externs: Record<string, number> = {};
    const { ovl } = game.gameTask;
    // The features run on the game hooks, found once here.
    const sites = game.eboot
      ? findHookSites(game.eboot, ovl.reader.buf, ovl.loadBase)
      : "the EBOOT wasn't loaded";
    const mode = settings["hud.monsterHp"];
    let monsterHp = false;
    {
      const found =
        typeof sites === "string"
          ? sites
          : findMonsterHpExterns(
              game.eboot!,
              sites.segment,
              sites.gauges,
              ovl.reader.buf,
              ovl,
              mode,
            );
      if (typeof found === "string") {
        if (mode !== "off") reports.push(notApplied("Monster health", found));
      } else {
        (mode === "off" ? optional : objects).push(...monsterHpObjects());
        Object.assign(externs, found);
        monsterHp = true;
      }
    }
    let hitboxes = false;
    {
      const found =
        typeof sites === "string"
          ? sites
          : findHitboxExterns(
              game.eboot!,
              sites.segment,
              ovl.reader.buf,
              ovl,
              game.gameSub.ovl.reader.buf,
              settings["hud.attackHitboxes"],
            );
      if (typeof found === "string") {
        if (settings["hud.attackHitboxes"]) reports.push(notApplied("Attack hitboxes", found));
      } else {
        (settings["hud.attackHitboxes"] ? objects : optional).push(...hitboxObjects());
        Object.assign(externs, found);
        hitboxes = true;
      }
    }
    const prepared = !settings["quests.unknown"]
      ? null
      : typeof sites === "string"
        ? sites
        : prepareUnknownQuests(
            game,
            edits,
            setOf,
            // Base HP as the stats shuffle left it.
            hpFits(baseHpOf(game.gameTask.ovl, edits.dataFileNow(game.gameTask.index))),
          );
    if (typeof prepared === "string") {
      reports.push(notApplied("Unknown Monster quests", prepared));
    }
    const unknown = typeof prepared === "string" ? null : prepared;
    if (unknown) {
      objects.push(...unknownQuestsObjects());
      Object.assign(externs, unknown.externs);
    }
    // Elites share the monster list and species table monster health finds.
    let elites = false;
    if (settings["elites.enabled"]) {
      let found: Record<string, number> | string =
        typeof sites === "string"
          ? sites
          : findMonsterHpExterns(
              game.eboot!,
              sites.segment,
              sites.gauges,
              ovl.reader.buf,
              ovl,
              mode === "off" ? "always" : mode,
            );
      if (typeof sites !== "string" && typeof found !== "string") {
        const { rf_game_task, rf_monsters, rf_em_chunks } = found;
        const elite = findEliteExterns(game.eboot!, sites.segment, ovl, settings["elites.chance"]);
        found =
          typeof elite === "string"
            ? elite
            : {
                rf_game_task: rf_game_task!,
                rf_monsters: rf_monsters!,
                rf_em_chunks: rf_em_chunks!,
                ...elite,
              };
      }
      if (typeof found === "string") reports.push(notApplied("Elite monsters", found));
      else {
        objects.push(...eliteObjects());
        Object.assign(externs, found);
        elites = true;
      }
    }
    let pact = false;
    const data: Record<string, Buffer> = { ...unknown?.data };
    if (settings["pact.enabled"]) {
      const found =
        typeof sites === "string"
          ? sites
          : findPactExterns(game.eboot!, sites, ovl.reader.buf, ovl);
      // What items are worth and how many fit, for grading the pact's item rewards.
      const table = typeof found === "string" ? null : shopItemTable(game, false);
      if (typeof found === "string") reports.push(notApplied("Hunter's Pact", found));
      else if (!table) {
        reports.push(notApplied("Hunter's Pact", "this disc's item table couldn't be read"));
      } else {
        objects.push(...pactObjects());
        Object.assign(externs, found);
        // The pact's rewards, as the shuffles left items and equipment.
        const out = edits.eboot();
        const equipment = [
          ...collectWeaponStats(out, game.resolver).map((w) => ({
            type: w.family === "Blademaster" ? MELEE_BOX_TYPE : RANGED_BOX_TYPE,
            id: w.index,
            name: w.name,
            rarity: w.rarity,
          })),
          ...readArmorPieces(out, game.resolver).map((p) => ({
            type: ARMOR_BOX_TYPE[p.slot],
            id: p.index,
            name: pieceName(p),
            rarity: p.rarity,
            bits: p.bits,
          })),
        ];
        const tiers = itemTiers([...questAfter, ...monsterAfter, ...gatheringAfter]);
        // As the shops left prices and carry limits, so no reward pays past the limit.
        const values = readItemValues(out, table);
        data.rf_pact_pool = encodePactPool(
          pactPool(tiers, values, equipment, rng.fork("pact-pool")),
        );
        pact = true;
      }
    }
    // Poogie only needs the pad hook, so it doesn't wait on the HUD and reward code matching.
    const hookSites =
      typeof sites !== "string" ? sites : game.eboot ? findPadSites(game.eboot) : sites;
    const poogie = !settings["poogie.enabled"]
      ? null
      : typeof hookSites === "string"
        ? hookSites
        : preparePoogieLuck(game.eboot!, edits, { guaranteed: options.poogieTest });
    if (typeof poogie === "string") reports.push(notApplied("Poogie", poogie));
    else if (poogie) {
      objects.push(...poogieObjects());
      Object.assign(externs, poogie.externs);
    }
    const luck = typeof poogie === "string" ? null : poogie;
    const { ovl: lobbyOvl } = game.lobbyTask;
    const keySites = !settings["quests.keyLabel"]
      ? null
      : typeof hookSites === "string"
        ? hookSites
        : findKeyQuestSites(lobbyOvl.reader.buf, lobbyOvl.loadBase, game.eboot);
    if (typeof keySites === "string") reports.push(notApplied("Key quests", keySites));
    const keys = typeof keySites === "string" ? null : keySites;
    if (keys) {
      objects.push(...keyQuestsObjects());
      Object.assign(externs, keys.externs);
    }
    // Damage numbers are on the hit hook in game_sub.
    let hit: HitSite | null = null;
    const numbers = settings["hud.damageNumbers"];
    {
      const sub = game.gameSub.ovl;
      const site = typeof sites === "string" ? sites : findHitSite(sub.reader.buf, sub.loadBase);
      const found =
        typeof sites === "string"
          ? sites
          : typeof site === "string"
            ? site
            : findDamageExterns(game.eboot!, sites, ovl.reader.buf, ovl, numbers);
      if (typeof found === "string") {
        if (numbers !== "off") reports.push(notApplied("Damage numbers", found));
      } else {
        (numbers === "off" ? optional : objects).push(...damageObjects());
        Object.assign(externs, found);
        hit = site as HitSite;
      }
    }
    // randomfu's START menu entry, where the features with settings can be changed in game.
    let menus: MenuSites[] | null = null;
    if ((hit || monsterHp || hitboxes) && typeof sites !== "string") {
      const found = prepareMenu(game.eboot!, sites);
      if (typeof found === "string") {
        reports.push(
          notApplied(
            "randomfu's START menu entry",
            `${found}; monster health, attack hitboxes and damage numbers keep this disc's settings`,
          ),
        );
      } else {
        optional.push(...menuObjects());
        Object.assign(externs, found.externs);
        menus = found.sites;
      }
    }
    if (
      typeof hookSites !== "string" &&
      (monsterHp || hitboxes || unknown || elites || pact || luck || keys || hit)
    ) {
      const install = (lean: boolean) => {
        const all = lean ? objects : [...objects, ...optional];
        return addCodeLoader(game.eboot, game.gameSub, edits, {
          // Elites and the pact both bring the shared monster boosts: link them once.
          objects: all.filter((o, k) => all.findIndex((x) => x.name === o.name) === k),
          hooks: {
            sites: hookSites,
            // Pad-only sites (Poogie alone) leave game_task as it is.
            ...(typeof sites !== "string" && { gameTask: game.gameTask }),
            ...(unknown && { questLoad: { sites: unknown.questLoad, lobbyTask: game.lobbyTask } }),
            ...(luck && { pick: luck.pick }),
            ...(keys && {
              questCard: { call: keys.call, card: keys.card, lobbyTask: game.lobbyTask },
            }),
            // The hit hook is damage numbers' alone.
            ...(hit && !(lean && numbers === "off") && { hit }),
            ...(menus && !lean && { menus }),
          },
          externs,
          data,
        });
      };
      let loader = install(false);
      // A loader that doesn't fit with the in-game settings goes in without
      // them (it checks before it takes any room), keeping the options that are on.
      if (!loader.applied && optional.length) {
        const lean = install(true);
        if (lean.applied) {
          reports.push(
            notApplied(
              "randomfu's START menu entry",
              `${(loader.summary ?? "").replace(/^[^(]*\(|\)$/g, "")}; the options that are on keep this disc's settings`,
            ),
          );
          loader = lean;
        }
      }
      reports.push(loader);
      if (unknown) reports.push(unknown.finish(loader.applied));
      if (keys) reports.push(keyQuestsReport(loader.applied));
      if (luck) {
        reports.push(luck.finish(loader.applied));
        if (loader.applied && options.poogieTest) {
          testing.push(
            "Poogie test: a happy Poogie always gives the rarest reward. This disc is not for play.",
          );
        }
      }
    }
  }

  // Last, so the guides show the monsters, drops, recipes and shops as the shuffles left them.
  reports.push(
    ...writeGuides(game, questsAfter, settings.seed, edits, {
      bestiary: settings["hints.bookshelf"],
      almanac: settings["hints.almanac"],
    }),
  );

  if (settings["mods.nodeMap"]) reports.push(addNodeMap(game, edits));

  return {
    edits,
    reports,
    sources: {
      tiers: realTiers,
      gatheringQuests: gathering.quests,
      gatheringProblems: gathering.problems,
    },
    problems,
    testing,
  };
}
