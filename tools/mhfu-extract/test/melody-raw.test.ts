import assert from "node:assert/strict";
import { test } from "node:test";
import { findComboBlocks, findNoteSetTables, noteSetsByType } from "../src/emit/melody-raw.js";

const SETS = [
  { noteType: 2, notes: ["w", "a", "b"] },
  { noteType: 3, notes: ["p", "g", "r"] },
  { noteType: 4, notes: ["w", "y", "r"] },
  { noteType: 6, notes: ["p", "b", "y"] },
];
const CODES: Record<string, number> = { w: 1, p: 2, r: 3, b: 4, g: 5, y: 6, a: 7 };

test("findNoteSetTables finds a strided note-set table and its colour codes", () => {
  const buf = Buffer.alloc(0x400, 0x55);
  for (let i = 0; i < buf.length; i++) buf[i] = (i * 37) & 0xff;
  const base = 0x100;
  const stride = 4;
  for (const s of SETS) {
    const off = base + s.noteType * stride;
    buf[off] = 0;
    s.notes.forEach((n, k) => (buf[off + 1 + k] = CODES[n]!));
  }
  const hits = findNoteSetTables("eboot.bin", buf, SETS);
  const hit = hits.find((h) => h.stride === stride && h.base === base);
  assert.ok(hit, JSON.stringify(hits));
  assert.deepEqual(hit.positions, [1, 2, 3]);
  assert.deepEqual(hit.mapping, { a: 7, b: 4, g: 5, p: 2, r: 3, w: 1, y: 6 });
});

test("noteSetsByType keeps the most common notes per raw value", () => {
  const sets = noteSetsByType([
    { noteType: 5, notes: ["w", "a", "b"] },
    { noteType: 5, notes: ["w", "a", "b"] },
    { noteType: 5, notes: ["w", "a", "r"] },
    { noteType: 1, notes: ["p", "g", "y"] },
  ]);
  assert.deepEqual(sets, [
    { noteType: 1, notes: ["p", "g", "y"], horns: 1 },
    { noteType: 5, notes: ["w", "a", "b"], horns: 3 },
  ]);
});

test("findComboBlocks ranks blocks by distinct melody sequences", () => {
  const buf = Buffer.alloc(0x1000, 0xee);
  const mapping = { w: 1, r: 3, b: 4 };
  Buffer.from([1, 1, 3, 0, 4, 4, 1, 0, 3, 4, 1]).copy(buf, 0x810);
  Buffer.from([1, 1, 3]).copy(buf, 0x20);
  const blocks = findComboBlocks("game_task.ovl", buf, mapping, [
    ["w", "w", "r"],
    ["b", "b", "w"],
    ["r", "b", "w"],
    ["w", "r"],
  ]);
  assert.deepEqual(blocks, [
    { file: "game_task.ovl", offset: 0x800, combos: 3 },
    { file: "game_task.ovl", offset: 0, combos: 1 },
  ]);
});
