import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkQuest,
  parseQuest,
  QuestFormatError,
  serializeQuest,
} from "../src/quests/document.js";
import { sampleDoc, spawn } from "./quest-document-sample.js";

test("a document survives being written and read", () => {
  const doc = sampleDoc();
  const payload = serializeQuest(doc);
  assert.deepEqual(parseQuest(payload), doc);
  // And the file it makes is one the reader rebuilds byte for byte.
  const check = checkQuest(payload);
  assert.equal(check.exact, true);
  assert.equal(check.editable, true);
});

test("the layout is the disc's", () => {
  const payload = serializeQuest(sampleDoc());
  assert.equal(payload.readUInt32LE(0), 0x4c);
  assert.equal(payload.toString("latin1", 4, 8), "2NDG");
  // Strings start on 4-byte boundaries, right after the header.
  assert.equal(payload.toString("utf8", 0x80, 0x80 + 13), "EN title 1001");
  // Every section pointer is set, in file order: text, arena, script, supplies, ...
  const at = (o: number) => payload.readUInt32LE(o);
  const order = [
    at(0x60),
    at(0x7c),
    at(0x10),
    at(0x08),
    at(0x24),
    at(0x1c),
    at(0x0c),
    at(0x20),
    at(0x18),
    at(0x14),
  ];
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.ok(order.every((o) => o >= 0x80 && o % 4 === 0));
  // The file ends with the large monster table's 16 zero bytes.
  assert.ok(payload.subarray(-16).every((b) => b === 0));
  assert.equal(at(0x14) + 2 * 16, payload.length);
});

test("lists can grow and shrink", () => {
  const doc = sampleDoc();
  doc.large.push({ unk1: 1, unk2: 0, preload: [20, 21], spawns: [spawn(20), spawn(21)] });
  doc.supplies.push({ item: 7, amount: 2 });
  doc.rewards[0]!.items.pop();
  doc.gatherAreas[1]!.push({ ...doc.gatherAreas[1]![0]!, x: 99 });
  doc.text.blocks[1]![5] = "A client with a much longer name than before";
  doc.small.lists[0]!.areas.pop();
  assert.deepEqual(parseQuest(serializeQuest(doc)), doc);
});

test("sharing strings makes the file smaller and reads the same", () => {
  const doc = sampleDoc();
  const plain = serializeQuest(doc);
  const shared = serializeQuest(doc, { shareStrings: true });
  assert.ok(shared.length < plain.length);
  assert.deepEqual(parseQuest(shared), doc);
});

test("what doesn't fit the format is refused", () => {
  const doc = sampleDoc();
  doc.large[0]!.preload = [1, 2, 3, 4, 5];
  assert.throws(() => serializeQuest(doc), QuestFormatError);

  const bad = sampleDoc();
  bad.small.sets = [0, 0, 5];
  assert.throws(() => serializeQuest(bad), QuestFormatError);

  assert.equal(checkQuest(Buffer.alloc(0x200)).editable, false);
  const cut = serializeQuest(sampleDoc()).subarray(0, 0x300);
  assert.equal(checkQuest(Buffer.from(cut)).editable, false);
});
