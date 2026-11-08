import assert from "node:assert/strict";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import {
  parseQuest,
  readLargeMonsters,
  readQuestHeader,
  readQuestStrings,
  readRewards,
  readSmallMonsters,
  readSupplies,
} from "../src/quests/parser.js";
import { fixtureReader } from "./helpers.js";

test("readQuestHeader decodes every field at its documented byte offset", () => {
  const { buf, reader } = fixtureReader(128);
  buf.writeUInt32LE(676, 8); // suppliesPtr
  buf.writeUInt32LE(2560, 12); // rewardsPtr
  buf.writeUInt32LE(564, 16); // questScriptPtr
  buf.writeUInt32LE(4808, 20); // largeMonPtr
  buf.writeUInt32LE(4656, 24); // smallMonPtr
  buf.writeUInt8(0, 68); // rank
  buf.writeUInt8(4, 75); // attackRoll
  buf.writeUInt32LE(4, 76); // questType
  buf.writeUInt32LE(100, 80); // fee
  buf.writeUInt32LE(1200, 84); // reward
  buf.writeUInt32LE(400, 88); // penalty
  buf.writeUInt32LE(90000, 92); // timeLimit
  buf.writeUInt32LE(536, 96); // stringPtrTbl
  buf.writeUInt16LE(1, 100); // questId
  buf.writeUInt8(1, 102); // questStars
  buf.writeUInt8(11, 104); // map
  buf.writeUInt16LE(77, 112); // targetId
  buf.writeUInt16LE(1, 114); // targetNum

  const header = readQuestHeader(reader);
  assert.equal(header.suppliesPtr, 676);
  assert.equal(header.rewardsPtr, 2560);
  assert.equal(header.largeMonPtr, 4808);
  assert.equal(header.smallMonPtr, 4656);
  assert.equal(header.fee, 100);
  assert.equal(header.reward, 1200);
  assert.equal(header.penalty, 400);
  assert.equal(header.timeLimit, 90000);
  assert.equal(header.questId, 1);
  assert.equal(header.questStars, 1);
  assert.equal(header.map, 11);
  assert.equal(header.targetId, 77);
  assert.equal(header.targetNum, 1);
});

test("readSupplies stops at the first zero itemId", () => {
  const { buf, reader } = fixtureReader(64);
  const header = { suppliesPtr: 16 } as ReturnType<typeof readQuestHeader>;
  buf.writeUInt16LE(863, 16);
  buf.writeUInt16LE(1, 18);
  buf.writeUInt16LE(867, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt16LE(0, 24); // terminator

  const supplies = readSupplies(reader, header);
  assert.deepEqual(supplies, [
    { itemId: 863, amount: 1 },
    { itemId: 867, amount: 2 },
  ]);
});

test("readSupplies returns [] when suppliesPtr is 0 (absent)", () => {
  const { reader } = fixtureReader(8);
  const header = { suppliesPtr: 0 } as ReturnType<typeof readQuestHeader>;
  assert.deepEqual(readSupplies(reader, header), []);
});

test("readRewards decodes RewardTBL entries and their nested RewardItem lists", () => {
  const { buf, reader } = fixtureReader(64);
  const header = { rewardsPtr: 16 } as ReturnType<typeof readQuestHeader>;

  // RewardTBL[0]: unkn1/unkn2 (kept raw) + itemsPtr -> 32.
  buf.writeUInt16LE(32768, 16);
  buf.writeUInt16LE(1280, 18);
  buf.writeUInt32LE(32, 20);
  // RewardTBL terminator (checked at offset 24, the position after entry 0).
  buf.writeUInt16LE(0xffff, 24);

  buf.writeUInt16LE(1, 32); // chance
  buf.writeUInt16LE(345, 34); // itemId
  buf.writeUInt16LE(1, 36); // amount
  buf.writeUInt16LE(25, 38);
  buf.writeUInt16LE(342, 40);
  buf.writeUInt16LE(1, 42);
  buf.writeUInt16LE(0xffff, 44); // item terminator

  const rewards = readRewards(reader, header);
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0]!.unkn1, 32768);
  assert.equal(rewards[0]!.unkn2, 1280);
  assert.equal(rewards[0]!.itemsPtr, 32);
  assert.deepEqual(rewards[0]!.items, [
    { chance: 1, itemId: 345, amount: 1 },
    { chance: 25, itemId: 342, amount: 1 },
  ]);
});

test("readRewards returns [] when rewardsPtr is 0", () => {
  const { reader } = fixtureReader(8);
  const header = { rewardsPtr: 0 } as ReturnType<typeof readQuestHeader>;
  assert.deepEqual(readRewards(reader, header), []);
});

test("readLargeMonsters flattens every LargeMonTable's monster data", () => {
  const { buf, reader } = fixtureReader(128);
  const header = { largeMonPtr: 16 } as ReturnType<typeof readQuestHeader>;

  // LargeMonTable[0]: Unkn1(4) Unkn2(4) emLgIDLPTR(4) emLgDataPTR(4) -> data at 64.
  // Unkn1 must be nonzero, since the array-continuation check reads it.
  buf.writeUInt32LE(1, 16 + 0);
  buf.writeUInt32LE(64, 16 + 12);
  // LargeMonTable array terminator at offset 32 (16 + 16).
  buf.writeUInt16LE(0, 32);

  // LargeMonData[0] @ 64: Monster(2) Empty1(2) Quantity(1) Power(1) Attr1(1) Attr2(1) Stage(2) ...
  buf.writeUInt16LE(77, 64);
  buf.writeUInt8(1, 68); // quantity
  buf.writeUInt8(4, 69); // power
  buf.writeUInt16LE(97, 72); // stage
  // Terminator (signed -1) at the next 60-byte slot.
  buf.writeInt16LE(-1, 64 + 60);

  const monsters = readLargeMonsters(reader, header);
  assert.deepEqual(monsters, [{ monsterId: 77, quantity: 1, power: 4, stage: 97 }]);
});

test("readSmallMonsters walks the index -> table -> data pointer chain", () => {
  const { buf, reader } = fixtureReader(256);
  const header = { smallMonPtr: 16 } as ReturnType<typeof readQuestHeader>;

  // SmallMonIndex[0]: a single u32 pointer to a SmallMonTable run at 64.
  buf.writeUInt32LE(64, 16);
  // SmallMonIndex array terminator at offset 20.
  buf.writeUInt16LE(0, 20);

  // SmallMonTable[0] @ 64: StageID(2) Empty(2) NULL(4) emSmIDLPTR(4) emSmDataPTR(4) -> data at 128.
  buf.writeUInt16LE(93, 64);
  buf.writeUInt32LE(128, 64 + 12);
  // SmallMonTable run terminator (4-byte zero) at offset 80 (64 + 16).
  buf.writeUInt32LE(0, 80);

  // SmallMonData[0] @ 128.
  buf.writeUInt16LE(35, 128); // Giaprey
  buf.writeUInt8(3, 132); // quantity
  buf.writeUInt8(1, 133); // power
  // Terminator.
  buf.writeUInt16LE(0xffff, 128 + 60);

  const tables = readSmallMonsters(reader, header);
  assert.equal(tables.length, 1);
  assert.equal(tables[0]!.stageId, 93);
  assert.deepEqual(tables[0]!.monsters, [{ monsterId: 35, quantity: 3, power: 1 }]);
});

test("readSmallMonsters returns [] when smallMonPtr is 0", () => {
  const { reader } = fixtureReader(8);
  const header = { smallMonPtr: 0 } as ReturnType<typeof readQuestHeader>;
  assert.deepEqual(readSmallMonsters(reader, header), []);
});

test("readQuestStrings decodes UTF-8 text through the LangPTRs -> StringPTRs pointer chain", () => {
  const { buf, reader } = fixtureReader(512);
  const header = { stringPtrTbl: 16 } as ReturnType<typeof readQuestHeader>;

  // LangPTRs @ 16: 7 slots, only eng1 populated (-> StringPTRs @ 64).
  buf.writeUInt32LE(64, 16 + 0); // eng1PTR
  // all other slots stay 0.

  // StringPTRs @ 64: 6 pointers (title/goal/fail/details/monsters/client),
  // spaced 64 bytes apart to comfortably fit multi-byte UTF-8 + NUL.
  buf.writeUInt32LE(128, 64 + 0);
  buf.writeUInt32LE(192, 64 + 4);
  // fail/details/monsters left as null pointers (0) to test that path too.
  buf.writeUInt32LE(256, 64 + 20); // clientPTR

  const title = Buffer.from("強敵、ドスギアノス現る！", "utf8");
  title.copy(buf, 128);
  buf.writeUInt8(0, 128 + title.length);

  const goal = Buffer.from("Hunt 1 Giadrome", "utf8");
  goal.copy(buf, 192);
  buf.writeUInt8(0, 192 + goal.length);

  const client = Buffer.from("An energetic young boy", "utf8");
  client.copy(buf, 256);
  buf.writeUInt8(0, 256 + client.length);

  const all = readQuestStrings(reader, header);
  assert.equal(Object.keys(all).length, 1);
  assert.equal(all.eng1!.title, "強敵、ドスギアノス現る！");
  assert.equal(all.eng1!.goal, "Hunt 1 Giadrome");
  assert.equal(all.eng1!.fail, "");
  assert.equal(all.eng1!.client, "An energetic young boy");
});

test("parseQuest assembles every sub-reader's output from a full header", () => {
  const { reader } = fixtureReader(128);
  const header = readQuestHeader(reader);
  // With every pointer field left at 0, every section should come back empty/null, not throw.
  const parsed = parseQuest(reader.buf);
  assert.deepEqual(parsed.supplies, []);
  assert.deepEqual(parsed.rewards, []);
  assert.deepEqual(parsed.largeMonsters, []);
  assert.deepEqual(parsed.smallMonsters, []);
  assert.equal(parsed.strings, null);
  assert.equal(parsed.header.suppliesPtr, header.suppliesPtr);
});
