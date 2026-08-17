import assert from "node:assert/strict";
import { test } from "node:test";
import { listQuestFiles } from "../src/quests/discovery.js";

test("listQuestFiles returns only real m#####.mib quest files, excluding the 13 non-quest level*.mib files", () => {
  const files = listQuestFiles();
  // The vendored filelist.csv has 564 mission_jpn/*.mib entries total: 551
  // real quests + 13 level*.mib arena configs (confirmed empirically — see
  // discovery.ts's docs). Every returned path must be a real quest file.
  assert.equal(files.length, 551);
  for (const { path } of files) {
    assert.match(path, /^mission_jpn\/m\d+\.mib$/);
  }
  // Spot check: quest ID 1 is filelist.csv index 4759, mission_jpn/m00001.mib.
  assert.ok(files.some((f) => f.index === 4759 && f.path === "mission_jpn/m00001.mib"));
  assert.ok(!files.some((f) => f.path.startsWith("mission_jpn/level")));
});
