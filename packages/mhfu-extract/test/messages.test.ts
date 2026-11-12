import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMessageFile,
  findMessages,
  readMessageFile,
  showMessage,
} from "../src/strings/messages.js";

/** A message file: count, 8, table offsets; each table's offsets (from its start), -1, strings. */
function messageFile(tables: string[][]): Buffer {
  const header = Buffer.alloc(8 + tables.length * 4);
  header.writeUInt32LE(tables.length, 0);
  header.writeUInt32LE(8, 4);
  const parts: Buffer[] = [header];
  let at = header.length;
  tables.forEach((strings, t) => {
    header.writeUInt32LE(at, 8 + t * 4);
    const list = Buffer.alloc(strings.length * 4 + 4);
    let rel = list.length;
    const bodies = strings.map((s, i) => {
      const body = Buffer.from(`${s}\0`, "utf8");
      list.writeUInt32LE(rel, i * 4);
      rel += body.length;
      return body;
    });
    list.writeUInt32LE(0xffffffff, strings.length * 4);
    parts.push(list, ...bodies);
    at += rel;
  });
  return Buffer.concat(parts);
}

test("message files are read table by table, with offsets from each table's start", () => {
  const buf = messageFile([
    ["", "If you'd like to train"],
    ["Hunt the \x01\x1b", "Jungle"],
  ]);
  const tables = readMessageFile(buf)!;
  assert.equal(tables.length, 2);
  assert.deepEqual(
    tables.map((t) => t.strings.map((s) => s.bytes.toString("utf8"))),
    [
      ["", "If you'd like to train"],
      ["Hunt the \x01\x1b", "Jungle"],
    ],
  );
  assert.equal(tables[0]!.offset, 16, "table 0 right after the header");
});

test("control bytes and new lines are shown escaped", () => {
  assert.equal(
    showMessage(Buffer.from("Hunt the \x01\x1b!\nentraîner", "utf8")),
    "Hunt the \\x01\\x1b!\\nentraîner",
  );
});

test("strings are found by a word in them", () => {
  const tables = readMessageFile(messageFile([["a", "the Jungle"], ["Jungle (Day)"]]))!;
  assert.deepEqual(findMessages(tables, "Jungle"), [
    { table: 0, index: 1, text: "the Jungle" },
    { table: 1, index: 0, text: "Jungle (Day)" },
  ]);
});

test("files that aren't message files are refused", () => {
  assert.equal(readMessageFile(Buffer.alloc(64)), null);
  const bad = Buffer.alloc(32);
  bad.writeUInt32LE(1, 0);
  bad.writeUInt32LE(8, 4);
  bad.writeUInt32LE(28, 8); // its list runs off the end without -1
  assert.equal(readMessageFile(bad), null);
});

test("a built message file reads back, with one more NUL after each table", () => {
  const tables = [["", "Max 60 shots."], ["Disp. máx. 60."]].map((t) =>
    t.map((s) => Buffer.from(s, "utf8")),
  );
  const buf = buildMessageFile(tables);
  const read = readMessageFile(buf)!;
  assert.deepEqual(
    read.map((t) => t.strings.map((s) => s.bytes.toString("utf8"))),
    [["", "Max 60 shots."], ["Disp. máx. 60."]],
  );
  const lastOfTable0 = read[0]!.strings[1]!;
  assert.equal(read[1]!.offset, lastOfTable0.offset + lastOfTable0.bytes.length + 2);
  assert.equal(buf.readUInt32LE(4), 8);
});
