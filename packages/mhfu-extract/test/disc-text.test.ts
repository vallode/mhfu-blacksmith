import assert from "node:assert/strict";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import { buildDiscText, plainText } from "../src/strings/disc-text.js";
import type { MessageTable } from "../src/strings/messages.js";
import {
  DESCRIPTION_INDEX_COUNTS,
  DESCRIPTION_INDEX_SLOTS,
  readDescriptionIndexes,
  type DescriptionIndexes,
} from "../src/tables/descriptions.js";

const table = (strings: string[]): MessageTable => ({
  offset: 0,
  strings: strings.map((s) => ({ offset: 0, bytes: Buffer.from(s, "utf8") })),
});

/** Every equipment ID shares description 1, except ID 0 (description 0). */
function sharedIndexes(): DescriptionIndexes {
  const out = {} as DescriptionIndexes;
  for (const slot of DESCRIPTION_INDEX_SLOTS) {
    out[slot] = Array.from({ length: DESCRIPTION_INDEX_COUNTS[slot] }, (_, i) => (i === 0 ? 0 : 1));
  }
  return out;
}

/** A 23-table str_tbl with the layout disc-text.ts reads, in one language. */
function strTbl(): MessageTable[] {
  const ui = Array.from({ length: 1200 }, (_, i) => `ui ${i}`);
  ui[806] = "None";
  ui[807] = "Torso Inc";
  ui[906] = "No Skill";
  ui[907] = "Para Duration Halved";
  const tables = Array.from({ length: 23 }, () => table([]));
  tables[0] = table(ui);
  tables[1] = table(["－－－－－－", "Book of Combos 1", "dummy"]);
  tables[2] = table(["dummy", "Intro text for first-time\ncombiners.", "dummy"]);
  const equipment: [number, number][] = [
    [3, 1150],
    [5, 354],
    [7, 436],
    [9, 420],
    [11, 411],
    [13, 409],
    [15, 420],
  ];
  for (const [names, count] of equipment) {
    tables[names] = table(
      Array.from({ length: count }, (_, i) => (i === 2 ? "none" : `piece ${i}`)),
    );
    tables[names + 1] = table([
      "Nothing equipped.",
      "A ~C03shared~C00 description. \nSecond line.",
    ]);
  }
  return tables;
}

test("description indexes are seven u16 arrays, each starting on a 4-byte boundary", () => {
  const sizes = DESCRIPTION_INDEX_SLOTS.map((s) => (DESCRIPTION_INDEX_COUNTS[s] * 2 + 3) & ~3);
  const buf = Buffer.alloc(8 + sizes.reduce((a, b) => a + b, 0));
  let at = 8;
  DESCRIPTION_INDEX_SLOTS.forEach((slot, s) => {
    for (let i = 0; i < DESCRIPTION_INDEX_COUNTS[slot]; i++)
      buf.writeUInt16LE(s * 1000 + i, at + i * 2);
    at += sizes[s]!;
  });
  const indexes = readDescriptionIndexes(new BinaryReader(buf), 8);
  DESCRIPTION_INDEX_SLOTS.forEach((slot, s) => {
    assert.equal(indexes[slot].length, DESCRIPTION_INDEX_COUNTS[slot]);
    assert.equal(indexes[slot][0], s * 1000, `${slot} starts where the last one's padding ends`);
    assert.equal(indexes[slot].at(-1), s * 1000 + DESCRIPTION_INDEX_COUNTS[slot] - 1);
  });
});

test("plain text drops color codes and the spaces before line breaks", () => {
  assert.equal(
    plainText(Buffer.from("Stopping power due to ~C03Pellet\nS~C00. \nEasy to use. ", "utf8")),
    "Stopping power due to Pellet\nS.\nEasy to use.",
  );
});

test("disc text is indexed by game ID, equipment through its shared descriptions", () => {
  const text = buildDiscText("en", strTbl(), sharedIndexes());
  assert.equal(text.items[0], null, "item 0 is no item");
  assert.deepEqual(text.items[1], {
    name: "Book of Combos 1",
    description: "Intro text for first-time\ncombiners.",
  });
  assert.equal(text.items[2], null, "dummy items are null");
  assert.equal(text.melee.length, 1150);
  assert.equal(text.melee[0], null, "nothing equipped");
  assert.equal(text.melee[2], null, "pieces named none are null");
  assert.deepEqual(text.leggings[419], {
    name: "piece 419",
    description: "A shared description.\nSecond line.",
  });
  assert.deepEqual(text.skill_trees.slice(0, 2), [null, "Torso Inc"]);
  assert.equal(text.skill_trees.length, 100);
  assert.deepEqual(text.skills.slice(0, 2), [null, "Para Duration Halved"]);
  assert.equal(text.skills.length, 218);
});

test("an index past the description table is an error, not a missing description", () => {
  const indexes = sharedIndexes();
  indexes.gunner[5] = 2;
  assert.throws(() => buildDiscText("fr", strTbl(), indexes), /ranged 5 points at description 2/);
});
