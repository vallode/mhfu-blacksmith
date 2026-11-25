/** quests/fishing.ts: a stage overlay's fishing tables. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOvl } from "../src/container/ovl.js";
import { readFishTables } from "../src/quests/fishing.js";

const LOAD_BASE = 0x09d63000;

/** An MWo3 overlay with the six tables and their pointer list. */
function overlay(tables: [weight: number, fish: number][][]): Buffer {
  const buf = Buffer.alloc(0x400);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(LOAD_BASE, 8);
  let at = 0x80;
  const pointers = tables.map((pairs) => {
    const pointer = LOAD_BASE + at;
    for (const [weight, fish] of pairs) {
      buf[at++] = weight;
      buf[at++] = fish;
    }
    buf[at++] = 0xff;
    at++; // padded to the next table
    return pointer;
  });
  at = (at + 3) & ~3;
  pointers.forEach((pointer, i) => buf.writeUInt32LE(pointer, at + i * 4));
  buf.writeUInt32LE(0, at + pointers.length * 4);
  return buf;
}

test("readFishTables reads a stage's six ranks, skipping nothing-catches", () => {
  const tables = readFishTables(
    parseOvl(
      overlay([
        [
          [60, 0],
          [40, 12],
        ], // one draw gives nothing
        [[100, 1]], // Knife Mackerel
        [[100, 13]], // Goldenfish
        [
          [50, 29],
          [50, 30],
        ], // Treasure fish: Pickaxe and Bugnet
        [
          [50, 1],
          [50, 2],
        ], // Training: Knife Mackerel and Sushifish
        [
          [95, 14],
          [5, 15],
        ], // Silverfish and Ancient Fish
      ]),
    ),
  )!;
  assert.deepEqual(
    tables.map((table) => table.map(({ itemId, chance }) => [itemId, chance])),
    [
      [[240, 40]],
      [[229, 100]],
      [[241, 100]],
      [
        [1225, 50],
        [1226, 50],
      ],
      [
        [229, 50],
        [230, 50],
      ],
      [
        [242, 95],
        [243, 5],
      ],
    ],
  );
});

test("readFishTables ignores an overlay without a fishing table list", () => {
  const buf = Buffer.alloc(0x200);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(LOAD_BASE, 8);
  assert.equal(readFishTables(parseOvl(buf)), null);
});

test("readFishTables rejects a table whose weights aren't 100", () => {
  assert.equal(
    readFishTables(
      parseOvl(overlay([[[100, 1]], [[100, 1]], [[100, 1]], [[100, 1]], [[100, 1]], [[99, 14]]])),
    ),
    null,
  );
});
