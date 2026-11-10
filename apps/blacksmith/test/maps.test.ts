/** Map icons (lib/maps.ts). */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { mapIconSrc } from "../src/lib/maps";
import { DATA_DIR } from "../src/lib/paths";

const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));

test("day, night, size and floor variants share their map's icon", () => {
  assert.equal(mapIconSrc("Jungle (Night)"), "/images/maps/jungle.png");
  assert.equal(mapIconSrc("Arena (Small)"), "/images/maps/arena.png");
  assert.equal(mapIconSrc("Tower 3"), "/images/maps/tower.png");
  assert.equal(mapIconSrc("Old Jungle"), "/images/maps/old-jungle.png");
  assert.equal(mapIconSrc("Nowhere"), null);
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
