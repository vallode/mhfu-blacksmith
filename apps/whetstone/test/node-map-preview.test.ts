import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readData } from "game-data";
import { nodeMapPoints, type GatheringLayouts } from "../node-map-preview.js";

const dataDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "data",
);

test("a texture's nodes from every layout on it, once, in the patch's draw order", () => {
  const points = nodeMapPoints(
    {
      layouts: [
        {
          texture: "map30",
          areas: [
            {
              nodes: [
                { kind: "mine", positions: [[10.4, 20]] },
                { kind: "gather", positions: [[5, 5]] },
              ],
            },
          ],
        },
        { texture: "map2", areas: [{ nodes: [{ kind: "gather", positions: [[1, 1]] }] }] },
        {
          texture: "map30",
          areas: [
            {
              nodes: [
                { kind: "mine", positions: [[10, 20.2]] },
                { kind: "bug", positions: [[30, 30]] },
                { kind: "gather", positions: null },
              ],
            },
          ],
        },
      ],
    },
    "map30",
  );
  assert.deepEqual(points, [
    ["bug", 30, 30],
    ["gather", 5, 5],
    ["mine", 10, 20],
  ]);
});

test("the Great Forest, which the preview shows, has nodes of every kind on its picture", () => {
  const points = nodeMapPoints(
    readData<GatheringLayouts>(dataDir, "mhfu", "gathering.json"),
    "map30",
  );
  for (const kind of ["gather", "mine", "bug"])
    assert.ok(
      points.some((p) => p[0] === kind),
      kind,
    );
  for (const [, x, y] of points) assert.ok(x >= 0 && y >= 0 && x < 160 && y < 160);
});
