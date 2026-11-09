import assert from "node:assert/strict";
import { test } from "node:test";
import { discQuestIds } from "../src/cli/quest-flags.js";
import {
  findQuestIdLists,
  findSequenceTables,
  flagSequences,
  scanQuestFlags,
  summarizeEntries,
} from "../src/quests/flag-scan.js";
import {
  QUEST_FLAG_ANCHORS,
  QUEST_FLAG_BITS,
  SAVE_DERIVED_GROUPS,
  groupsToBitMap,
} from "../src/tables/quest-flags.js";

const questIds = discQuestIds();
const saveMap = groupsToBitMap(SAVE_DERIVED_GROUPS);

/** Deterministic noise, so a search has something to reject. */
function noise(length: number, seed = 1): Buffer {
  const buf = Buffer.alloc(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    buf[i] = x >>> 24;
  }
  return buf;
}

/** The save-derived layout as one entry per bit: quest ID, or `null` for an unused bit. */
function layoutEntries(): (number | null)[] {
  const entries: (number | null)[] = Array(QUEST_FLAG_BITS).fill(null);
  for (const [id, bit] of saveMap) entries[bit] = id;
  while (entries[entries.length - 1] === null) entries.pop();
  return entries;
}

test("the disc has 551 quest IDs", () => {
  assert.equal(questIds.size, 551);
  assert.ok(questIds.has(1001) && questIds.has(10001) && questIds.has(1));
});

test("the save-derived layout fits the field, the disc and the anchors", () => {
  const bits = [...saveMap.values()];
  assert.equal(new Set(bits).size, bits.length, "no two quests share a bit");
  assert.ok(bits.every((b) => b >= 0 && b < QUEST_FLAG_BITS));
  for (const id of saveMap.keys()) assert.ok(questIds.has(id), `${id} is not on the disc`);
  for (const [id, bit] of Object.entries(QUEST_FLAG_ANCHORS)) {
    assert.equal(saveMap.get(Number(id)), bit, `anchor ${id}`);
  }
});

test("summarizeEntries compresses runs and unused slots", () => {
  assert.equal(summarizeEntries([1, 2, 3, null, null, 7, 9]), "1-3 _x2 7 9");
});

test("finds a u16 list in bit order and places it with the anchors", () => {
  const buf = noise(0x4000);
  const base = 0x1002;
  layoutEntries().forEach((id, i) => buf.writeUInt16LE(id ?? 0xffff, base + i * 2));
  const hits = findQuestIdLists({ name: "eboot.bin", buf }, questIds);
  assert.equal(hits.length, 1, JSON.stringify(hits.map((h) => h.summary)));
  const [hit] = hits;
  assert.equal(hit!.offset, base);
  assert.equal(hit!.stride, 2);
  assert.equal(hit!.bitOfFirstEntry, 0);
  assert.deepEqual(hit!.anchorsMatched, [1001, 1004, 1005, 1020, 10001]);
  assert.deepEqual(hit!.vsSaves, {
    agree: saveMap.size,
    disagree: 0,
    notInSaves: 0,
    firstDisagreements: [],
  });
});

test("finds a list that is one field of a record, starting partway through the bits", () => {
  const buf = noise(0x4000, 7);
  const base = 0x800;
  const village = layoutEntries().slice(279);
  village.forEach((id, i) => {
    buf.writeUInt32LE(0x12345678, base + i * 8);
    buf.writeUInt16LE(id ?? 0, base + i * 8 + 4);
    buf.writeUInt16LE(0x4242, base + i * 8 + 6);
  });
  const hit = findQuestIdLists({ name: "game_task.ovl", buf }, questIds).find(
    (h) => h.offset === base + 4,
  );
  assert.ok(hit);
  assert.equal(hit.stride, 8);
  assert.equal(hit.bitOfFirstEntry, 279);
  assert.deepEqual(hit.anchorsMatched, [10001]);
  assert.equal(hit.vsSaves!.disagree, 0);
});

test("reports a list whose anchors disagree with the save layout", () => {
  const buf = noise(0x2000, 3);
  // Guild 1001-2127 in ID order with no unused bits: the saves leave two
  // unused bits before 2101, so ★7's 27 quests come out two bits early.
  const ids = [...saveMap.keys()].filter((id) => id >= 1001 && id < 2200).sort((a, b) => a - b);
  ids.forEach((id, i) => buf.writeUInt16LE(id, 0x100 + i * 2));
  const [hit] = findQuestIdLists({ name: "eboot.bin", buf }, questIds);
  assert.equal(hit!.bitOfFirstEntry, 19);
  assert.equal(hit!.vsSaves!.agree, 81);
  assert.equal(hit!.vsSaves!.disagree, 27);
  assert.equal(hit!.vsSaves!.firstDisagreements[0], "2101: table bit 100, saves 102");
});

test("random data has no quest ID lists", () => {
  assert.deepEqual(findQuestIdLists({ name: "noise", buf: noise(0x20000, 11) }, questIds), []);
});

test("finds a range table by its first IDs and first bits", () => {
  const buf = noise(0x4000, 5);
  const base = 0x2000;
  const guild = SAVE_DERIVED_GROUPS.filter((g) => g.firstId >= 1000 && g.firstId < 10000);
  guild.forEach((g, i) => {
    buf.writeUInt16LE(g.firstId, base + i * 8);
    buf.writeUInt16LE(g.firstBit, base + i * 8 + 2);
    buf.writeUInt16LE(g.count, base + i * 8 + 4);
    buf.writeUInt16LE(0, base + i * 8 + 6);
  });
  const hits = findSequenceTables({ name: "eboot.bin", buf }, flagSequences());
  const byName = (name: string) =>
    hits.find((h) => h.sequence === name && h.width === 2 && h.stride === 8);
  assert.equal(byName("guild first IDs")?.offset, base);
  assert.equal(byName("guild first IDs")?.length, guild.length);
  assert.equal(byName("guild first bits")?.offset, base + 2);
  assert.equal(byName("guild quest counts")?.offset, base + 4);
  // Each matched record plus one either side, dumped as hex.
  assert.equal(byName("guild first IDs")?.records.length, guild.length + 2);
});

test("scanQuestFlags ranks anchored lists first", () => {
  const plain = noise(0x2000, 9);
  const withList = noise(0x2000, 13);
  layoutEntries().forEach((id, i) => withList.writeUInt16LE(id ?? 0, 0x10 + i * 2));
  const unanchored = [3101, 3102, 3103, 3104, 3105, 3106, 3107, 3108, 3109, 3110, 3111, 3112];
  unanchored.forEach((id, i) => plain.writeUInt16LE(id, 0x400 + i * 2));
  const report = scanQuestFlags(
    [
      { name: "a", buf: plain },
      { name: "b", buf: withList },
    ],
    questIds,
  );
  assert.equal(report.idLists.length, 2);
  assert.equal(report.idLists[0]!.file, "b");
  assert.equal(report.idLists[1]!.bitOfFirstEntry, null);
});
