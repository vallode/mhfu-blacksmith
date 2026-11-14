/**
 * Runs the enabled shuffles on loaded game data. Pure apart from the RNG:
 * the same game, seed and settings always give the same edits and spoiler.
 */
import { Edits } from "./edits.js";
import type { GameData, LoadedQuest } from "./game/load.js";
import { coarsen, itemTiers, monsterStars, type Tier } from "./game/tiers.js";
import { Rng } from "./rng.js";
import { needsEboot, type Settings } from "./settings.js";
import { shuffleArmor } from "./shuffles/armor.js";
import { randomizeArmorSkills } from "./shuffles/armor-skills.js";
import { collectPriceSlots, randomizeCosts } from "./shuffles/costs.js";
import { deliveryTargets, isQuestItem, readSupplySlots } from "./game/quest-fields.js";
import { collectDeliveries, shuffleDeliveries } from "./shuffles/deliveries.js";
import { collectGatheringSlots, shuffleGathering } from "./shuffles/gathering.js";
import {
  collectMonsterRewardSlots,
  collectRewardLists,
  shuffleMonsterRewards,
} from "./shuffles/monster-rewards.js";
import { collectQuestRewardSlots, shuffleQuestRewards } from "./shuffles/quest-rewards.js";
import { checkRecipes, collectRecipeSlots, randomizeRecipes } from "./shuffles/recipes.js";
import { median, type ShuffleReport } from "./shuffles/shuffle.js";
import { findShops } from "mhfu-extract/src/shops/shops.js";
import {
  itemsOnSale,
  locateItemTable,
  randomizeShopPrices,
  randomizeShops,
} from "./shuffles/shops.js";
import { tableName } from "./names.js";
import { TABLE_COUNTS } from "mhfu-extract/src/tables/offsets.js";
import { addSupplies, collectSupplyRuns, shuffleSupplies } from "./shuffles/supplies.js";
import { collectTermsSlots, randomizeTerms } from "./shuffles/terms.js";
import { findSmithyStore, storeReport } from "./shuffles/store.js";
import { shuffleWeapons } from "./shuffles/weapons.js";
import { collectTradeSlots, shuffleTrades } from "./shuffles/veggie-trades.js";
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
  collectMonsterChunks,
  randomizeMonsterStats,
  shuffleWeaknesses,
} from "./shuffles/monster-stats.js";
import { writeGuides } from "./hints/guides.js";
import { DEMO_OBJECTS } from "./blob/demo-object.js";
import { addCodeLoader } from "./patches/code-loader.js";
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

/**
 * How many of an item a supply stack gets when a wider pool puts it there:
 * the usual amount supply boxes give of it, else quest rewards, else 1.
 */
function usualAmounts(
  game: GameData,
  rewards: readonly { itemId: number; amount: number }[],
): (itemId: number) => number {
  const collect = (entries: Iterable<{ itemId: number; amount: number }>) => {
    const out = new Map<number, number[]>();
    for (const { itemId, amount } of entries) {
      const list = out.get(itemId);
      if (list) list.push(amount);
      else out.set(itemId, [amount]);
    }
    return out;
  };
  const supplied = collect(game.quests.flatMap((q) => readSupplySlots(q.file.payload)));
  const rewarded = collect(rewards);
  return (itemId) => {
    const amounts = supplied.get(itemId) ?? rewarded.get(itemId);
    // The lower middle, so an even split rounds down to an amount the game uses.
    return amounts ? Math.max(1, median(amounts, "lower")) : 1;
  };
}

export interface RandomizeOptions {
  /** For testing in game: a happy Poogie always gives the rarest reward. */
  poogieTest?: boolean;
  /** Prototype: the code loader with its demo blob (see `docs/code-loader.md`). */
  loaderDemo?: boolean;
}

export function randomize(
  game: GameData,
  settings: Settings,
  options: RandomizeOptions = {},
): RandomizeResult {
  const rng = new Rng(`randomfu/${LOGIC_VERSION}/${settings.seed}`);
  const edits = new Edits(game);
  const reports: ShuffleReport[] = [];
  const mode = settings["logic.tiers"];
  // Shuffles group by these tiers; the spoiler's item list keeps the real ones.
  const grouped = <T extends { tier: Tier }>(slots: T[]): T[] =>
    slots.map((s) => ({ ...s, tier: coarsen(s.tier, mode) }));

  // Monster swaps first: carves are found where their monsters now are.
  const questMonsters = collectQuestMonsters(game.quests);
  const setOf = multiplierSets(game.gameTask.ovl);
  let questsAfter = game.quests.map((q) => q.parsed);
  if (settings["questMonsters.species"]) {
    const result = swapSpecies(
      questMonsters,
      settings["questMonsters.speciesPool"],
      rng.fork("monster-species"),
      edits,
      game.quests,
      setOf,
      game.boards,
    );
    reports.push(result.report);
    questsAfter = result.questsAfter;
    if (settings["questMonsters.text"]) {
      reports.push(renameQuestText(result.swaps, game.quests, edits, game.boards));
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
  const monsterSlots = collectMonsterRewardSlots(
    collectRewardLists(game.gameSub.ovl),
    monsterStars(questsAfter),
  );
  const gathering = collectGatheringSlots(game.quests);
  // A delivery quest's own item stays at its gathering points, so the
  // quest can still be finished whether or not its target changes.
  const deliveries = deliveryTargets(game.quests);
  const isDeliveryItem = (s: (typeof gathering.slots)[number]) =>
    deliveries.get(s.quest.index)?.itemId === s.itemId;
  const realTiers = itemTiers([...questSlots, ...monsterSlots, ...gathering.slots]);

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

  // Gathering points are item sources too: the recipe check below uses them as shuffled.
  let gatheringAfter: { itemId: number; tier: Tier }[] = grouped(gathering.slots);
  if (settings["gathering.enabled"]) {
    const pinned = grouped(gathering.slots.filter(isDeliveryItem));
    const result = shuffleGathering(
      grouped(gathering.slots.filter((s) => !isDeliveryItem(s))),
      { pool: settings["gathering.pool"], keepItems: settings["gathering.keepItems"] },
      {
        bands: new Map([...realTiers].map(([item, tier]) => [item, tier.band])),
        allItems: sellableItems(),
      },
      rng.fork("gathering"),
      edits,
    );
    reports.push(result.report);
    gatheringAfter = [...result.after, ...pinned];
  }

  if (settings["supplies.enabled"]) {
    const pool = settings["supplies.pool"];
    const keepEssentials = settings["supplies.keepEssentials"];
    const context = {
      bands: new Map([...realTiers].map(([item, tier]) => [item, tier.band])),
      allItems: sellableItems(),
      usualAmount: usualAmounts(game, questSlots),
      deliveryItem: (quest: LoadedQuest) => deliveries.get(quest.index)?.itemId,
    };
    reports.push(
      pool === "add"
        ? addSupplies(game.quests, context, rng.fork("supplies"), edits)
        : shuffleSupplies(
            grouped(
              collectSupplyRuns(
                game.quests,
                (quest, itemId) =>
                  (keepEssentials && isQuestItem(itemId)) ||
                  deliveries.get(quest.index)?.itemId === itemId,
              ),
            ),
            { pool, keepEssentials },
            context,
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

  if (settings["trades.enabled"]) {
    reports.push(
      shuffleTrades(
        collectTradeSlots(game.gameTask),
        settings["trades.mix"],
        rng.fork("veggie-trades"),
        edits,
        game.gameTask,
      ),
    );
  }

  const problems: string[] = [];
  if (needsEboot(settings) && !game.eboot) {
    throw new Error("These settings need the decrypted EBOOT");
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
        game.eboot!,
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
        collectWeaponStats(game.eboot!, game.resolver),
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
    reports.push(shuffleArmor(game.eboot!, game.resolver, rng.fork("armor"), edits, store));
  }
  if (settings["weapons.enabled"] || settings["armor.enabled"]) reports.push(storeReport(store));

  // Skills are the pieces' own, so they go with a piece wherever the armor shuffle puts it.
  if (settings["armorSkills.enabled"]) {
    reports.push(
      randomizeArmorSkills(
        game.eboot!,
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

  if (settings["recipes.materials"] || settings["recipes.amounts"]) {
    const vanillaTiers = itemTiers([
      ...grouped(questSlots),
      ...grouped(monsterSlots),
      ...grouped(gathering.slots),
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
    const tiersAfter = itemTiers([...questAfter, ...monsterAfter, ...gatheringAfter]);
    for (const p of checkRecipes(result.assigned, tiersAfter)) {
      problems.push(`${p.recipe}: ${p.item} (${p.needs})`);
    }
  }

  const prices = settings["shops.prices"];
  const stacks = settings["shops.stacks"];
  if (settings["shops.enabled"] || prices || stacks) {
    const shops = findShops(game.lobbyTask.ovl);
    const items = shopItemTable(game, prices || stacks);
    // Prices are the item's own, so they need no stock shuffle: without
    // one, they go to what the shops sell anyway.
    let sold = itemsOnSale(shops);
    if (settings["shops.enabled"]) {
      const stock = randomizeShops(
        shops,
        {
          pool: settings["shops.pool"],
          mix: settings["shops.mix"],
          keepEssentials: settings["shops.keepEssentials"],
          special: settings["shops.special"],
          countSpread: settings["shops.countSpread"],
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
        collectPriceSlots(game.eboot!, game.resolver),
        settings["costs.spread"],
        rng.fork("costs"),
        edits,
      ),
    );
  }

  reports.push(addPoogieLuck(game.eboot, edits, { guaranteed: options.poogieTest }));
  if (options.loaderDemo) {
    const objects = DEMO_OBJECTS.map((o) => ({
      name: o.name,
      data: Buffer.from(o.base64, "base64"),
    }));
    const { blob: _blob, ...report } = addCodeLoader(game.eboot, game.gameSub, edits, { objects });
    reports.push(report);
  }

  // Last, so the guides show the monsters, drops, recipes and shops as the shuffles left them.
  reports.push(
    ...writeGuides(game, questsAfter, settings.seed, edits, {
      bestiary: settings["hints.bookshelf"],
      almanac: settings["hints.almanac"],
    }),
  );

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
