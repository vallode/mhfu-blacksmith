import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTextScan, scanQuestText } from "../src/quests/text-scan.js";

/** A .pac with one entry: a table of string offsets (entry-relative), then the strings. */
function messagePac(strings: string[]): { buf: Buffer; offsets: number[] } {
  const tableSize = strings.length * 4;
  const bodies = strings.map((s) => Buffer.from(`${s}\0`, "utf8"));
  const entry = Buffer.alloc(tableSize + bodies.reduce((n, b) => n + b.length, 0));
  let at = tableSize;
  const offsets = bodies.map((b, i) => {
    entry.writeUInt32LE(at, i * 4);
    b.copy(entry, at);
    at += b.length;
    return at - b.length;
  });
  const header = Buffer.alloc(12);
  header.writeUInt32LE(1, 0);
  header.writeUInt32LE(12, 4);
  header.writeUInt32LE(entry.length, 8);
  return { buf: Buffer.concat([header, entry]), offsets };
}

test("a quest's string is found in a message .pac along with the table that points at it", () => {
  const { buf, offsets } = messagePac([
    "Hunt the Rathian",
    "Hunt Down the Velocidrome!",
    "Rathian",
  ]);
  const [result] = scanQuestText(
    [{ name: "msg.pac", buf }],
    [{ label: "English title", text: "Hunt Down the Velocidrome!" }],
  );
  assert.equal(result!.hits.length, 1);
  const hit = result!.hits[0]!;
  assert.equal(hit.offset, 12 + offsets[1]!);
  assert.equal(hit.terminated, true);
  assert.deepEqual(hit.entry, { index: 0, start: 12, offset: offsets[1] });
  assert.deepEqual(
    hit.pointers.map((p) => [p.at, p.base]),
    [[12 + 4, "entry"]],
    "the second table slot holds its entry-relative offset",
  );
  assert.match(formatTextScan([result!]), /msg\.pac @0x[0-9a-f]+, pac entry 0 \+0x[0-9a-f]+/);
});

test("a string that's only part of a longer one is reported without a NUL", () => {
  const { buf } = messagePac(["Hunt the Rathian"]);
  const [result] = scanQuestText([{ name: "msg.pac", buf }], [{ label: "x", text: "the Rath" }]);
  assert.equal(result!.hits[0]!.terminated, false);
});
