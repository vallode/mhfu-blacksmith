/** Area maps (lib/area-maps.ts): gathering points by quest. */
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  AREA_MAP_SIZE,
  areaLabel,
  buildAreaMaps,
  decodeAreaMap,
  nextSelection,
} from "../src/lib/area-maps";
import type { GatheringFile } from "../src/lib/item-places";
import { DATA_DIR } from "../src/lib/paths";
import { readData } from "game-data";

const items = [{ item: "Herb", chance: 100 }];

test("buildAreaMaps gives each position its own point, and skips layouts with none", () => {
  const bundle = buildAreaMaps({
    layouts: [
      {
        map: "Tower 2",
        quests: [1],
        areas: [{ area: 1, nodes: [{ kind: "gather", count: 1, items }] }],
      },
      {
        map: "Forest and Hills (Day)",
        texture: "map2",
        quests: [2, 3],
        areas: [
          {
            area: 0,
            nodes: [
              {
                kind: "mine",
                count: 2,
                gathers: 1,
                most_gathers: 3,
                items,
                positions: [
                  [10, 20],
                  [30, 40],
                ],
              },
              { kind: "bug", count: 1, items }, // an area the map doesn't draw
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(bundle.quests, { 2: 0, 3: 0 });
  assert.equal(decodeAreaMap(bundle, 1), null);
  assert.deepEqual(
    decodeAreaMap(bundle, 3)!.points.map((p) => [p.kind, p.x, p.y, p.gathers, p.mostGathers]),
    [
      ["mine", 10, 20, 1, 3],
      ["mine", 30, 40, 1, 3],
    ],
  );
});

test("a fishing area gets a fish point at a real point in the area", () => {
  const fish = [
    { item: "Knife Mackerel", chance: 60 },
    { item: "Sushifish", chance: 40 },
  ];
  const bundle = buildAreaMaps({
    layouts: [
      {
        map: "Forest and Hills (Day)",
        texture: "map2",
        quests: [2],
        areas: [
          {
            area: 3,
            nodes: [
              {
                kind: "gather",
                count: 1,
                items,
                positions: [
                  [10, 20],
                  [30, 40],
                ],
              },
              { kind: "fish", count: 1, items: fish },
            ],
          },
          {
            area: 5,
            // No placed point in this area, so there is nothing to anchor on.
            nodes: [{ kind: "fish", count: 1, items: fish }],
          },
        ],
      },
    ],
  });
  const points = decodeAreaMap(bundle, 2)!.points;
  assert.deepEqual(
    points.map((p) => [p.kind, p.x, p.y]),
    [
      ["gather", 10, 20],
      ["gather", 30, 40],
      ["fish", 10, 20],
    ],
  );
  assert.deepEqual(points[2]!.items, fish);
});

test("buildAreaMaps gives every quest a map, even without gathering points", () => {
  const bundle = buildAreaMaps(
    {
      layouts: [
        {
          map: "Forest and Hills (Day)",
          texture: "map2",
          quests: [5],
          areas: [
            {
              area: 0,
              nodes: [
                {
                  kind: "gather",
                  count: 1,
                  gathers: 1,
                  most_gathers: 1,
                  items,
                  positions: [[10, 20]],
                },
              ],
            },
          ],
        },
      ],
    },
    [
      { id: 5, map: "Forest and Hills (Day)" }, // its own points
      { id: 6, map: "Forest and Hills (Day)" }, // a quest with none there
      { id: 1, map: "Tower 2" },
      { id: 2, map: "Arena (Small)" },
      { id: 3, map: "Tower 1" },
      { id: 4, map: "Nowhere" },
    ],
  );
  assert.deepEqual(Object.keys(bundle.quests).sort(), ["1", "2", "3", "5", "6"]);
  assert.deepEqual(decodeAreaMap(bundle, 1), { texture: "map14", points: [] });
  assert.deepEqual(decodeAreaMap(bundle, 2), { texture: "map10", points: [] });
  assert.deepEqual(decodeAreaMap(bundle, 3), { texture: "map15", points: [] });
  assert.deepEqual(decodeAreaMap(bundle, 6), { texture: "map2", points: [] });
  assert.equal(decodeAreaMap(bundle, 5)!.points.length, 1);
  assert.equal(decodeAreaMap(bundle, 4), null);
});

test("every committed position is inside its texture, and the texture exists", () => {
  const file = readData(DATA_DIR, "gathering.json") as GatheringFile;
  const quests = readdirSync(path.join(DATA_DIR, "quests"))
    .filter((name) => name.endsWith(".json"))
    .flatMap(
      (name) =>
        readData<{ quests: { id: number; map: string | null }[] }>(DATA_DIR, "quests", name).quests,
    );
  const bundle = buildAreaMaps(file, quests);
  assert.ok(bundle.maps.length > 50);
  for (const [texture, points] of bundle.maps) {
    const png = path.join(process.cwd(), "public", "images", "area-maps", `${texture}.png`);
    assert.ok(existsSync(png), `${texture}.png is missing`);
    for (const [, , x, y] of points) {
      assert.ok(
        x >= 0 && y >= 0 && x <= AREA_MAP_SIZE && y <= AREA_MAP_SIZE,
        `${texture} ${x},${y}`,
      );
    }
  }
});

test("every quest on a known map gets an area map, with points or not", () => {
  const file = readData(DATA_DIR, "gathering.json") as GatheringFile;
  const quests = readdirSync(path.join(DATA_DIR, "quests"))
    .filter((name) => name.endsWith(".json"))
    .flatMap(
      (name) =>
        readData<{ quests: { id: number; map: string | null }[] }>(DATA_DIR, "quests", name).quests,
    );
  const bundle = buildAreaMaps(file, quests);
  for (const quest of quests) {
    if (quest.map === null) continue;
    assert.ok(bundle.quests[quest.id] !== undefined, `quest ${quest.id} (${quest.map}) has no map`);
  }
});

test("nextSelection steps through overlapping points, nearest first, then to none", () => {
  const points = [
    { x: 10, y: 10, index: 0 },
    { x: 12, y: 10, index: 1 },
    { x: 40, y: 40, index: 2 },
  ];
  assert.equal(nextSelection(points, 11.5, 10, 5, null), 1);
  assert.equal(nextSelection(points, 11.5, 10, 5, 1), 0);
  assert.equal(nextSelection(points, 11.5, 10, 5, 0), null);
  assert.equal(nextSelection(points, 11.5, 10, 5, 2), 1); // the selection is elsewhere
  assert.equal(nextSelection(points, 40, 40, 5, null), 2);
  assert.equal(nextSelection(points, 40, 40, 5, 2), null);
  // At the same point, the marker drawn on top (the later one) wins first.
  const tied = [
    { x: 10, y: 10, index: 0 },
    { x: 10, y: 10, index: 1 },
  ];
  assert.equal(nextSelection(tied, 10, 10, 5, null), 1);
  assert.equal(nextSelection(tied, 10, 10, 5, 1), 0);
  assert.equal(nextSelection(tied, 10, 10, 5, 0), null);
});

test("areaLabel names the Base Camp", () => {
  assert.equal(areaLabel(0), "Base Camp");
  assert.equal(areaLabel(4), "Area 4");
});

test("areaNumber gives the number the map art prints, not the stage index", async () => {
  const { areaNumber } = await import("../src/lib/area-numbers");
  // The Jungle's 7th stage is drawn as its area 8, and its Base Camp has none.
  assert.equal(areaNumber("map6", 7), 8);
  assert.equal(areaNumber("map6", 6), 9);
  assert.equal(areaNumber("map6", 0), 0);
  // A map the table doesn't have keeps its index.
  assert.equal(areaNumber("map999", 3), 3);
  assert.equal(areaNumber(undefined, 3), 3);
});
