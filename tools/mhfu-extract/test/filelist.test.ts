import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFileList } from "../src/container/filelist.js";
import euAlignment from "../src/container/filelist-eu.json" with { type: "json" };
import { listQuestFiles } from "../src/quests/discovery.js";

test("JP file list is filelist.csv as-is", () => {
  const jp = loadFileList("jp");
  assert.equal(jp.size, 6602);
  assert.equal(jp.get(3388), "weapon/we000.pac");
  assert.equal(jp.get(6060), "emmodel/em01.pac");
});

test("EU alignment segments are ordered, non-overlapping and inside both TOCs", () => {
  let euEnd = 0;
  let jpEnd = 0;
  for (const segment of euAlignment.segments) {
    assert.ok(segment.eu >= euEnd && segment.jp >= jpEnd, `segment ${JSON.stringify(segment)} overlaps the previous one`);
    euEnd = segment.eu + segment.count;
    jpEnd = segment.jp + segment.count;
  }
  assert.ok(euEnd <= euAlignment.totalEntries);
  assert.ok(jpEnd <= 6602);
});

test("EU indices map to the files observed on a real EU disc", () => {
  const eu = loadFileList("eu");
  // Content-verified against a real ULES01213 dump: EU 3388 (named
  // weapon/we000.pac under JP indices) renders as a male waist piece, and the
  // EU-only entries shift the weapon, quest and monster groups.
  assert.equal(eu.get(3388), "player/m/wst/m_wst288.pac");
  assert.equal(eu.get(82), "player/f/reg/f_reg000.pac");
  assert.equal(eu.get(3408), "weapon/we000.pac");
  assert.equal(eu.get(3960), "weapon/we552.pac");
  assert.equal(eu.get(6112), "emmodel/em01.pac");
  assert.equal(eu.get(6200), "emmodel/em89.pac");
  // EU-only entries have no JP name.
  assert.equal(eu.get(4776), undefined);
});

test("EU quest discovery finds all 551 quests at their shifted indices", () => {
  const quests = listQuestFiles("eu");
  assert.equal(quests.length, 551);
  assert.deepEqual(quests[0], { index: 4791, path: "mission_jpn/m00001.mib" });
  assert.equal(quests.at(-1)!.path, "mission_jpn/m50003.mib");
});
