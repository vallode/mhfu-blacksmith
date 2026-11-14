import assert from "node:assert/strict";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import { emitFarm } from "../src/emit/farm.js";
import {
  FARM_LAYOUT,
  FARM_ROW_SIZE,
  FARM_TABLES_EU,
  FARM_TABLES_SIZE,
  readFarmTables,
} from "../src/tables/farm.js";

type Rows = [item: number, chance: number][];

/** Each table's rows: two items at 60% and 40%, different per table. */
const TABLES: Rows[] = FARM_LAYOUT.flatMap((s, si) =>
  s.levels.map((_, l): Rows => [
    [202 + si, 60],
    [210 + l, 40],
  ]),
);

/** An EBOOT-sized buffer with the tables `shift` bytes past the EU offset. */
function eboot(tables: Rows[], shift: number): BinaryReader {
  const buf = Buffer.alloc(FARM_TABLES_EU + 0x200 + FARM_TABLES_SIZE);
  // Junk before them that reads like rows, but whose chances don't add up.
  for (let o = FARM_TABLES_EU - 0x100; o < FARM_TABLES_EU + shift; o += 4) {
    buf.writeUInt16LE(200 + (o % 13), o);
    buf.writeUInt16LE(7, o + 2);
  }
  let at = FARM_TABLES_EU + shift;
  let t = 0;
  for (const { rows, levels } of FARM_LAYOUT) {
    for (let l = 0; l < levels.length; l++) {
      tables[t++]!.forEach(([item, chance], r) => {
        buf.writeUInt16LE(item, at + r * FARM_ROW_SIZE);
        buf.writeUInt16LE(chance, at + r * FARM_ROW_SIZE + 2);
      });
      at += rows * FARM_ROW_SIZE;
    }
  }
  return new BinaryReader(buf);
}

test("the sixteen farm tables are found at the EU offset, or shifted", () => {
  for (const shift of [0, 0x40, -0x20]) {
    const found = readFarmTables(eboot(TABLES, shift));
    assert.ok(found, `shift ${shift}`);
    assert.equal(found.offset, FARM_TABLES_EU + shift);
    assert.equal(found.tables.length, 16);
    assert.deepEqual(
      found.tables.map((t) => t.items.map((i) => [i.item, i.chance])),
      TABLES,
    );
  }
});

test("each table is named by its upgrade, with the restock's gather counts", () => {
  const found = readFarmTables(eboot(TABLES, 0))!;
  const pick = (name: string) => found.tables.find((t) => t.name === name)!;
  assert.deepEqual(
    found.tables.map((t) => t.name),
    [
      "Mining Point",
      "Mining Point +1",
      "Mining Point +2",
      "Mining Point +3",
      "Mining Point +4",
      "Insect Thicket",
      "Insect Thicket +1",
      "Insect Thicket +2",
      "Insect Thicket +3",
      "Insect Thicket +4",
      "Mushroom Tree",
      "Mushroom Tree +1",
      "Mushroom Tree +2",
      "Prototype Bee Hive",
      "Production Bee Hive",
      "Modified Bee Hive",
    ],
  );
  assert.deepEqual([pick("Mining Point +4").gathers, pick("Mining Point +4").mostGathers], [3, 4]);
  assert.equal(pick("Mining Point +4").level, 4);
  assert.deepEqual(
    [pick("Mushroom Tree +2").gathers, pick("Mushroom Tree +2").mostGathers],
    [7, 8],
  );
  assert.deepEqual(
    [pick("Modified Bee Hive").gathers, pick("Modified Bee Hive").mostGathers],
    [5, 6],
  );
});

test("tables whose chances don't add up to 100, or with gaps, aren't the farm's", () => {
  const short = TABLES.map((rows) => rows.map((r): [number, number] => [...r]));
  short[7]![1]![1] = 39;
  assert.equal(readFarmTables(eboot(short, 0), 0x40), null);

  // An item after an empty row: padding only comes at the end.
  const gap: Rows[] = TABLES.map((rows, t) =>
    t === 2
      ? [
          [202, 60],
          [0, 0],
          [210, 40],
        ]
      : rows,
  );
  assert.equal(readFarmTables(eboot(gap, 0), 0x40), null);
});

test("a row with a 0% chance is kept, as the Modified Bee Hive's Insect Husk is", () => {
  const tables = TABLES.map((rows, t): Rows =>
    t === 15
      ? [
          [246, 0],
          [161, 95],
          [249, 5],
        ]
      : rows,
  );
  const found = readFarmTables(eboot(tables, 0))!;
  assert.deepEqual(found.tables[15]!.items, [
    { item: 246, chance: 0 },
    { item: 161, chance: 95 },
    { item: 249, chance: 5 },
  ]);
});

test("emitted with item names", () => {
  const tables = TABLES.map((rows, t): Rows =>
    t === 4
      ? [
          [222, 50],
          [217, 50],
        ]
      : rows,
  );
  const out = emitFarm(readFarmTables(eboot(tables, 0))!);
  assert.equal(out.points.length, 16);
  assert.deepEqual(out.points[4], {
    name: "Mining Point +4",
    spot: "mining",
    level: 4,
    gathers: 3,
    most_gathers: 4,
    items: [
      { item: "Armor Stone", chance: 50 },
      { item: "Purecrystal", chance: 50 },
    ],
  });
});
