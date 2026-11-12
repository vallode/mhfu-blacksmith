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
      shops: "Shops",
      combining: "Combining",
    },
    noSources:
      "No monster drop, quest reward, gathering point, shop or combination gives this item.",
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
};
