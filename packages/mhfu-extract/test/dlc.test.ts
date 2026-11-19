import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { emitQuestsFile, questHub, QUEST_HUB_TO_FILE } from "../src/emit/quests.js";
import { isDlcQuestId, readCheatQuests, readDlcQuests } from "../src/quests/dlc.js";
import { encryptQuest, QUEST_MAGIC } from "../src/quests/mib.js";

/** A plaintext `.mib` with a header and one English text block, padded to whole words. */
function questPayload(id: number, title: string): Buffer {
  const buf = Buffer.alloc(1024);
  QUEST_MAGIC.copy(buf, 0);
  buf.writeUInt8(5, 68); // rank: G
  buf.writeUInt32LE(2500, 80); // fee
  buf.writeUInt32LE(30000, 84); // reward
  buf.writeUInt32LE(90000, 92); // time limit
  buf.writeUInt32LE(0x100, 96); // stringPtrTbl
  buf.writeUInt16LE(id, 100);
  buf.writeUInt8(11, 102); // stars
  buf.writeUInt8(14, 104); // map
  const block = 0x200;
  let at = block + 24;
  for (const [k, text] of [title, "Slay the Yama Tsukami", "Reward Zero", "", "", ""].entries()) {
    buf.writeUInt32LE(at, block + k * 4);
    at += buf.write(text, at, "utf8") + 1;
  }
  buf.writeUInt32LE(block, 0x100); // eng1
  return buf.subarray(0, Math.ceil((at + 4) / 4) * 4);
}

/** The cheat lines that write `payload` at `address`, as the archived cheat files do. */
function cheatLines(payload: Buffer, address = 0x10ae900): string[] {
  const lines: string[] = [];
  for (let i = 0; i < payload.length; i += 4) {
    const a = (0x20000000 + address + i).toString(16).toUpperCase();
    const v = payload.readUInt32LE(i).toString(16).toUpperCase().padStart(8, "0");
    lines.push(`_L 0x${a} 0x${v}`);
  }
  return lines;
}

/** Event Quests in the cheat file all carry Twin Terrors' ID; the heading has the real one. */
function asTwinTerrors(payload: Buffer): Buffer {
  const copy = Buffer.from(payload);
  copy.writeUInt16LE(60038, 100);
  return copy;
}

const MOUNTAIN = questPayload(60010, "Mountain in the Sky");
const CHALLENGE = questPayload(61001, "Challenge Quest 1");
const JP_MOUNTAIN = questPayload(60010, "浮かぶ山岳");

const CHEAT = [
  "﻿//_S ULES01213",
  "_C0 + + + DLC Event Quests MHFU: + + +",
  "_C0 <DLC MHFU=60010> Mountain in the Sky",
  ...cheatLines(asTwinTerrors(MOUNTAIN)),
  "_C0 + + + DLC Event Quests MHP2G: + + +",
  "_C0 <DLC MHP2G=60010> Yamatsukami {HR9}",
  ...cheatLines(asTwinTerrors(JP_MOUNTAIN)),
  "_C0 <DLC MHFU=61001>Challenge Quest 1",
  ...cheatLines(CHALLENGE, 0xc7b460),
  "_C0 + + + How to Enable DLC-Quests: + + +",
  "_C0  Have downloaded DLC Quest (DLC Slot 1)",
].join("\r\n");

test("readCheatQuests restores each quest's ID from its heading, for the region's game", () => {
  const eu = readCheatQuests(CHEAT, "eu");
  assert.deepEqual(
    eu.map((q) => q.source),
    ["<DLC MHFU=60010> Mountain in the Sky", "<DLC MHFU=61001>Challenge Quest 1"],
  );
  assert.deepEqual(eu[0]!.payload, MOUNTAIN);
  assert.deepEqual(eu[1]!.payload, CHALLENGE);

  const jp = readCheatQuests(CHEAT, "jp");
  assert.equal(jp.length, 1);
  assert.deepEqual(jp[0]!.payload, JP_MOUNTAIN);
});

test("readCheatQuests rejects a quest whose writes skip an address", () => {
  const lines = cheatLines(MOUNTAIN);
  lines.splice(3, 1);
  assert.throws(
    () => readCheatQuests(["_C0 <DLC MHFU=60010> Gap", ...lines].join("\n"), "eu"),
    /doesn't follow/,
  );
});

test("readDlcQuests reads a cheat file, sorted by quest ID", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dlc-cheat-"));
  try {
    const file = path.join(dir, "ULES01213.ini");
    await writeFile(file, CHEAT);
    const { quests, skipped } = readDlcQuests(file, "eu");
    assert.deepEqual(skipped, []);
    assert.deepEqual(
      quests.map((q) => [q.parsed.header.questId, q.parsed.strings?.title]),
      [
        [60010, "Mountain in the Sky"],
        [61001, "Challenge Quest 1"],
      ],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readDlcQuests reads a directory of plain and QuestCipher-wrapped .mib files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dlc-mib-"));
  try {
    await writeFile(path.join(dir, "m60010.mib"), MOUNTAIN);
    await writeFile(path.join(dir, "m61001.mib"), encryptQuest(CHALLENGE, "eu", [1, 2, 3, 4]));
    // A board quest isn't a download; a repeated ID keeps the first.
    await writeFile(path.join(dir, "m10001.mib"), questPayload(10001, "Village"));
    await writeFile(path.join(dir, "z60010.mib"), MOUNTAIN);
    await writeFile(path.join(dir, "notes.txt"), "not a quest");
    const { quests, skipped } = readDlcQuests(dir, "eu");
    assert.deepEqual(
      quests.map((q) => q.parsed.header.questId),
      [60010, 61001],
    );
    assert.deepEqual(quests[1]!.payload, CHALLENGE);
    assert.deepEqual(
      skipped.map((s) => s.source),
      ["m10001.mib", "z60010.mib"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("downloadable quests go on the Event and Challenge boards", () => {
  assert.equal(questHub(60010), "event");
  assert.equal(questHub(60038), "event");
  assert.equal(questHub(61001), "challenge");
  assert.equal(questHub(62000), null);
  assert.ok(isDlcQuestId(60001) && isDlcQuestId(61014) && !isDlcQuestId(4001));
});

test("emitQuestsFile writes the Event and Challenge files only when it has their quests", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dlc-emit-"));
  try {
    const file = path.join(dir, "ULES01213.ini");
    await writeFile(file, CHEAT);
    const output = emitQuestsFile(readDlcQuests(file, "eu").quests.map((q) => q.parsed));
    const [event] = output[QUEST_HUB_TO_FILE.event]!.quests;
    assert.deepEqual(
      [event?.id, event?.hub, event?.rank, event?.stars],
      [60010, "event", "g-rank", 11],
    );
    assert.equal(output[QUEST_HUB_TO_FILE.challenge]!.quests[0]?.hub, "challenge");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const none = emitQuestsFile([]);
  assert.ok(!(QUEST_HUB_TO_FILE.event in none));
  assert.ok(!(QUEST_HUB_TO_FILE.challenge in none));
  assert.ok(QUEST_HUB_TO_FILE.village in none);
});
