/** Area maps (lib/area-maps.ts): gathering points by quest. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AREA_MAP_SIZE, areaLabel, buildAreaMaps, decodeAreaMap } from "../src/lib/area-maps";
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

test("every committed position is on its texture", () => {
  const file = JSON.parse(
    readFileSync(path.join(DATA_DIR, "gathering.json"), "utf-8"),
  ) as GatheringFile;
  const bundle = buildAreaMaps(file);
  assert.ok(bundle.maps.length > 50);
  for (const [, points] of bundle.maps) {
    for (const [, , x, y] of points) {
      assert.ok(x >= -20 && y >= -20 && x <= AREA_MAP_SIZE + 20 && y <= AREA_MAP_SIZE + 20);
    }
  }
});

test("areaLabel names the Base Camp", () => {
  assert.equal(areaLabel(0), "Base Camp");
  assert.equal(areaLabel(4), "Area 4");
});
