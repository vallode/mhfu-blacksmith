import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import type { QuestHeader } from "mhfu-extract/src/quests/parser.js";
import { Edits } from "../src/edits.js";
import {
  questRecords,
  readBoardRecords,
  readRecordText,
  recordBase,
  rewriteRecordGoal,
  type BoardFile,
  type BoardRecord,
} from "../src/game/board.js";
import { loadGame, type GameData } from "../src/game/load.js";
import {
  deliveryTarget,
  readTerms,
  rewriteGoal,
  TARGET_ID,
  TARGET_NUM,
  writeTerms,
} from "../src/game/quest-fields.js";
import { readQuestText, writeQuestText } from "../src/game/quest-text.js";
import { randomize } from "../src/randomize.js";
import { Rng } from "../src/rng.js";
import { collectDeliveries, shuffleDeliveries } from "../src/shuffles/deliveries.js";
import { collectTermsSlots, randomizeTerms } from "../src/shuffles/terms.js";
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
const textOf = (data: Buffer, board: BoardFile, record: BoardRecord) =>
  readRecordText(data, board, record).text;
/** Goal text by `LangPTRs` slot. */
const recordGoals = (data: Buffer, board: BoardFile, record: BoardRecord) => {
  const text = textOf(data, board, record);
  return [0, 1, 2, 3, 4, 5, 6].map(
    (slot) => text.blocks.find((b) => b.slots.includes(slot))!.texts[1],
  );
};

/** A board file built on its own, with two records whose text is given. */
function twoRecords(goal: string): { data: Buffer; board: BoardFile; records: BoardRecord[] } {
  const quests = [1001, 2001].map((id) => FIXTURE_QUESTS.find((q) => q.questId === id)!);
  const data = buildBoardFile(
    quests.map((q) => ({ ...q, text: { title: "T", goal, otherGoal: "B" } })),
  );
  const records = readBoardRecords(data)!;
  return { data, board: { index: 0, path: "mission_jpn/level1.mib", data, records }, records };
}

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
    assert.equal(records, 6, "2001 and 10102 on two boards, 1001 and 10101 on one");
    const report = reports.find((r) => r.title === "Quest terms")!;
    assert.ok(
      report.notes.some((n) => /records in level\*\.mib\.$/.test(n)),
      "none kept",
    );
    assert.ok(!report.lines.some((l) => /board/.test(l.text)));
  }
  close();
});

test("a quest whose board copy of its terms differs keeps its terms, on the board too", async () => {
  const { game, close } = await load();
  const quest = byId(game, 1001);
  const { board, record } = questRecords(game.boards, 1001)[0]!;
  const edits = new Edits(game);
  const odd = { ...readTerms(board.data, recordBase(record)), fee: 12345 };
  writeTerms(edits.dataFile(board.index), odd, recordBase(record));
  const report = randomizeTerms(
    collectTermsSlots(game.quests),
    { moneySpread: 0.5, timeSpread: 0.3 },
    { money: new Rng("m"), time: new Rng("t") },
    edits,
    game.boards,
  );
  assert.deepEqual(readTerms(edits.questNow(quest)), readTerms(quest.file.payload));
  assert.deepEqual(readTerms(edits.dataFile(board.index), recordBase(record)), odd);
  const line = report.lines.find((l) => l.where.includes("1001"))!;
  assert.match(line.text, /unchanged: its board record \(level1\.mib\) has different terms/);
  assert.ok(report.notes.some((n) => /1 quests keep their terms/.test(n)));
  close();
});

test("a delivery's board records get the quest's new item, amount and goal line", async () => {
  const { game, close } = await load();
  const quest = byId(game, 10102);
  const records = questRecords(game.boards, 10102);
  assert.equal(records.length, 2, "on two boards");
  for (const seed of SEEDS) {
    const { edits } = randomize(game, settingsWith(seed, ["deliveries"]));
    const target = deliveryTarget(edits.questNow(quest))!;
    assert.notEqual(target.itemId, 126);
    const name = target.itemId === 124 ? "Tranq S" : "Paint S";
    for (const { board, record } of records) {
      const data = boardData(edits, board);
      assert.equal(data.length, board.data.length);
      assert.equal(data.readUInt16LE(recordBase(record) + TARGET_ID), target.itemId);
      assert.equal(data.readUInt16LE(recordBase(record) + TARGET_NUM), target.amount);
      assert.deepEqual(recordGoals(data, board, record), Array(7).fill(`Deliver ${name} x2`));
      assert.equal(textOf(data, board, record).blocks[0]!.texts[0], "Fixture Delivery");
      // The other quests' records on the board are untouched.
      for (const other of board.records.filter((r) => r !== record)) {
        assert.deepEqual(
          textOf(data, board, other).blocks,
          textOf(board.data, board, other).blocks,
        );
        const header = (b: Buffer) => b.subarray(other.offset, other.offset + 0x34);
        assert.ok(header(data).equals(header(board.data)));
      }
    }
  }
  close();
});

test("a delivery whose board record can't follow keeps its item, and says why", async () => {
  const { game, close } = await load();
  const quest = byId(game, 10102);
  const { board, record } = questRecords(game.boards, 10102)[1]!;
  const run = (edit: (data: Buffer) => void) => {
    const edits = new Edits(game);
    edit(edits.dataFile(board.index));
    const report = shuffleDeliveries(
      collectDeliveries(game.quests),
      new Rng("a"),
      edits,
      game.boards,
    );
    assert.deepEqual(deliveryTarget(edits.questNow(quest)), { itemId: 126, amount: 4 });
    assert.ok(report.notes.some((n) => /1 quests keep their item because a board record/.test(n)));
    return report.lines[0]!.text;
  };
  // A different copy of the target.
  assert.match(
    run((data) => data.writeUInt16LE(999, recordBase(record) + TARGET_ID)),
    /unchanged: its board record \(level2\.mib\) has a different target/,
  );
  // Goal lines too short for any new one: the English goal cut to 5 bytes,
  // the other languages' is "Kurz".
  const english = textOf(board.data, board, record).blocks.find((b) => b.slots.includes(1))!;
  assert.match(
    run((data) => data.writeUInt8(0, english.pointers[1]! + 5)),
    /unchanged: its board record \(level2\.mib\) has no room for the goal line$/,
  );
  close();
});

test("text that shares bytes with another record's is locked, on both records", () => {
  const { data, board, records } = twoRecords("A goal line");
  const [a, b] = records.map((r) => textOf(data, board, r));
  assert.equal(a!.locked, null);
  assert.equal(b!.locked, null);
  // Point the second record's English goal at the first's.
  data.writeUInt32LE(a!.blocks[0]!.pointers[1]!, b!.blocks[0]!.offset + 4);
  const before = Buffer.from(data);
  for (const record of records) {
    const read = readRecordText(data, board, record);
    assert.match(read.text.locked ?? "", /share bytes with another quest's/);
    assert.equal(
      writeQuestText(data, read.text, new Map([[read.text.blocks[0]!.pointers[1]!, "x"]])),
      false,
    );
    assert.equal(rewriteRecordGoal(data, record, read, "Deliver x"), false);
  }
  assert.ok(data.equals(before), "nothing written");
});

test("rewriteGoal leaves a goal string in reserved bytes and points its languages away", () => {
  // English (slots 0, 1, 6) and the other languages each have a block; the
  // English goal at 0x84 is reserved (someone else's).
  const data = Buffer.alloc(0x100);
  const write = (at: number, t: string) => data.write(t, at);
  write(0x80, "T");
  write(0x84, "A long goal");
  write(0x90, "Another long goal");
  const block = (at: number, goal: number) =>
    [0x80, goal, 0x80, 0x80, 0x80, 0x80].forEach((p, i) => data.writeUInt32LE(p, at + i * 4));
  block(0xb0, 0x84);
  block(0xc8, 0x90);
  [0xb0, 0xb0, 0xc8, 0xc8, 0xc8, 0xc8, 0xb0].forEach((b, i) => data.writeUInt32LE(b, 0xe0 + i * 4));
  const ok = rewriteGoal(data, "Deliver x", {
    table: 0xe0,
    floor: 0x80,
    reserved: [[0x84, 0x90]],
  });
  assert.equal(ok, true);
  assert.equal(data.toString("utf8", 0x84, 0x8f), "A long goal", "the reserved goal is kept");
  assert.equal(data.toString("utf8", 0x90, 0x99), "Deliver x");
  assert.equal(data.readUInt32LE(0xb0 + 4), 0x90, "English points at the new line");
});

test("padding that's another record's isn't room to grow or repack into", () => {
  // One block for every language: a 3-byte goal, its NUL, then 4 zero bytes
  // that are someone else's (reserved).
  const data = Buffer.alloc(0x100);
  const strings = [0x80, 0x84, 0x8c, 0x90, 0x94, 0x98];
  ["T", "abc", "F", "D", "M", "C"].forEach((t, i) => data.write(t, strings[i]!));
  strings.forEach((ptr, i) => data.writeUInt32LE(ptr, 0xc0 + i * 4));
  for (let i = 0; i < 7; i++) data.writeUInt32LE(0xc0, 0xe0 + i * 4);
  const header = { stringPtrTbl: 0xe0 } as QuestHeader;
  const grow = new Map([[0x84, "abcd"]]);
  assert.equal(writeQuestText(Buffer.from(data), readQuestText(data, header), grow), true);
  const text = readQuestText(data, header, 0x80, [[0x88, 0x8c]]);
  assert.equal(text.locked, null);
  assert.ok(text.unmovable, "the reserved bytes sit between two strings");
  const copy = Buffer.from(data);
  assert.equal(writeQuestText(copy, text, grow), false);
  assert.ok(copy.equals(data));
  // In place still works.
  assert.equal(writeQuestText(copy, text, new Map([[0x84, "xyz"]])), true);
  assert.equal(copy.toString("utf8", 0x84, 0x87), "xyz");
});
