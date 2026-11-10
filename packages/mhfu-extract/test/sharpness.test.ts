import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SHARPNESS_POINTER_COUNT,
  SHARPNESS_POINTERS_OFFSET,
  readSharpnessTable,
  readSharpnessTables,
  sharpnessStepWidths,
} from "../src/tables/sharpness.js";
import {
  JP_BASE_ADDRESS,
  SHARPNESS_ENTRY_SIZE,
  TABLE_COUNTS,
  tableOffset,
} from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

test("readSharpnessTable decodes cumulative thresholds in color order", () => {
  const base = tableOffset("sharpnessTable");
  const { buf, reader } = fixtureReader(
    base + TABLE_COUNTS.sharpnessEntries * SHARPNESS_ENTRY_SIZE,
  );

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
    cumulative: {
      red: 90,
      orange: 130,
      yellow: 240,
      green: 310,
      blue: 370,
      white: 410,
      purple: 450,
    },
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

/**
 * A synthetic table whose class pointers start at different entries: the
 * pointer array sits right after the 40 entries, and `BGModTable`'s first
 * pointer (the calibration pointer) points just past it, as on the disc.
 */
function buildPointerFixture(vaddrBase: number) {
  const tableOff = tableOffset("sharpnessTable");
  const bgModOff = tableOff + (0x08976944 - 0x08976508);
  const { buf, reader } = fixtureReader(bgModOff + 4 + 0x100);
  const writeEntry = (index: number, values: number[]) =>
    values.forEach((v, c) => buf.writeUInt16LE(v, tableOff + index * SHARPNESS_ENTRY_SIZE + c * 2));
  writeEntry(0, [100, 150, 250, 0, 0, 0, 0]);
  writeEntry(1, [50, 200, 300, 0, 0, 0, 0]);
  writeEntry(5, [80, 110, 220, 320, 0, 0, 0]);
  writeEntry(6, [30, 60, 90, 120, 150, 0, 0]);
  const pointersOff = tableOff + SHARPNESS_POINTERS_OFFSET;
  for (let type = 0; type < SHARPNESS_POINTER_COUNT; type++) {
    // great sword (0) and long sword (7) at entry 0, hammer (2) at entry 5.
    const entry = type === 2 ? 5 : 0;
    buf.writeUInt32LE(tableOff + entry * SHARPNESS_ENTRY_SIZE + vaddrBase, pointersOff + type * 4);
  }
  buf.writeUInt32LE(pointersOff + SHARPNESS_POINTER_COUNT * 4 + vaddrBase, bgModOff);
  return { reader, tableOff };
}

test("readSharpnessTables indexes each class from its own pointer", () => {
  const { reader, tableOff } = buildPointerFixture(JP_BASE_ADDRESS);
  const tables = readSharpnessTables(reader);
  assert.equal(tables.vaddrBase, JP_BASE_ADDRESS);
  assert.equal(tables.pointers[2]!.offset, tableOff + 5 * SHARPNESS_ENTRY_SIZE);
  assert.equal(tables.pointers[2]!.tableIndex, 5);
  // Same sharpnessId, different classes, different curves.
  assert.equal(tables.entryFor(0, 1).cumulative.red, 50);
  assert.equal(tables.entryFor(7, 1).cumulative.red, 50);
  assert.equal(tables.entryFor(2, 1).cumulative.red, 30);
  assert.equal(tables.entryFor(2, 0).cumulative.green, 320);
  // No class: the table's own entry.
  assert.equal(tables.entryFor(null, 5).cumulative.red, 80);
});

test("readSharpnessTables calibrates the vaddr base from the BGModTable pointer", () => {
  // A region whose vaddrs sit at a different base than JP's.
  const { reader } = buildPointerFixture(JP_BASE_ADDRESS + 0x1000);
  const tables = readSharpnessTables(reader);
  assert.equal(tables.vaddrBase, JP_BASE_ADDRESS + 0x1000);
  assert.equal(tables.pointers[2]!.tableIndex, 5);
  assert.equal(tables.entryFor(2, 1).cumulative.red, 30);
});

test("readSharpnessTables falls back to the table start for null pointers", () => {
  const base = tableOffset("sharpnessTable");
  const { buf, reader } = fixtureReader(0x200000);
  buf.writeUInt16LE(90, base + SHARPNESS_ENTRY_SIZE);
  const tables = readSharpnessTables(reader);
  assert.equal(tables.vaddrBase, JP_BASE_ADDRESS);
  assert.ok(tables.pointers.every((p) => p.valid && p.tableIndex === 0));
  assert.equal(tables.entryFor(4, 1).cumulative.red, 90);
});

test("readSharpnessTables rejects a pointer outside the EBOOT only when used", () => {
  const { reader } = buildPointerFixture(JP_BASE_ADDRESS);
  const pointersOff = tableOffset("sharpnessTable") + SHARPNESS_POINTERS_OFFSET;
  reader.buf.writeUInt32LE(0xffffff00, pointersOff + 3 * 4);
  const tables = readSharpnessTables(reader);
  assert.equal(tables.pointers[3]!.valid, false);
  assert.throws(() => tables.entryFor(3, 0), /resolves outside the EBOOT/);
  assert.equal(tables.entryFor(2, 0).cumulative.red, 80);
});
