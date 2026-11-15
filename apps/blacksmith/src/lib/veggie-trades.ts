/**
 * The Veggie Elder's trades (data/veggie-trades.json): the compact
 * public/data/veggie-trades.json bundle generate-data writes (item IDs), and
 * an index of the trades that give each item and the ones that take it.
 * Pure, so the item pages build it on the client and the tests build it
 * from data/.
 *
 * Each hunting ground the Elder trades on has its own list. He takes the
 * first item on it that the hunter carries and gives the rare trade
 * `rare_chance` percent of the time (always with the Felyne Negotiations
 * kitchen skill), else the common one.
 */

/** data/veggie-trades.json (data/schemas/veggie-trade.schema.json). */
export interface VeggieTradesFile {
  rare_chance: number;
  elders: { maps: string[]; trades: { give: string; common: string; rare: string }[] }[];
}

/**
 * public/data/veggie-trades.json: each row is [row, give, common, rare], the
 * row's place in the Elder's list (1-based) and its item IDs. The place is
 * the disc's, so a row left out for an unknown item doesn't renumber the rest.
 */
export interface VeggieTradesBundle {
  kind: "veggie-trades";
  rareChance: number;
  elders: { maps: string[]; rows: [number, number, number, number][] }[];
}

/** One trade, from one item's side. */
export interface Trade {
  /** The maps the Elder trades on, as quests name them */
  maps: string[];
  /** Its place in his list (1-based): he takes the first item on it the hunter carries */
  row: number;
  /** Item ID on the other side: what he takes for the item, or gives for it */
  item: number;
  /** In percent: 100 when the common and rare trades are the same item */
  chance: number;
  /** Only the rare trade */
  rare: boolean;
}

export interface ItemTrades {
  /** Trades that give the item, best chance first */
  gives: Trade[];
  /** What the Elder gives for the item, in his lists' order */
  takes: Trade[];
}

/**
 * The bundle, with items as IDs. Returns the names `itemId` doesn't know,
 * whose rows are left out.
 */
export function encodeVeggieTrades(
  file: VeggieTradesFile,
  itemId: (name: string) => number | undefined,
): { bundle: VeggieTradesBundle; unresolved: string[] } {
  const unresolved = new Set<string>();
  const id = (name: string) => {
    const found = itemId(name);
    if (found === undefined) unresolved.add(name);
    return found;
  };
  const elders = file.elders.map(({ maps, trades }) => ({
    maps,
    rows: trades.flatMap(({ give, common, rare }, i): [number, number, number, number][] => {
      const ids = [id(give), id(common), id(rare)];
      if (ids.some((v) => v === undefined)) return [];
      return [[i + 1, ...(ids as [number, number, number])]];
    }),
  }));
  return {
    bundle: { kind: "veggie-trades", rareChance: file.rare_chance, elders },
    unresolved: [...unresolved],
  };
}

/** Every item's trades, by item ID. */
export function indexVeggieTrades(bundle: VeggieTradesBundle): Map<number, ItemTrades> {
  const out = new Map<number, ItemTrades>();
  const entry = (id: number) => {
    let e = out.get(id);
    if (!e) {
      e = { gives: [], takes: [] };
      out.set(id, e);
    }
    return e;
  };
  const rare = bundle.rareChance;
  for (const { maps, rows } of bundle.elders) {
    for (const [row, give, common, rareItem] of rows) {
      const sure = common === rareItem;
      const commonChance = sure ? 100 : 100 - rare;
      entry(common).gives.push({ maps, row, item: give, chance: commonChance, rare: false });
      entry(give).takes.push({ maps, row, item: common, chance: commonChance, rare: false });
      if (!sure) {
        entry(rareItem).gives.push({ maps, row, item: give, chance: rare, rare: true });
        entry(give).takes.push({ maps, row, item: rareItem, chance: rare, rare: true });
      }
    }
  }
  // Stable, so the Elders and their rows keep the game's order within a chance.
  for (const e of out.values()) e.gives.sort((a, b) => b.chance - a.chance);
  return out;
}

/**
 * An Elder's maps, each once: ["Desert (Day)", "Desert (Night)"] -> "Desert".
 * `ground` names a map without its time of day; pages pass one that puts
 * it in the site's language.
 */
export function tradeMapsLabel(
  maps: readonly string[],
  ground: (map: string) => string = (m) => m.replace(/ \((?:Day|Night)\)$/, ""),
): string {
  return [...new Set(maps.map(ground))].join(" / ");
}

/** One row of an Elder's list in the bundle: [row, give, common, rare]. */
export type TradeRow = VeggieTradesBundle["elders"][number]["rows"][number];

/** Identical trades on several hunting grounds, as one. */
export interface TradeGroup {
  /** Item ID on the other side */
  item: number;
  /** In percent */
  chance: number;
  /** Only the rare trade */
  rare: boolean;
  /** Where he makes it: each ground's maps and its place in his list there */
  places: { maps: string[]; row: number }[];
}

/**
 * The trades that are the same item, chance and kind, one group each, in the
 * order of their first trade (so a sorted list stays sorted).
 */
export function groupTrades(trades: readonly Trade[]): TradeGroup[] {
  const groups = new Map<string, TradeGroup>();
  for (const { maps, row, item, chance, rare } of trades) {
    const key = `${item}|${chance}|${rare}`;
    let group = groups.get(key);
    if (!group) {
      group = { item, chance, rare, places: [] };
      groups.set(key, group);
    }
    group.places.push({ maps, row });
  }
  return [...groups.values()];
}
