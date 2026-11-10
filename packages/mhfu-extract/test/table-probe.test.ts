import assert from "node:assert/strict";
import { test } from "node:test";
import { probeTable } from "../src/tables/probe.js";

/** Entry `i` of a made-up 20-byte-entry table: distinct, non-repeating bytes. */
function entry(i: number): Buffer {
  return Buffer.from(Array.from({ length: 20 }, (_, b) => (i * 31 + b * 7 + 1) & 0xff));
}

test("probeTable finds a moved table and splits it where an entry was inserted", () => {
  const reference = Buffer.concat([Buffer.alloc(64), ...[0, 1, 2, 3, 4, 5].map(entry)]);
  // The target keeps entries 0-2 at 0x100, inserts one, then has 3-5.
  const inserted = Buffer.alloc(20, 0x99);
  inserted[0] = 0x42;
  const target = Buffer.concat([
    Buffer.alloc(0x100),
    ...[0, 1, 2].map(entry),
    inserted,
    ...[3, 4, 5].map(entry),
  ]);
  const result = probeTable(reference, { name: "t", offset: 64, entrySize: 20, count: 6 }, target);
  assert.equal(result.needleSize, 20);
  assert.equal(result.searched, 6);
  assert.equal(result.unique, 6);
  assert.deepEqual(
    result.bases.map((b) => [b.offset, b.entries, b.firstIndex, b.lastIndex]),
    [
      [0x100, 3, 0, 2],
      [0x100 + 20, 3, 3, 5],
    ],
  );
});

test("probeTable searches short entries a run at a time and skips blank ones", () => {
  const reference = Buffer.from([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 0, 0, 0,
  ]);
  const target = Buffer.concat([Buffer.alloc(8, 0xee), reference]);
  const result = probeTable(
    reference,
    { name: "bytes", offset: 0, entrySize: 1, count: 20 },
    target,
  );
  assert.equal(result.needleSize, 16);
  assert.equal(result.bases[0]!.offset, 8);
  assert.equal(result.bases[0]!.entries, 5);
});

test("probeTable counts an entry found twice as ambiguous, not as a base", () => {
  const reference = entry(7);
  const target = Buffer.concat([entry(7), Buffer.alloc(4), entry(7)]);
  const result = probeTable(reference, { name: "t", offset: 0, entrySize: 20, count: 1 }, target);
  assert.equal(result.ambiguous, 1);
  assert.equal(result.unique, 0);
  assert.deepEqual(result.bases, []);
});
