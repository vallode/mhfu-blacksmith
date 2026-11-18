import assert from "node:assert/strict";
import { test } from "node:test";
import { findMessages, readMessageFile, showMessage } from "../src/strings/messages.js";
import { messageFile } from "./helpers.js";

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
