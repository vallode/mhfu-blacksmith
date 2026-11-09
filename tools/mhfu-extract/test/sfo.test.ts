import assert from "node:assert/strict";
import { test } from "node:test";
import { detectRegion, parseSfo } from "../src/container/sfo.js";

/** A PARAM.SFO with string entries; `usedLen` overrides an entry's recorded length. */
function buildSfo(entries: { key: string; value: string; maxLen: number; usedLen?: number }[]) {
  const keyTable = Buffer.from(entries.map((e) => `${e.key}\0`).join(""), "latin1");
  const keyTableStart = 0x14 + entries.length * 16;
  const dataTableStart = keyTableStart + keyTable.length;
  const index = Buffer.alloc(keyTableStart);
  index.writeUInt32LE(0x46535000, 0);
  index.writeUInt32LE(keyTableStart, 0x08);
  index.writeUInt32LE(dataTableStart, 0x0c);
  index.writeUInt32LE(entries.length, 0x10);
  const data: Buffer[] = [];
  let keyOffset = 0;
  let dataOffset = 0;
  entries.forEach((e, i) => {
    const at = 0x14 + i * 16;
    index.writeUInt16LE(keyOffset, at);
    index.writeUInt16LE(0x0204, at + 2);
    index.writeUInt32LE(e.usedLen ?? e.value.length + 1, at + 4);
    index.writeUInt32LE(e.maxLen, at + 8);
    index.writeUInt32LE(dataOffset, at + 12);
    const field = Buffer.alloc(e.maxLen);
    field.write(e.value, "utf8");
    data.push(field);
    keyOffset += e.key.length + 1;
    dataOffset += e.maxLen;
  });
  return Buffer.concat([index, keyTable, ...data]);
}

test("parseSfo reads a string past a stale recorded length (FUComplete's TITLE)", () => {
  const title = "MONSTER HUNTER FREEDOM UNITE COMPLETE v1.4.0";
  const sfo = parseSfo(
    buildSfo([
      { key: "DISC_ID", value: "ULJM05500", maxLen: 16 },
      // The retail title's length (29 characters and a NUL), left by the patcher.
      { key: "TITLE", value: title, maxLen: 128, usedLen: 30 },
    ]),
  );
  assert.equal(sfo.get("TITLE"), title);
  assert.deepEqual(detectRegion(sfo), { region: "jp", discId: "ULJM05500" });
});
