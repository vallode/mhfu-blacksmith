/** Area maps (lib/area-maps.ts): gathering points by quest. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("every committed position is inside its texture, and the texture exists", () => {
  const file = JSON.parse(
    readFileSync(path.join(DATA_DIR, "gathering.json"), "utf-8"),
  ) as GatheringFile;
  const bundle = buildAreaMaps(file);
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
});

test("areaLabel names the Base Camp", () => {
  assert.equal(areaLabel(0), "Base Camp");
  assert.equal(areaLabel(4), "Area 4");
});
