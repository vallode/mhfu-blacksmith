import assert from "node:assert/strict";
import { test } from "node:test";
import { readSharpnessTable, sharpnessStepWidths } from "../src/tables/sharpness.js";
import { SHARPNESS_ENTRY_SIZE, TABLE_COUNTS, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

test("readSharpnessTable decodes cumulative thresholds in color order", () => {
  const base = tableOffset("sharpnessTable");
  const { buf, reader } = fixtureReader(base + TABLE_COUNTS.sharpnessEntries * SHARPNESS_ENTRY_SIZE);

  const cumulative = [90, 130, 240, 310, 370, 410, 450];
  cumulative.forEach((v, i) => buf.writeUInt16LE(v, base + i * 2));

  const table = readSharpnessTable(reader);
  assert.equal(table.length, TABLE_COUNTS.sharpnessEntries);
  assert.deepEqual(table[0]!.cumulative, {
    red: 90,
    orange: 130,
    yellow: 240,
    green: 310,
    blue: 370,
    white: 410,
    purple: 450,
  });
});

test("sharpnessStepWidths converts cumulative thresholds into per-color widths", () => {
  const entry = {
    index: 0,
    cumulative: { red: 90, orange: 130, yellow: 240, green: 310, blue: 370, white: 410, purple: 450 },
  };
  assert.deepEqual(sharpnessStepWidths(entry), {
    red: 90,
    orange: 40,
    yellow: 110,
    green: 70,
    blue: 60,
    white: 40,
    purple: 40,
  });
});
