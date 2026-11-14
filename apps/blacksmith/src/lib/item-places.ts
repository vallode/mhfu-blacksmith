/**
 * Where an item can be gathered or bought: data/gathering.json's points,
 * data/farm.json's Pokke Farm points and data/shops.json's stock, indexed
 * by in-game item ID. Pure, so
 * scripts/generate-data.ts writes it into public/data/item-places.json and
 * the tests build it from data/.
 */
import { formatRank } from "./monster-drops";
import { isHiddenQuest, questHubLabel, questHubSlug } from "./quests";

export type GatherKind = "gather" | "mine" | "bug";

/** data/gathering.json (data/schemas/gathering.schema.json). */
export interface GatheringFile {
  layouts: {
    map: string;
    texture?: string;
    quests: number[];
    areas: {
      area: number;
      nodes: {
        kind: GatherKind;
        count: number;
        gathers?: number | null;
        most_gathers?: number | null;
        items: { item: string; chance: number }[];
        positions?: [number, number][];
      }[];
    }[];
  }[];
}

/** data/shops.json (data/schemas/shop.schema.json). */
export interface ShopsFile {
  shops: {
    name: string;
    currency: "zenny" | "pokke-points";
    items: { item: string; price: number | null; stages: number[] }[];
  }[];
}

export type FarmSpot = "mining" | "insects" | "mushrooms" | "honey";

/** data/farm.json (data/schemas/farm.schema.json). */
export interface FarmFile {
  points: {
    name: string;
    spot: FarmSpot;
    level: number;
    gathers: number;
    most_gathers: number;
    items: { item: string; chance: number }[];
  }[];
}

/** The quest fields the places need. */
export interface PlaceQuest {
  id: number;
  hub: string;
  rank: string | null;
}

/** An item's gathering points on one map, under one rank or quest board. */
export interface GatherPlace {
  /** "Low Rank", "G Rank", "Training School", … */
  group: string;
  map: string;
  /** Each kind of point that gives it, with its areas (0 is the Base Camp). */
  points: { kind: GatherKind; areas: number[] }[];
  /** Best chance per gather, in percent */
  chance: number;
  /** Set when only these quests' points on the map give it, not the map's usual points */
  quests?: number[];
  /**
   * A quest whose area map (area-maps.json) shows these points, when the
   * map draws at least one of the points that give the item.
   */
  mapQuest?: number;
}

/** A shop that sells the item. */
export interface ShopPlace {
  shop: string;
  currency: "zenny" | "pokke-points";
  /** In the shop's currency; null where it isn't known */
  price: number | null;
  /** The stages (1-based, counting only lists with items) whose stock has it */
  stages: number[];
  /** How many stages the shop's stock has (lists with items) */
  stageCount: number;
}

/** A Pokke Farm point that gives the item. */
export interface FarmPlace {
  /** The farm upgrade: "Mining Point +2", "Production Bee Hive" */
  point: string;
  spot: FarmSpot;
  /** Chance per gather, in percent */
  chance: number;
  /** How many times it can be gathered after each quest, at least and at most */
  gathers: number;
  mostGathers: number;
}

export interface ItemPlaces {
  gathering: GatherPlace[];
  /** In data/farm.json's order */
  farm: FarmPlace[];
  shops: ShopPlace[];
}

/** A quest's group: its rank, or its board when it has none. */
function questGroup(q: PlaceQuest): string {
  if (q.rank) return formatRank(q.rank);
  return questHubLabel(questHubSlug(q.hub, q.rank) ?? q.hub);
}

const GROUP_ORDER = ["Low Rank", "High Rank", "G Rank"];
const groupOrder = (group: string) => {
  const i = GROUP_ORDER.indexOf(group);
  return i === -1 ? GROUP_ORDER.length : i;
};
const KIND_ORDER: GatherKind[] = ["gather", "mine", "bug"];

type Layout = GatheringFile["layouts"][number];

/**
 * One item's points in a layout: kind -> areas, the best chance, and
 * whether the layout's map draws any of them.
 */
function pointsIn(layout: Layout, itemId: (name: string) => number | undefined) {
  const out = new Map<
    number,
    { kinds: Map<GatherKind, Set<number>>; chance: number; drawn: boolean }
  >();
  for (const { area, nodes } of layout.areas) {
    for (const node of nodes) {
      for (const { item, chance } of node.items) {
        const id = itemId(item);
        if (id === undefined || chance <= 0) continue;
        const e = out.get(id) ?? { kinds: new Map(), chance: 0, drawn: false };
        out.set(id, e);
        const areas = e.kinds.get(node.kind) ?? new Set<number>();
        e.kinds.set(node.kind, areas.add(area));
        e.chance = Math.max(e.chance, chance);
        e.drawn ||= !!layout.texture && (node.positions?.length ?? 0) > 0;
      }
    }
  }
  return out;
}

/**
 * Every item's places, by item ID. Gathering is grouped by quest rank (or
 * board), then map: a map's usual points are the set the most quests in the
 * group use there. Another set on the map (a gathering quest's, say) only
 * adds a row, naming its quests, for items the usual set doesn't give.
 * Hidden quests (`isHiddenQuest`) don't count.
 */
export function buildItemPlaces(
  gathering: GatheringFile,
  shops: ShopsFile,
  farm: FarmFile,
  quests: PlaceQuest[],
  itemId: (name: string) => number | undefined,
): Map<number, ItemPlaces> {
  const out = new Map<number, ItemPlaces>();
  const entry = (id: number) => {
    let e = out.get(id);
    if (!e) {
      e = { gathering: [], farm: [], shops: [] };
      out.set(id, e);
    }
    return e;
  };

  // (group, map) -> the layouts its quests use, with those quests.
  const questById = new Map(quests.map((q) => [q.id, q]));
  const groups = new Map<string, { group: string; map: string; uses: [Layout, number[]][] }>();
  for (const layout of gathering.layouts) {
    const byGroup = new Map<string, number[]>();
    for (const id of layout.quests) {
      const q = questById.get(id);
      if (!q || isHiddenQuest(id)) continue;
      const group = questGroup(q);
      byGroup.set(group, [...(byGroup.get(group) ?? []), id]);
    }
    for (const [group, ids] of byGroup) {
      const key = `${group}|${layout.map}`;
      const g = groups.get(key) ?? { group, map: layout.map, uses: [] };
      groups.set(key, g);
      g.uses.push([layout, ids]);
    }
  }

  for (const { group, map, uses } of groups.values()) {
    uses.sort((a, b) => b[1].length - a[1].length);
    const usual = pointsIn(uses[0]![0], itemId);
    uses.forEach(([layout, ids], i) => {
      const found = i === 0 ? usual : pointsIn(layout, itemId);
      for (const [id, { kinds, chance, drawn }] of found) {
        if (i > 0 && usual.has(id)) continue;
        entry(id).gathering.push({
          group,
          map,
          points: KIND_ORDER.filter((k) => kinds.has(k)).map((kind) => ({
            kind,
            areas: [...kinds.get(kind)!].sort((a, b) => a - b),
          })),
          chance,
          ...(i > 0 && { quests: [...ids].sort((a, b) => a - b) }),
          ...(drawn && { mapQuest: Math.min(...ids) }),
        });
      }
    });
  }

  for (const point of farm.points) {
    for (const { item, chance } of point.items) {
      const id = itemId(item);
      if (id === undefined || chance <= 0) continue;
      entry(id).farm.push({
        point: point.name,
        spot: point.spot,
        chance,
        gathers: point.gathers,
        mostGathers: point.most_gathers,
      });
    }
  }

  for (const shop of shops.shops) {
    // The disc's lists include empty ones; number only those with items.
    const stocked = [...new Set(shop.items.flatMap((i) => i.stages))].sort((a, b) => a - b);
    for (const { item, price, stages } of shop.items) {
      const id = itemId(item);
      if (id === undefined) continue;
      entry(id).shops.push({
        shop: shop.name,
        currency: shop.currency,
        price,
        stages: stages.map((s) => stocked.indexOf(s) + 1),
        stageCount: stocked.length,
      });
    }
  }

  for (const e of out.values()) {
    e.gathering.sort(
      (a, b) =>
        groupOrder(a.group) - groupOrder(b.group) ||
        a.group.localeCompare(b.group) ||
        Number(!!a.quests) - Number(!!b.quests) ||
        b.chance - a.chance ||
        a.map.localeCompare(b.map),
    );
  }
  return out;
}

/** "from the start", "from stage 4 of 8", "stages 1, 3 and 5 of 5" */
export function shopStagesLabel({ stages, stageCount }: ShopPlace): string {
  const first = stages[0]!;
  const toEnd = stages.length === stageCount - first + 1;
  if (toEnd) return first === 1 ? "From the start" : `From stage ${first} of ${stageCount}`;
  const list =
    stages.length === 1
      ? `${stages[0]}`
      : `${stages.slice(0, -1).join(", ")} and ${stages[stages.length - 1]}`;
  return `${stages.length === 1 ? "Stage" : "Stages"} ${list} of ${stageCount}`;
}

const KIND_LABELS: Record<GatherKind, string> = {
  gather: "Gathering",
  mine: "Mining",
  bug: "Bugs",
};

const FARM_SPOT_LABELS: Record<FarmSpot, string> = {
  mining: "Mining",
  insects: "Bugs",
  mushrooms: "Mushrooms",
  honey: "Honey",
};

/** "Mining · 3–4 per quest" */
export function farmPlaceLabel({ spot, gathers, mostGathers }: FarmPlace): string {
  const count = gathers === mostGathers ? `${gathers}` : `${gathers}–${mostGathers}`;
  return `${FARM_SPOT_LABELS[spot]} · ${count} per quest`;
}

/** "Mining: areas 2, 5 · Gathering: Base Camp, area 3" */
export function gatherPointsLabel(points: GatherPlace["points"]): string {
  return points
    .map(({ kind, areas }) => {
      const numbered = areas.filter((a) => a > 0);
      const parts = [
        ...(areas.includes(0) ? ["Base Camp"] : []),
        ...(numbered.length > 0
          ? [`area${numbered.length > 1 ? "s" : ""} ${numbered.join(", ")}`]
          : []),
      ];
      return `${KIND_LABELS[kind]}: ${parts.join(", ")}`;
    })
    .join(" · ");
}

// ---------------------------------------------------------------------------
// public/data/item-places.json: the same, with names and lists interned
// ---------------------------------------------------------------------------

/** [group, map, chance, points ("g1,7|m0,3": kind letter, then areas), quests?] */
type GatherTuple = [number, number, number, string, number[]?];
/** [shop, price, stages] */
type ShopTuple = [number, number | null, number[]];
/** [farm point, chance] */
type FarmTuple = [number, number];

export interface ItemPlacesBundle {
  kind: "item-places";
  groups: string[];
  maps: string[];
  shops: { name: string; currency: ShopPlace["currency"]; stages: number }[];
  /** Pokke Farm's points: [name, spot, gathers, most gathers] */
  farm: [string, FarmSpot, number, number][];
  /** item ID -> [gathering, shops, farm (where it has any)] */
  items: Record<string, [GatherTuple[], ShopTuple[], FarmTuple[]?]>;
  /**
   * Each place's `mapQuest`, kept off the rows: a quest's own points use
   * their first quest, and a map's usual points the quest here, by
   * "group,map" (their indices), when the map draws them...
   */
  mapQuests: Record<string, number>;
  /** ...except these places, "itemId:row", whose points that map doesn't draw. */
  unmapped: string[];
}

const KIND_LETTERS: Record<GatherKind, string> = { gather: "g", mine: "m", bug: "b" };
const LETTER_KINDS = Object.fromEntries(
  Object.entries(KIND_LETTERS).map(([k, l]) => [l, k as GatherKind]),
);

export function encodeItemPlaces(places: Map<number, ItemPlaces>): ItemPlacesBundle {
  const intern = (list: string[], index: Map<string, number>, value: string) => {
    let i = index.get(value);
    if (i === undefined) {
      i = list.push(value) - 1;
      index.set(value, i);
    }
    return i;
  };
  const groups: string[] = [];
  const maps: string[] = [];
  const shops: ItemPlacesBundle["shops"] = [];
  const groupIndex = new Map<string, number>();
  const mapIndex = new Map<string, number>();
  const shopIndex = new Map<string, number>();
  const farm: ItemPlacesBundle["farm"] = [];
  const farmIndex = new Map<string, number>();
  const items: ItemPlacesBundle["items"] = {};
  const mapQuests: ItemPlacesBundle["mapQuests"] = {};
  for (const [id, { gathering, farm: farmed, shops: sold }] of [...places].sort(
    (a, b) => a[0] - b[0],
  )) {
    const g = gathering.map((p): GatherTuple => {
      const points = p.points.map((pt) => KIND_LETTERS[pt.kind] + pt.areas.join(",")).join("|");
      const t: GatherTuple = [
        intern(groups, groupIndex, p.group),
        intern(maps, mapIndex, p.map),
        p.chance,
        points,
      ];
      if (p.quests) t.push(p.quests);
      if (!p.quests && p.mapQuest !== undefined) {
        const key = `${t[0]},${t[1]}`;
        if ((mapQuests[key] ??= p.mapQuest) !== p.mapQuest) {
          throw new Error(`item-places: ${p.group} ${p.map} has two usual maps`);
        }
      }
      if (p.quests && p.mapQuest !== undefined && p.mapQuest !== p.quests[0]) {
        throw new Error(`item-places: quest ${p.quests[0]}'s points use another quest's map`);
      }
      return t;
    });
    const s = sold.map((p): ShopTuple => {
      let i = shopIndex.get(p.shop);
      if (i === undefined) {
        i = shops.push({ name: p.shop, currency: p.currency, stages: p.stageCount }) - 1;
        shopIndex.set(p.shop, i);
      }
      return [i, p.price, p.stages];
    });
    const f = farmed.map((p): FarmTuple => {
      let i = farmIndex.get(p.point);
      if (i === undefined) {
        i = farm.push([p.point, p.spot, p.gathers, p.mostGathers]) - 1;
        farmIndex.set(p.point, i);
      }
      return [i, p.chance];
    });
    items[id] = f.length > 0 ? [g, s, f] : [g, s];
  }
  // Only once every usual map is known: the places their quest doesn't draw.
  const unmapped = [...places].flatMap(([id, { gathering }]) =>
    gathering.flatMap((p, row) => {
      const derived = p.quests ?? mapQuests[`${groupIndex.get(p.group)},${mapIndex.get(p.map)}`];
      return derived !== undefined && p.mapQuest === undefined ? [`${id}:${row}`] : [];
    }),
  );
  return { kind: "item-places", groups, maps, shops, farm, items, mapQuests, unmapped };
}

export function decodeItemPlaces(bundle: ItemPlacesBundle): Map<number, ItemPlaces> {
  const unmapped = new Set(bundle.unmapped);
  const out = new Map<number, ItemPlaces>();
  for (const [id, [g, s, f = []]] of Object.entries(bundle.items)) {
    out.set(Number(id), {
      gathering: g.map(([group, map, chance, points, quests], row) => {
        const mapQuest = unmapped.has(`${id}:${row}`)
          ? undefined
          : (quests?.[0] ?? bundle.mapQuests[`${group},${map}`]);
        return {
          group: bundle.groups[group]!,
          map: bundle.maps[map]!,
          points: points.split("|").map((pt) => ({
            kind: LETTER_KINDS[pt[0]!]!,
            areas: pt.slice(1).split(",").map(Number),
          })),
          chance,
          ...(quests && { quests }),
          ...(mapQuest !== undefined && { mapQuest }),
        };
      }),
      farm: f.map(([point, chance]) => {
        const [name, spot, gathers, mostGathers] = bundle.farm[point]!;
        return { point: name, spot, chance, gathers, mostGathers };
      }),
      shops: s.map(([shop, price, stages]) => ({
        shop: bundle.shops[shop]!.name,
        currency: bundle.shops[shop]!.currency,
        price,
        stages,
        stageCount: bundle.shops[shop]!.stages,
      })),
    });
  }
  return out;
}
