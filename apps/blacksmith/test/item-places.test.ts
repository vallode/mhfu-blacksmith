/** Item places (lib/item-places.ts): gathering points and shops indexed by item. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  buildItemPlaces,
  decodeItemPlaces,
  encodeItemPlaces,
  gatherPointsLabel,
  shopStagesLabel,
  type GatheringFile,
  type ShopPlace,
  type ShopsFile,
} from "../src/lib/item-places";
import { buildAreaMaps } from "../src/lib/area-maps";
import { buildItemNameIndex, normalizeItemName, type ItemRecord } from "../src/lib/items";
import { DATA_DIR } from "../src/lib/paths";

const ITEM_IDS: Record<string, number> = { "Iron Ore": 1, Potion: 2, "Mountain Herbs": 3 };
const itemId = (name: string) => ITEM_IDS[name];

const node = (kind: "gather" | "mine" | "bug", items: [string, number][]) => ({
  kind,
  count: 1,
  items: items.map(([item, chance]) => ({ item, chance })),
});

const gathering: GatheringFile = {
  layouts: [
    {
      map: "Snowy Mountains (Day)",
      quests: [1001, 1002, 1003, 30001],
      areas: [
        { area: 0, nodes: [node("gather", [["Potion", 100]])] },
        { area: 2, nodes: [node("mine", [["Iron Ore", 45]])] },
        { area: 5, nodes: [node("mine", [["Iron Ore", 20]]), node("bug", [["Iron Ore", 5]])] },
      ],
    },
    {
      // A gathering quest's own points on the same map and rank.
      map: "Snowy Mountains (Day)",
      quests: [10001],
      areas: [
        { area: 1, nodes: [node("gather", [["Mountain Herbs", 75]])] },
        { area: 2, nodes: [node("mine", [["Iron Ore", 90]])] },
      ],
    },
    {
      map: "Old Desert",
      texture: "map27",
      quests: [3001, 20001],
      areas: [
        {
          area: 3,
          nodes: [{ ...node("mine", [["Iron Ore", 30]]), positions: [[40, 50]] }],
        },
        // An area the map doesn't draw.
        { area: 11, nodes: [node("gather", [["Potion", 50]])] },
      ],
    },
  ],
};

const quests = [
  { id: 1001, hub: "guild", rank: "low-rank" },
  { id: 1002, hub: "guild", rank: "low-rank" },
  { id: 1003, hub: "village", rank: "low-rank" },
  { id: 10001, hub: "village", rank: "low-rank" },
  { id: 3001, hub: "guild", rank: "g-rank" },
  { id: 20001, hub: "training-school", rank: null },
  { id: 30001, hub: "guild", rank: "low-rank" }, // hidden
];

const shops: ShopsFile = {
  shops: [
    {
      name: "Village general store",
      currency: "zenny",
      items: [
        { item: "Potion", price: 66, stages: [1, 2, 3] },
        { item: "Iron Ore", price: 30, stages: [3] },
      ],
    },
    {
      // Lists 3 and 4 are empty on the disc.
      name: "Peddler",
      currency: "zenny",
      items: [
        { item: "Potion", price: 66, stages: [5] },
        { item: "Mountain Herbs", price: 10, stages: [1, 2] },
      ],
    },
  ],
};

describe("item places", () => {
  const places = buildItemPlaces(gathering, shops, quests, itemId);

  test("groups gathering by rank or board, then map, best chance first", () => {
    assert.deepEqual(places.get(1)!.gathering, [
      {
        group: "Low Rank",
        map: "Snowy Mountains (Day)",
        points: [
          { kind: "mine", areas: [2, 5] },
          { kind: "bug", areas: [5] },
        ],
        chance: 45,
      },
      {
        group: "G Rank",
        map: "Old Desert",
        points: [{ kind: "mine", areas: [3] }],
        chance: 30,
        mapQuest: 3001,
      },
      {
        group: "Training School",
        map: "Old Desert",
        points: [{ kind: "mine", areas: [3] }],
        chance: 30,
        mapQuest: 20001,
      },
    ]);
  });

  test("names a quest's own points only for items the map's usual points don't give", () => {
    assert.deepEqual(places.get(3)!.gathering, [
      {
        group: "Low Rank",
        map: "Snowy Mountains (Day)",
        points: [{ kind: "gather", areas: [1] }],
        chance: 75,
        quests: [10001],
      },
    ]);
  });

  test("numbers shop stages over the lists with items", () => {
    assert.deepEqual(places.get(2)!.shops, [
      {
        shop: "Village general store",
        currency: "zenny",
        price: 66,
        stages: [1, 2, 3],
        stageCount: 3,
      },
      { shop: "Peddler", currency: "zenny", price: 66, stages: [3], stageCount: 3 },
    ]);
  });

  test("names a map quest only where the map draws a point that gives the item", () => {
    const g = (id: number) => places.get(id)!.gathering.map((p) => [p.group, p.mapQuest]);
    assert.deepEqual(g(1), [
      ["Low Rank", undefined],
      ["G Rank", 3001],
      ["Training School", 20001],
    ]);
    assert.deepEqual(g(2), [
      ["Low Rank", undefined],
      ["G Rank", undefined],
      ["Training School", undefined],
    ]);
  });

  test("the bundle decodes to the same places", () => {
    const encoded = encodeItemPlaces(places);
    assert.deepEqual(encoded.mapQuests, { "1,1": 3001, "2,1": 20001 });
    assert.deepEqual(encoded.unmapped, ["2:1", "2:2", "3:0"]);
    const bundle = JSON.parse(JSON.stringify(encoded));
    assert.deepEqual(decodeItemPlaces(bundle), places);
  });

  test("labels", () => {
    assert.equal(
      gatherPointsLabel([
        { kind: "mine", areas: [2, 5] },
        { kind: "gather", areas: [0, 3] },
        { kind: "bug", areas: [0] },
      ]),
      "Mining: areas 2, 5 · Gathering: Base Camp, area 3 · Bugs: Base Camp",
    );
    const shop = (stages: number[]): ShopPlace => ({
      shop: "s",
      currency: "zenny",
      price: 1,
      stages,
      stageCount: 5,
    });
    assert.equal(shopStagesLabel(shop([1, 2, 3, 4, 5])), "From the start");
    assert.equal(shopStagesLabel(shop([4, 5])), "From stage 4 of 5");
    assert.equal(shopStagesLabel(shop([2])), "Stage 2 of 5");
    assert.equal(shopStagesLabel(shop([1, 3, 5])), "Stages 1, 3 and 5 of 5");
  });

  test("every gathered or sold item in data/ resolves to an item", () => {
    const read = <T>(file: string) =>
      JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8")) as T;
    const { index } = buildItemNameIndex(read<{ items: ItemRecord[] }>("items.json").items);
    const missing = new Set<string>();
    const resolve = (name: string) => {
      const id = index.get(normalizeItemName(name));
      if (id === undefined) missing.add(name);
      return id;
    };
    const all = fs
      .readdirSync(path.join(DATA_DIR, "quests"))
      .flatMap((f) => read<{ quests: typeof quests }>(path.join("quests", f)).quests);
    const real = buildItemPlaces(
      read<GatheringFile>("gathering.json"),
      read<ShopsFile>("shops.json"),
      all,
      resolve,
    );
    assert.deepEqual([...missing], []);
    // Each place's map quest has an area map, and most of the places have one.
    const areaMaps = buildAreaMaps(read<GatheringFile>("gathering.json"));
    const rows = [...real.values()].flatMap((p) => p.gathering);
    for (const row of rows) {
      if (row.mapQuest) assert.ok(row.mapQuest in areaMaps.quests, `quest ${row.mapQuest}`);
    }
    assert.ok(rows.filter((r) => r.mapQuest).length > rows.length / 2);
    // Iron Ore is mined on many maps, and the general store sells Potions from the start.
    assert.ok(real.get(index.get(normalizeItemName("Iron Ore"))!)!.gathering.length > 10);
    assert.equal(
      shopStagesLabel(real.get(index.get(normalizeItemName("Potion"))!)!.shops[0]!),
      "From the start",
    );
  });
});
