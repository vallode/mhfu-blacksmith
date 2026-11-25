/** Map icons (lib/maps.ts). */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { mapIconSrc } from "../src/lib/maps";
import { getMapEntries } from "../src/lib/maps-data";
import { DATA_DIR } from "../src/lib/paths";
import { readData } from "game-data";

const readJson = (file: string) => readData(DATA_DIR, file);

test("day, night, size and floor variants share their map's icon", () => {
  assert.equal(mapIconSrc("Jungle (Night)"), "/images/maps/jungle.png");
  assert.equal(mapIconSrc("Arena (Small)"), "/images/maps/arena.png");
  assert.equal(mapIconSrc("Tower 3"), "/images/maps/tower.png");
  assert.equal(mapIconSrc("Old Jungle"), "/images/maps/old-jungle.png");
  assert.equal(mapIconSrc("Nowhere"), null);
});

test("every layout lists its quests, including maps that only have monster spawns", () => {
  const entries = getMapEntries();
  for (const entry of entries) {
    for (const layout of entry.layouts) {
      assert.equal(layout.questId, layout.questIds[0]);
      assert.equal(layout.quests, layout.questIds.length);
      assert.ok(layout.questIds.length > 0, `${entry.map} has an empty layout`);
    }
  }
  // Arena (Small) has no gathering layout; its quests are spawn-only.
  assert.ok(entries.some((entry) => entry.map === "Arena (Small)"));
});

test("maps are listed in the order the game introduces them", () => {
  const names = getMapEntries().map((entry) => entry.map);
  assert.deepEqual(names.slice(0, 5), [
    "Snowy Mountains (Day)",
    "Snowy Mountains (Night)",
    "Jungle (Day)",
    "Desert (Day)",
    "Jungle (Night)",
  ]);
  // The maps only the Guild visits come after all the Village's.
  assert.deepEqual(names.slice(-3), ["Castle Schrade", "Moat Arena", "Snowy Mountains Peak"]);
});

test("every map in data/ has an icon that exists", () => {
  const maps = new Set<string>();
  for (const file of fs.readdirSync(path.join(DATA_DIR, "quests"))) {
    const { quests } = readJson(path.join("quests", file)) as { quests: { map: string | null }[] };
    for (const q of quests) {
      if (q.map) maps.add(q.map);
    }
  }
  for (const l of (readJson("gathering.json") as { layouts: { map: string }[] }).layouts) {
    maps.add(l.map);
  }
  assert.ok(maps.size > 20);
  for (const map of maps) {
    const src = mapIconSrc(map);
    assert.ok(src, `${map} has no icon`);
    assert.ok(fs.existsSync(path.join(process.cwd(), "public", src)), `${src} is missing`);
  }
});
