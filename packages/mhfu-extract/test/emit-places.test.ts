/** emit/gathering.ts and emit/shops.ts: data/gathering.json and data/shops.json. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { emitGathering } from "../src/emit/gathering.js";
import { emitShops } from "../src/emit/shops.js";
import type { ParsedQuest } from "../src/quests/parser.js";
import type { ShopData } from "../src/shops/shops.js";
import { ITEM_ENTRY_SIZE, TABLE_COUNTS, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

// Real ItemID enum entries.
const POTION = 7;
const IRON_ORE = 202;
const ARMOR_SPHERE = 223;

const TOWN = 12; // 4 areas

interface Node {
  type: number;
  table: number;
  gathers?: number;
  most?: number;
}

/**
 * A quest payload holding only gathering points: `areas` by area index, each
 * node's item table from `tables` (`[chance, item]` pairs).
 */
function payload(tables: [number, number][][], areas: Record<number, Node[]>): Buffer {
  const buf = Buffer.alloc(0x1000);
  let at = 0x80;
  const place = (bytes: Buffer) => {
    const start = at;
    bytes.copy(buf, at);
    at += bytes.length + ((4 - (bytes.length % 4)) % 4);
    return start;
  };
  const tablePtrs = tables.map((pairs) => {
    const b = Buffer.alloc(pairs.length * 4 + 2);
    pairs.forEach(([chance, item], i) => {
      b.writeUInt16LE(chance, i * 4);
      b.writeUInt16LE(item, i * 4 + 2);
    });
    b.writeUInt16LE(0xffff, pairs.length * 4);
    return place(b);
  });
  const list = Buffer.alloc(tablePtrs.length * 4);
  tablePtrs.forEach((p, i) => list.writeUInt32LE(p, i * 4));
  const itemsPtr = place(list);
  const areaPtrs = Buffer.alloc(4 * 4);
  for (const [area, nodes] of Object.entries(areas)) {
    const b = Buffer.alloc(nodes.length * 24 + 4);
    nodes.forEach((n, i) => {
      b.writeUInt16LE(n.table, i * 24 + 16);
      b.writeUInt16LE(n.most ?? 6, i * 24 + 18);
      b.writeUInt16LE(n.type, i * 24 + 20);
      b.writeUInt16LE(n.gathers ?? 3, i * 24 + 22);
    });
    b.writeUInt32LE(0xbf800000, nodes.length * 24);
    areaPtrs.writeUInt32LE(place(b), Number(area) * 4);
  }
  buf.writeUInt32LE(place(areaPtrs), 28);
  buf.writeUInt32LE(itemsPtr, 36);
  return buf;
}

/** Only the fields the gathering emit reads. */
function quest(questId: number, title = "A quest"): ParsedQuest {
  return { header: { questId, map: TOWN }, strings: { title } } as unknown as ParsedQuest;
}

test("emitGathering writes each set of points once, with the quests that use it", () => {
  const points = payload(
    [
      [
        [45, IRON_ORE],
        [10, 0], // a draw that gives nothing
      ],
      [[100, POTION]],
    ],
    {
      1: [
        { type: 3, table: 0 },
        { type: 3, table: 0 }, // the same point again: one entry, count 2
        { type: 0, table: 1, gathers: 255, most: 255 },
      ],
      3: [{ type: 4, table: 1 }],
    },
  );
  const other = payload([[[100, POTION]]], { 2: [{ type: 0, table: 0 }] });
  const { layouts, problems } = emitGathering([
    { parsed: quest(1002), payload: points },
    { parsed: quest(1001), payload: points },
    { parsed: quest(1003), payload: other },
    { parsed: quest(50001, "none"), payload: other }, // a placeholder: left out
    { parsed: quest(9999), payload: other }, // on no quest board: left out
  ]);
  assert.deepEqual(problems, []);
  assert.deepEqual(layouts, [
    {
      map: "Town",
      quests: [1001, 1002],
      areas: [
        {
          area: 1,
          nodes: [
            {
              kind: "mine",
              count: 2,
              gathers: 3,
              most_gathers: 6,
              items: [{ item: "Iron Ore", chance: 45 }],
            },
            {
              kind: "gather",
              count: 1,
              gathers: null,
              most_gathers: null,
              items: [{ item: "Potion", chance: 100 }],
            },
          ],
        },
        {
          area: 3,
          nodes: [
            {
              kind: "bug",
              count: 1,
              gathers: 3,
              most_gathers: 6,
              items: [{ item: "Potion", chance: 100 }],
            },
          ],
        },
      ],
    },
    {
      map: "Town",
      quests: [1003],
      areas: [
        {
          area: 2,
          nodes: [
            {
              kind: "gather",
              count: 1,
              gathers: 3,
              most_gathers: 6,
              items: [{ item: "Potion", chance: 100 }],
            },
          ],
        },
      ],
    },
  ]);
});

test("emitGathering reports nodes and quests it can't read", () => {
  const unknownType = payload([[[100, POTION]]], { 0: [{ type: 7, table: 0 }] });
  const pastTables = payload([[[100, POTION]]], { 0: [{ type: 0, table: 600 }] });
  const { layouts, problems } = emitGathering([
    { parsed: quest(1001), payload: unknownType },
    { parsed: quest(1002), payload: pastTables },
  ]);
  assert.deepEqual(layouts, []);
  assert.equal(problems.length, 2);
  assert.deepEqual(problems[0], { questId: 1001, problem: "unknown node type 7" });
  assert.equal(problems[1]!.questId, 1002);
  assert.match(problems[1]!.problem, /item table 600/);
});

test("emitShops lists each item's stages and its item table price", () => {
  const base = tableOffset("itemTable");
  const { buf, reader } = fixtureReader(
    base + (TABLE_COUNTS.regularItems + TABLE_COUNTS.decorations) * ITEM_ENTRY_SIZE,
  );
  buf.writeUInt32LE(66, base + POTION * ITEM_ENTRY_SIZE + 12);
  buf.writeUInt32LE(30, base + IRON_ORE * ITEM_ENTRY_SIZE + 12);
  buf.writeUInt32LE(1000, base + ARMOR_SPHERE * ITEM_ENTRY_SIZE + 12);

  const shops: ShopData = {
    tables: [
      { at: 0, name: "Village general store", lists: [0x10, 0x20, 0x30], special: false },
      { at: 0, name: "Point Exchange", lists: [0x40], special: true },
    ],
    lists: new Map([
      [0x10, { offset: 0x10, items: [POTION] }],
      [0x20, { offset: 0x20, items: [POTION, IRON_ORE] }],
      [0x30, { offset: 0x30, items: [] }],
      [0x40, { offset: 0x40, items: [ARMOR_SPHERE] }],
    ]),
  };
  assert.deepEqual(emitShops(shops, reader), [
    {
      name: "Village general store",
      currency: "zenny",
      stage_count: 3,
      items: [
        { item: "Potion", price: 66, stages: [1, 2] },
        { item: "Iron Ore", price: 30, stages: [2] },
      ],
    },
    {
      name: "Point Exchange",
      currency: "pokke-points",
      stage_count: 1,
      // Its Pokke Point prices aren't the item table's.
      items: [{ item: "Armor Sphere", price: null, stages: [1] }],
    },
  ]);
});
