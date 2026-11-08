import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readQuestsFromUnpackedDir } from "../src/cli/extract.js";
import { loadFileList } from "../src/container/filelist.js";
import { listQuestFiles, readAllQuests } from "../src/quests/discovery.js";
import { encryptQuest, QUEST_MAGIC } from "../src/quests/mib.js";

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

test("EU quest files sit 32 entries after their JP indices (vallode/mhfu-blacksmith#36)", () => {
  const jp = listQuestFiles("jp");
  const eu = listQuestFiles("eu");
  assert.deepEqual(
    eu.map((f) => f.path),
    jp.map((f) => f.path),
  );
  for (let i = 0; i < eu.length; i++) assert.equal(eu[i]!.index, jp[i]!.index + 32);
  // An EU unpack named with JP indices put the last 32 real quests
  // (m30070 onwards) under names that aren't quest files at all, and named
  // 32 non-quest entries m00001..m01013. That's why the old run skipped 32.
  const firstLost = eu.findIndex((f) => f.path === "mission_jpn/m30070.mib");
  assert.equal(eu.length - firstLost, 32);
  assert.doesNotMatch(loadFileList("jp").get(eu[firstLost]!.index)!, /^mission_jpn\/m\d+\.mib$/);
});

/** A minimal decrypted quest: the header magic, a quest ID and one reward table. */
function syntheticQuest(questId: number): Buffer {
  const buf = Buffer.alloc(192);
  QUEST_MAGIC.copy(buf, 0);
  buf.writeUInt32LE(128, 12); // rewardsPtr
  buf.writeUInt16LE(questId, 100);
  buf.writeUInt16LE(0x8000, 128); // RewardTBL[0].Unkn1
  buf.writeUInt16LE(0x0500, 130); // RewardTBL[0].Unkn2
  buf.writeUInt32LE(144, 132); // items
  buf.writeUInt16LE(0xffff, 136); // RewardTBL terminator
  buf.writeUInt16LE(100, 144); // chance
  buf.writeUInt16LE(345, 146); // itemId
  buf.writeUInt16LE(2, 148); // amount
  buf.writeUInt16LE(0xffff, 150); // RewardItem terminator
  return buf;
}

test("readAllQuests reads EU quests at their EU DATA.BIN indices", () => {
  const files = [] as { index: number; data: Buffer }[];
  files[4791] = { index: 4791, data: encryptQuest(syntheticQuest(1), "eu") };
  const { quests, skipped } = readAllQuests(files as never, "eu");
  assert.equal(quests.length, 1);
  assert.equal(quests[0]!.header.questId, 1);
  assert.equal(skipped.length, 550);
  assert.ok(skipped.every((s) => s.reason === "missing from DATA.BIN TOC"));
});

test("readQuestsFromUnpackedDir decrypts quests by their region's file names and dumps raw reward tables", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "mhfu-quests-"));
  try {
    const questDir = path.join(dir, "data-bin", "mission_jpn");
    await mkdir(questDir, { recursive: true });
    await writeFile(path.join(questDir, "m30070.mib"), encryptQuest(syntheticQuest(30070), "eu"));
    // A JP-salted file fails EU's SHA1 check and is reported, not thrown.
    await writeFile(path.join(questDir, "m30071.mib"), encryptQuest(syntheticQuest(30071), "jp"));

    const { quests, skipped, raw } = await readQuestsFromUnpackedDir(dir, "eu");
    assert.deepEqual(
      quests.map((q) => q.header.questId),
      [30070],
    );
    assert.equal(skipped.length, 550);
    assert.match(skipped.find((s) => s.path === "mission_jpn/m30071.mib")!.reason, /SHA1/);

    assert.equal(raw.length, 1);
    assert.equal(raw[0]!.path, "mission_jpn/m30070.mib");
    assert.equal(raw[0]!.headerWords.length, 32);
    assert.deepEqual(raw[0]!.rewards, [
      { unkn1: 0x8000, unkn2: 0x0500, itemsPtr: 144, items: [[100, 345, 2]] },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
