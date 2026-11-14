import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { readTmh, swizzle, unswizzle } from "mhfu-extract/src/models/tmh.js";
import { mapTextureName, type MapGeometry } from "mhfu-extract/src/tables/map-layout.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { questTier } from "../src/game/tiers.js";
import { collectNodePoints, drawNodes, MARKER_COLORS } from "../src/patches/node-map.js";
import { randomize } from "../src/randomize.js";
import { buildFixtureDisc, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

async function withFixture(run: (game: GameData) => void): Promise<void> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  try {
    run(await loadGame(source, iso, { eboot: {} }));
  } finally {
    source.close();
  }
}

/** A 160x160 8-bit swizzled map texture with a palette, every pixel using entry 0 or 1. */
function texture(): Buffer {
  const pixels = Buffer.alloc(160 * 160);
  for (let i = 0; i < pixels.length; i++) pixels[i] = i % 2;
  const header = Buffer.alloc(48);
  header.write(".TMH0.14", 0, "latin1");
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(32 + 16 + 160 * 160 + 16 + 1024, 16);
  header.writeUInt32LE(1, 28);
  header.writeUInt32LE(16 + 160 * 160, 32);
  header.writeUInt32LE(1, 36);
  header.writeUInt32LE(5, 40);
  header.writeUInt16LE(160, 44);
  header.writeUInt16LE(160, 46);
  const palette = Buffer.alloc(16 + 1024);
  palette.writeUInt32LE(16 + 1024, 0);
  palette.writeUInt32LE(3, 8);
  palette.writeUInt32LE(256, 12);
  palette.set([10, 20, 30, 255, 40, 50, 60, 255], 16);
  return Buffer.concat([header, swizzle(pixels, 160, 160), palette]);
}

test("swizzle undoes unswizzle", () => {
  const data = Buffer.from(Array.from({ length: 160 * 160 }, (_, i) => (i * 7) & 255));
  assert.deepEqual(unswizzle(swizzle(data, 160, 160), 160, 160), data);
});

test("nodes are drawn in unused palette entries and nothing else changes", () => {
  const file = texture();
  const out = drawNodes(file, [
    { kind: "gather", x: 50, y: 60 },
    { kind: "mine", x: 0, y: 0 },
    { kind: "bug", x: 159.4, y: 100 },
  ])!;
  assert.equal(out.length, file.length);
  const before = readTmh(file)[0]!;
  const after = readTmh(out)[0]!;
  const at = (img: typeof after, x: number, y: number) => [
    ...img.rgba.subarray((y * 160 + x) * 4, (y * 160 + x) * 4 + 3),
  ];
  assert.deepEqual(at(after, 50, 60), MARKER_COLORS.gather);
  assert.deepEqual(at(after, 49, 61), MARKER_COLORS.gather);
  assert.deepEqual(at(after, 1, 1), MARKER_COLORS.mine);
  assert.deepEqual(at(after, 159, 100), MARKER_COLORS.bug);
  assert.deepEqual(at(after, 52, 60), at(before, 52, 60));
  assert.deepEqual(out.subarray(0, 48), file.subarray(0, 48));
});

test("a texture that isn't the expected layout is left alone", () => {
  assert.equal(drawNodes(Buffer.alloc(100), []), null);
});

test("randomize leaves a non-EU disc's maps alone and says why", async () => {
  await withFixture((game) => {
    const result = randomize(game, settingsWith("MAP", [], { "hints.nodeMap": true }));
    const report = result.reports.find((r) => r.title === "Gathering nodes on the map");
    assert.ok(report);
    assert.match(report.notes[0]!, /Not written: .*EU disc/);
    assert.equal(result.edits.files.size, 0);
  });
});

test("one set of nodes per texture, only on the art, from quests a player can take", async () => {
  await withFixture((game) => {
    const quests = game.quests.filter((q) => questTier(q.parsed));
    assert.ok(quests.length > 0);
    const mapId = quests[0]!.parsed.header.map;
    const name = mapTextureName(mapId)!;
    // Every area at the origin of a 160x160 map, so a node's pixel is its x and z / 1000.
    const geometry = new Map<number, MapGeometry>([
      [
        mapId,
        {
          width: 150000,
          depth: 150000,
          zoom: 1,
          origins: Array.from({ length: 16 }, () => [0, 0] as [number, number]),
        },
      ],
    ]);
    const points = collectNodePoints(game, geometry, new Map([[name, texture()]]));
    const list = points.get(name) ?? [];
    assert.ok(list.length > 0, "the fixture quests have nodes");
    const keys = list.map((p) => `${p.kind}|${Math.round(p.x)}|${Math.round(p.y)}`);
    assert.equal(new Set(keys).size, keys.length, "no duplicates");
    for (const { x, y } of list) {
      assert.ok(x >= 0 && y >= 0 && x < 160 && y < 160);
    }
    // No texture, no points.
    assert.equal(collectNodePoints(game, geometry, new Map()).size, 0);
  });
});
