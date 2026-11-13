import assert from "node:assert/strict";
import { test } from "node:test";
import { OVL_HEADER_SIZE, parseOvl } from "../src/container/ovl.js";
import { emitVeggieTrades } from "../src/emit/veggie-trades.js";
import { GAME_TASK_JP } from "../src/monsters/hitzones.js";
import {
  readVeggieTrades,
  TRADE_END,
  TRADE_ROW_SIZE,
  TRADE_TABLE_COUNT,
  VEGGIE_TRADES_JP,
} from "../src/tables/veggie-trades.js";

/** A `game_task.ovl` with the seven lists `shift` bytes past JP's file offset, after some junk. */
function gameTask(tables: number[][][], shift: number): Buffer {
  const at = VEGGIE_TRADES_JP - GAME_TASK_JP.loadBase + shift;
  const size = tables.reduce((n, rows) => n + rows.length * TRADE_ROW_SIZE + 2, 0);
  const buf = Buffer.alloc(at + size + 0x40);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(GAME_TASK_JP.loadBase, 0x08);
  buf.writeUInt32LE(GAME_TASK_JP.loadBase + buf.length, 0x1c);
  buf.write("game_task.ovl", 0x20, "latin1");
  // Junk that reads as item IDs right before the lists, as the real file has.
  for (let o = OVL_HEADER_SIZE; o < at; o += 2) buf.writeUInt16LE(0x100 + (o % 7), o);
  let o = at;
  for (const rows of tables) {
    for (const row of rows) {
      row.forEach((id, i) => buf.writeUInt16LE(id, o + i * 2));
      o += TRADE_ROW_SIZE;
    }
    buf.writeUInt16LE(TRADE_END, o);
    o += 2;
  }
  return buf;
}

const TABLES = Array.from({ length: TRADE_TABLE_COUNT }, (_, t) =>
  Array.from({ length: 4 }, (_, r) => [876 + r, 7 + t, 8 + t]),
);

test("the seven trade lists are found at JP's offset, or shifted as on the EU disc", () => {
  for (const shift of [0, 0x110]) {
    const found = readVeggieTrades(parseOvl(gameTask(TABLES, shift)));
    assert.ok(found, `shift ${shift}`);
    assert.equal(found.shift, shift);
    assert.deepEqual(
      found.tables.map((rows) => rows.map((r) => [r.give, r.common, r.rare])),
      TABLES,
    );
  }
});

test("lists with something that isn't an item, or of different lengths, aren't the trades", () => {
  const bad = TABLES.map((rows) => rows.map((r) => [...r]));
  bad[3]![1]![2] = 0;
  assert.equal(readVeggieTrades(parseOvl(gameTask(bad, 0)), 0x20), null);
  const uneven = TABLES.map((rows, t) => (t === 5 ? rows.slice(1) : rows));
  assert.equal(readVeggieTrades(parseOvl(gameTask(uneven, 0)), 0x20), null);
});

test("emitted with each Elder's maps and the rare trade's chance", () => {
  const found = readVeggieTrades(parseOvl(gameTask(TABLES, 0)))!;
  const out = emitVeggieTrades(found);
  assert.equal(out.rare_chance, 20);
  assert.deepEqual(
    out.elders.map((e) => e.maps),
    [
      ["Forest and Hills (Day)", "Forest and Hills (Night)"],
      ["Desert (Day)", "Desert (Night)"],
      ["Swamp (Day)", "Swamp (Night)"],
      ["Jungle (Day)", "Jungle (Night)"],
      ["Snowy Mountains (Day)", "Snowy Mountains (Night)"],
      ["Old Jungle"],
      ["Old Swamp"],
    ],
  );
  assert.deepEqual(out.elders[0]!.trades[0], {
    give: "Wyvern Egg",
    common: "Potion",
    rare: "Mega Potion",
  });
});
