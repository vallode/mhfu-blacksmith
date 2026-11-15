/**
 * Runs the enabled shuffles on loaded game data. Pure apart from the RNG:
 * the same game, seed and settings always give the same edits and spoiler.
 */
import { Edits } from "./edits.js";
import type { GameData, LoadedQuest } from "./game/load.js";
import { itemTiers, monsterStars, type Tier, type TierMode } from "./game/tiers.js";
import { Rng } from "./rng.js";
import type { Settings } from "./settings.js";
import { shuffleArmor } from "./shuffles/armor.js";
import { randomizeArmorSkills } from "./shuffles/armor-skills.js";
import { collectPriceSlots, randomizeCosts } from "./shuffles/costs.js";
import { deliveryTargets, isQuestItem, readSupplySlots } from "./game/quest-fields.js";
import { changeCarveCounts, collectCarveCounts } from "./shuffles/carve-counts.js";
import { collectDeliveries, shuffleDeliveries } from "./shuffles/deliveries.js";
import {
  collectGatheringSlots,
  randomizeGathering,
  randomizeGatherCounts,
  shuffleGathering,
} from "./shuffles/gathering.js";
import {
  collectMonsterRewardSlots,
  collectRewardLists,
  randomizeMonsterRewards,
  shuffleMonsterRewards,
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
import { itemName, questLabel, tableName } from "./names.js";
import { TABLE_COUNTS } from "mhfu-extract/src/tables/offsets.js";
import { collectSupplyRuns, randomizeSupplies, shuffleSupplies } from "./shuffles/supplies.js";
import { collectTermsSlots, randomizeTerms } from "./shuffles/terms.js";
import { findSmithyStore, storeReport } from "./shuffles/store.js";
import { shuffleWeapons } from "./shuffles/weapons.js";
import { collectTradeSlots, randomizeTrades, shuffleTrades } from "./shuffles/veggie-trades.js";
import { collectWeaponStats, randomizeWeaponStats } from "./shuffles/weapon-stats.js";
import {
  collectQuestMonsters,
  multiplierSets,
  randomizeDifficulty,
  randomizeCrownSpread,
  randomizeQuestSize,
  randomizeSmallCounts,
  swapSpecies,
} from "./shuffles/quest-monsters.js";
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
  collectMonsterChunks,
  randomizeMonsterStats,
  shuffleWeaknesses,
} from "./shuffles/monster-stats.js";
import { writeGuides } from "./hints/guides.js";
import { addNodeMap } from "./patches/node-map.js";
import { addPoogieLuck } from "./patches/poogie-luck.js";
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

/** Every item with a name and an item record: what "any item" shops can sell. */
function sellableItems(): number[] {
  const out: number[] = [];
  for (let id = 1; id < TABLE_COUNTS.regularItems + TABLE_COUNTS.decorations; id++) {
    if (tableName("ItemID", id) !== null) out.push(id);
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
    );
    moved = result.moved;
    mapReport = result.report;
    own.push(result.report);
  }
  if (starts) own.push(randomizeStarts(list, moved, rng.fork("monster-starts")));
  if (small) own.push(swapSmallSpecies(list, rng.fork("small-species")));

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
  let questsAfter = game.quests.map((q) => q.parsed);
  if (settings["questMonsters.mode"] !== "off") {
    const result = swapSpecies(
      questMonsters,
      settings["questMonsters.mode"] === "shuffle" ? "variants" : settings["questMonsters.scope"],
      rng.fork("monster-species"),
      edits,
      game.quests,
      setOf,
      game.boards,
    );
    reports.push(result.report);
    questsAfter = result.questsAfter;
    if (settings["questMonsters.text"]) {
      reports.push(renameQuestText(result.swaps, game.quests, edits, game.boards, options.debug));
    }
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
        ),
      );
    }
  }

  const questSlots = collectQuestRewardSlots(game.quests);
  const monsterSlots = collectMonsterRewardSlots(rewardLists, monsterStars(questsAfter));
  const gathering = collectGatheringSlots(game.quests);
  // A delivery quest's own item stays at its gathering points, so the
  // quest can still be finished whether or not its target changes.
  const deliveries = deliveryTargets(game.quests);
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
    const changed = monsterSlots.filter((s) => withCaptures || s.list.stride === 4);
    const kept = monsterSlots.filter((s) => !withCaptures && s.list.stride !== 4);
    const scope = settings["monsterRewards.scope"];
    const result =
      monsterMode === "shuffle"
        ? shuffleMonsterRewards(changed, scope, rng.fork("monster-rewards"), edits, game.gameSub)
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
          );
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

  // The smithy's store follows the weapons and armor shuffles: found once, for both.
  const store =
    settings["weapons.enabled"] || settings["armor.enabled"]
      ? findSmithyStore(game.lobbyTask)
      : null;

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
        store,
      ),
    );
  }

  // Stats are in each weapon's own record, which the weapons shuffle never
  // touches, so they go with the weapon and the order doesn't matter.
  const weaponSpreads = {
    attack: settings["weapons.attack"] ? settings["weapons.attackSpread"] : null,
    affinity: settings["weapons.affinity"] ? settings["weapons.affinitySpread"] : null,
    element: settings["weapons.element"] ? settings["weapons.elementSpread"] : null,
  };
  if (Object.values(weaponSpreads).some((v) => v !== null)) {
    reports.push(
      randomizeWeaponStats(
        collectWeaponStats(game.eboot, game.resolver),
        weaponSpreads,
        {
          attack: rng.fork("weapon-attack"),
          affinity: rng.fork("weapon-affinity"),
          element: rng.fork("weapon-element"),
        },
        edits,
      ),
    );
  }

  // Armor only changes which piece each create entry makes, so the recipe
  // shuffles' spoiler names the new pieces.
  if (settings["armor.enabled"]) {
    reports.push(shuffleArmor(game.eboot, game.resolver, rng.fork("armor"), edits, store));
  }
  if (settings["weapons.enabled"] || settings["armor.enabled"]) reports.push(storeReport(store));

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

  reports.push(addPoogieLuck(game.eboot, edits, { guaranteed: options.poogieTest }));

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
  };
}
