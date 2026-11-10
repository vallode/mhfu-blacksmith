import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { Edits } from "../src/edits.js";
import {
  questRecords,
  readBoardRecords,
  readRecordText,
  recordBase,
  sharesStrings,
  type BoardFile,
} from "../src/game/board.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { deliveryTarget, readTerms, TARGET_ID, TARGET_NUM } from "../src/game/quest-fields.js";
import { randomize } from "../src/randomize.js";
import { Rng } from "../src/rng.js";
import { collectDeliveries, shuffleDeliveries } from "../src/shuffles/deliveries.js";
import { buildBoardFile, buildFixtureDisc, FIXTURE_QUESTS, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

const FILE = path.join(tempDir(), "disc.iso");
writeFileSync(FILE, buildFixtureDisc({ text: true }));

async function load(): Promise<{ game: GameData; close: () => void }> {
  const { source, iso } = openDiscImage(FILE);
  const game = await loadGame(source, iso, { eboot: null });
  return { game, close: () => source.close() };
}

const SEEDS = ["a", "b", "c", "d", "e", "f", "g", "h"];
const byId = (game: GameData, id: number) =>
  game.quests.find((q) => q.parsed.header.questId === id)!;
const boardData = (edits: Edits, board: BoardFile) => edits.files.get(board.index) ?? board.data;
/** Goal text by `LangPTRs` slot. */
const recordGoals = (data: Buffer, record: BoardFile["records"][number]) => {
  const text = readRecordText(data, record);
  return [0, 1, 2, 3, 4, 5, 6].map(
    (slot) => text.blocks.find((b) => b.slots.includes(slot))!.texts[1],
  );
};

test("the fixture's board records copy their quest's header", async () => {
  const { game, close } = await load();
  for (const quest of game.quests) {
    for (const { board, record } of questRecords(game.boards, quest.parsed.header.questId)) {
      assert.deepEqual(readTerms(board.data, recordBase(record)), readTerms(quest.file.payload));
      const at = recordBase(record) + TARGET_ID;
      assert.equal(board.data.readUInt16LE(at), quest.file.payload.readUInt16LE(TARGET_ID));
    }
  }
  close();
});

test("quest terms change on every board record the quest has", async () => {
  const { game, close } = await load();
  for (const seed of SEEDS) {
    const settings = settingsWith(seed, ["quest-money", "time-limits"]);
    const { edits, reports } = randomize(game, settings);
    let records = 0;
    for (const quest of game.quests) {
      const terms = readTerms(edits.questNow(quest));
      for (const { board, record } of questRecords(game.boards, quest.parsed.header.questId)) {
        const data = boardData(edits, board);
        assert.equal(data.length, board.data.length);
        assert.deepEqual(
          readTerms(data, recordBase(record)),
          terms,
          `${quest.parsed.header.questId}`,
        );
        records++;
      }
    }
    assert.ok(records >= 4, "2001 on two boards, 1001, 10101 and 10102 on one");
    const report = reports.find((r) => r.title === "Quest terms")!;
    assert.ok(report.notes.some((n) => /records in level\*\.mib/.test(n)));
    assert.ok(!report.lines.some((l) => /board/.test(l.text)), "no board copy differs");
  }
  close();
});

test("a delivery's board record gets the quest's new item, amount and goal line", async () => {
  const { game, close } = await load();
  const quest = byId(game, 10102);
  const { board, record } = questRecords(game.boards, 10102)[0]!;
  const other = board.records.find((r) => r.questId === 2001)!;
  for (const seed of SEEDS) {
    const { edits } = randomize(game, settingsWith(seed, ["deliveries"]));
    const target = deliveryTarget(edits.questNow(quest))!;
    assert.notEqual(target.itemId, 126);
    const data = boardData(edits, board);
    assert.equal(data.length, board.data.length);
    assert.equal(data.readUInt16LE(recordBase(record) + TARGET_ID), target.itemId);
    assert.equal(data.readUInt16LE(recordBase(record) + TARGET_NUM), target.amount);
    const name = target.itemId === 124 ? "Tranq S" : "Paint S";
    assert.deepEqual(recordGoals(data, record), Array(7).fill(`Deliver ${name} x2`));
    assert.equal(readRecordText(data, record).blocks[0]!.texts[0], "Fixture Delivery");
    // The other quest's record on the same board is untouched.
    assert.deepEqual(readRecordText(data, other).blocks, readRecordText(board.data, other).blocks);
    assert.ok(
      data
        .subarray(other.offset, record.offset)
        .equals(board.data.subarray(other.offset, record.offset)),
    );
  }
  close();
});

test("a delivery whose board record can't follow keeps its item, and says why", async () => {
  const { game, close } = await load();
  const quest = byId(game, 10102);
  const { board, record } = questRecords(game.boards, 10102)[0]!;
  const edits = new Edits(game);
  edits.dataFile(board.index).writeUInt16LE(999, recordBase(record) + TARGET_ID);
  const report = shuffleDeliveries(
    collectDeliveries(game.quests),
    new Rng("a"),
    edits,
    game.boards,
  );
  assert.deepEqual(deliveryTarget(edits.questNow(quest)), { itemId: 126, amount: 4 });
  assert.match(
    report.lines[0]!.text,
    /unchanged: its board record \(level2\.mib\) has a different target/,
  );
  close();
});

test("a record whose strings another record points into isn't rewritten", () => {
  const quests = [1001, 2001].map((id) => FIXTURE_QUESTS.find((q) => q.questId === id)!);
  const text = { title: "T", goal: "A goal line", otherGoal: "B" };
  const data = buildBoardFile(quests.map((q) => ({ ...q, text })));
  const records = readBoardRecords(data)!;
  const board: BoardFile = { index: 0, path: "mission_jpn/level1.mib", data, records };
  assert.equal(sharesStrings(data, board, records[0]!), false);
  // Point the second record's English goal at the first's.
  const [a, b] = records.map((r) => readRecordText(data, r).blocks[0]!);
  data.writeUInt32LE(a!.pointers[1]!, b!.offset + 4);
  assert.equal(sharesStrings(data, board, records[0]!), true);
  assert.equal(sharesStrings(data, board, records[1]!), true);
});
