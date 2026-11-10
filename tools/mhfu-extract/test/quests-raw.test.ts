import assert from "node:assert/strict";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import { dumpQuestRaw } from "../src/emit/quests-raw.js";
import { parseQuest, readQuestHeader, readStringLayout } from "../src/quests/parser.js";

/** A header, one large and one small monster record, and two language slots sharing a block. */
function questPayload(): Buffer {
  const buf = Buffer.alloc(0x300);
  buf.writeUInt32LE(0x100, 20); // largeMonPtr
  buf.writeUInt32LE(0x180, 24); // smallMonPtr
  buf.writeUInt32LE(0x0102_0304, 56); // MonSizeModifier
  buf.writeUInt32LE(0x200, 96); // stringPtrTbl

  buf.writeUInt32LE(1, 0x100); // LargeMonTable
  buf.writeUInt32LE(0x140, 0x10c);
  buf.writeUInt16LE(7, 0x140); // LargeMonData: emID 7
  buf[0x144] = 1;
  buf[0x146] = 0xaa; // attr1
  buf[0x147] = 0xbb; // attr2
  buf.writeUInt32LE(0xdeadbeef, 0x140 + 0x30); // a DynamicData2 word
  buf.writeInt16LE(-1, 0x140 + 60);

  buf.writeUInt32LE(0x1c0, 0x180); // SmallMonIndex -> table
  buf.writeUInt16LE(1, 0x1c0);
  buf.writeUInt32LE(0x1e0 - 60, 0x1c0 + 12); // data list overlaps nothing else
  buf.writeUInt16LE(35, 0x1e0 - 60);
  buf.writeUInt16LE(0xffff, 0x1e0);

  buf.writeUInt32LE(0x220, 0x200); // slot 0
  buf.writeUInt32LE(0x220, 0x204); // slot 1 shares the block
  buf.writeUInt32LE(0x250, 0x220); // title
  buf.write("Title\0Goal\0", 0x250, "utf8");
  buf.writeUInt32LE(0x256, 0x224); // goal
  return buf;
}

test("readStringLayout lists each block once with every string's offset and length", () => {
  const buf = questPayload();
  const reader = new BinaryReader(buf);
  const layout = readStringLayout(reader, readQuestHeader(reader));
  assert.equal(layout.table, 0x200);
  assert.deepEqual(layout.blocks, [0x220, 0x220, 0, 0, 0, 0, 0]);
  assert.deepEqual(layout.strings, [
    { block: 0x220, pointers: [0x250, 0x256, 0, 0, 0, 0], lengths: [5, 4, 0, 0, 0, 0] },
  ]);
});

test("the raw quest dump has whole monster records and the text layout, but no text", () => {
  const buf = questPayload();
  const entry = dumpQuestRaw("mission_jpn/m00001.mib", buf, parseQuest(buf), 2048);
  assert.equal(entry.entrySize, 2048);
  assert.equal(entry.headerWords[14], 0x0102_0304);
  assert.equal(entry.largeMonsterRecords.length, 1);
  const record = entry.largeMonsterRecords[0]!;
  assert.equal(record.length, 15);
  assert.equal(record[0], 7);
  assert.equal(record[1], 0xbbaa_0001);
  assert.equal(record[12], 0xdeadbeef);
  assert.deepEqual(
    entry.smallMonsterRecords.map((r) => r[0]),
    [35],
  );
  assert.equal(entry.strings.strings[0]!.lengths[0], 5);
  assert.ok(!JSON.stringify(entry).includes("Title"));
});
