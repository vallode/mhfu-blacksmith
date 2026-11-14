import { createElement, Fragment, type ReactNode } from "react";

/** The Items section: item list, detail pages and where items come from. */
export const items = {
  /** The item list down the left (ItemShell). */
  list: {
    filterLabel: "Filter every item by name",
    filterPlaceholder: "Filter all items, e.g. Rathalos",
    loadError: "Couldn't load items.",
    noMatch: "No items match.",
    /** The selector bar's label while the filter searches every category. */
    allCategories: "All categories",
    categoryGroup: "Item category",
    previousCategory: "Previous category",
    nextCategory: "Next category",
    /** The selector bar's count, read out. */
    matchCount: (n: number, count: string) =>
      `${count} ${n === 1 ? "item matches" : "items match"}`,
    categoryOf: (n: number, total: number) => `Category ${n} of ${total}`,
    /** /items/ before an item is picked. */
    pickItem: "Pick an item to see the monsters and quests it comes from.",
  },
  /**
   * The item categories, by lib/item-categories slug. Short: the category
   * selector bar has room for about 17 characters on a phone.
   */
  categories: {
    books: "Books",
    consumables: "Consumables",
    tools: "Tools",
    ammo: "Ammo & Coatings",
    plants: "Plants",
    ores: "Ores & Minerals",
    "armor-spheres": "Armor Spheres",
    fish: "Fish",
    insects: "Insects",
    "common-materials": "Common Materials",
    "monster-materials": "Monster Materials",
    relics: "Relics",
    "quest-items": "Quest Items",
    "coins-tickets": "Coins & Tickets",
    jewels: "Jewels",
    treasures: "Treasures",
    other: "Other",
  },
  detail: {
    notFound: "Not found.",
    category: "Category:",
    rarity: "Rarity:",
    carry: "Carry:",
    price: "Price:",
    /** How many the loaded hunter has. */
    owned: "Owned:",
    /** The tab row's accessible name. */
    tabsLabel: "Where to get it and what it makes",
    tabs: {
      monsters: "Monsters",
      quests: "Quests",
      gathering: "Gathering",
      map: "Map",
      shops: "Shops",
      trades: "Trades",
      combining: "Combining",
    },
    noSources:
      "No monster drop, quest reward, gathering point, shop, trade or combination gives this item.",
    /** Some of the sources failed to load; `partial` when others are shown. */
    loadError: (partial: boolean): string =>
      partial
        ? "Couldn't load all of where to get this item."
        : "Couldn't load where to get this item.",
    /** A quest ID the quest list doesn't have. */
    unknownQuest: (id: number) => `Quest ${id}`,
  },
  gathering: {
    /** Gathering point kinds, by lib/item-places GatherKind. */
    kinds: { gather: "Gathering", mine: "Mining", bug: "Bugs" },
    baseCamp: "Base Camp",
    /** A map's numbered areas: "area 3", "areas 2, 5". */
    areas: (areas: number[]) =>
      areas.length === 1 ? `area ${areas[0]}` : `areas ${areas.join(", ")}`,
    /** One kind of point and where it is: "Mining: Base Camp, areas 2, 5". */
    points: (kind: string, places: string) => `${kind}: ${places}`,
  },
  shops: {
    title: "Shops",
    /** Shop names, by data/shops.json's name. Unlisted ones stay as they are. */
    names: {
      "Village general store": "Village general store",
      Peddler: "Peddler",
      "Guild Hall store": "Guild Hall store",
      "Point Exchange": "Point Exchange",
    } as Record<string, string>,
    /** The currency of shops that don't take zenny. */
    pokkePoints: "Pokke Points",
    /** Which stages of the shop's stock have the item. */
    fromStart: "From the start",
    fromStage: (stage: number, total: number) => `From stage ${stage} of ${total}`,
    /** "Stage 2 of 5", "Stages 1, 3 and 5 of 5" */
    stagesOf: (stages: number[], total: number) =>
      stages.length === 1
        ? `Stage ${stages[0]} of ${total}`
        : `Stages ${stages.slice(0, -1).join(", ")} and ${stages[stages.length - 1]} of ${total}`,
  },
  combining: {
    madeFrom: "Made by combining",
    usedIn: "Used to make",
    /** The other ingredient, as a link. */
    with: (item: ReactNode): ReactNode => createElement(Fragment, null, "with ", item),
    /** Its number in the in-game Combination List. */
    listNumber: (n: number) => `List No. ${n}`,
    alchemy: "Needs Alchemy or the Alchemy Guide",
    bomber: "100% with Bomber",
    trapMaster: "100% with Trap Master",
    /** A quantity that varies: "Makes 1 (70%), 2 (30%)". */
    makes: (odds: string) => `Makes ${odds}`,
    /** `bonuses` is "+5%, +10%, …". */
    booksNote: (last: number, bonuses: string) =>
      `Rates are before Books of Combos 1–${last} (${bonuses} for owning them in order from 1) and the Combination skill.`,
  },
  /** The Veggie Elder's trades: the item pages' Trades tab and /veggie-elder/. */
  veggieElder: {
    /** The Trades tab's lists. */
    gives: "Veggie Elder gives it for",
    takes: "Trade it to the Veggie Elder for",
    rareTrade: "Rare trade",
    /** A trade's hunting ground and its place in his list there: "Desert No. 3". */
    listPlace: (ground: string, row: number) => `${ground} No. ${row}`,
    itemNote:
      "He takes the first item on his list that you carry, and each ground has its own list (the No. is the place on it). The Felyne Negotiations kitchen skill makes every trade a rare one.",
    /** The Veggie Elder page. */
    loadError: "The Veggie Elder's trades didn't load.",
    loading: "Loading trades…",
    groundGroup: "Hunting ground",
    previousGround: "Previous hunting ground",
    nextGround: "Next hunting ground",
    groundOf: (n: number, total: number) => `Hunting ground ${n} of ${total}`,
    listNumber: "List No.:",
    heGives: "He gives:",
    pageNote:
      "He takes the first item on his list that you carry, so a higher one wins. The Felyne Negotiations kitchen skill makes every trade a rare one.",
    pickItem:
      "Pick an item to see what the Veggie Elder gives for it. Each hunting ground has its own list.",
  },
  /** /wishlist/: the gear the player starred and the materials it needs. */
  wishlist: {
    /** Card titles. */
    title: "Wishlist",
    materials: "Materials",
    whereToGo: "Where to go",
    empty:
      "Nothing on your wishlist yet. Press the star beside a weapon or armor piece's name to add it, and its materials add up here with where to get them. The wishlist is kept in this browser.",
    loadError: "Couldn't load the wishlist's gear.",
    retry: "Try again",
    whereToGoNote: "The monsters and maps that give the most of the materials you still need.",
    /** The badge on gear the loaded hunter has. */
    owned: "OWNED",
    remove: "Remove",
    removeLabel: (name: string) => `Remove ${name} from the wishlist`,
    missingGear: "Not in this version's data any more.",
    ownedNote: "Your hunter has this already, so its materials are left out.",
    noRecipe: "No recipe makes this.",
    recipe: "Recipe",
    /** By lib/wishlist Recipe. */
    recipes: { create: "Create", alt: "Alt. recipe", improve: "Upgrade" },
    /** After a weapon in an upgrade path that's made another way: "(create)". */
    stepRecipes: { create: "(create)", alt: "(alt. recipe)", improve: "(upgrade)" },
    /** The weapon an upgrade path starts from. */
    from: "From",
    ownedOption: (name: string) => `${name} (owned)`,
    wholePath: "Nothing (whole path)",
    cost: "Cost:",
    /** The loaded hunter's zenny, after the cost. */
    youHave: (amount: string) => `(you have ${amount})`,
    materialsCount: "Materials:",
    stillToGet: (_n: number, missing: string, total: string) =>
      `${missing} of ${total} still to get`,
    nothingLeft: "Nothing left to make.",
    loadSave: "Load a save on the Hunter page to count what you already have.",
    /** A material's tooltip: the gear it's for. */
    forGear: (names: string) => `For ${names}`,
    /** The ways to get a material that aren't shown, linking to its page. */
    more: (_n: number, count: string) => `${count} more…`,
    noSource: "No known source.",
    /** The ways to get a material. */
    ways: {
      /** What to do. Short: the column fits eight characters. */
      kinds: { shop: "Buy", monster: "Hunt", gather: "Gather", quest: "Quest", combine: "Combine" },
      shop: "Shop",
      stageStock: (stage: number) => `Stage ${stage} stock`,
      /** By lib/item-places GatherKind. */
      gatherKinds: { gather: "Gathering", mine: "Mining", bug: "Bug catching" },
      onlyOnQuests: (n: number, count: string) =>
        `only on ${count} ${n === 1 ? "quest" : "quests"}`,
      /** `stars` is "G3★". */
      questReward: (stars: string) => `${stars} reward`,
      pokkePoints: (amount: string) => `${amount}pts`,
    },
    /** Where to go: a gathering map's rank or board. */
    gatheringIn: (group: string) => `Gathering · ${group}`,
    materialCount: (n: number, count: string) => `${count} ${n === 1 ? "material" : "materials"}`,
  },
};
