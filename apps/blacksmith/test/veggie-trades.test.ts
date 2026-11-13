/** Veggie Elder trades (lib/veggie-trades.ts): the bundle and the index by item. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { buildItemNameIndex, normalizeItemName, type ItemRecord } from "../src/lib/items";
import { DATA_DIR } from "../src/lib/paths";
import {
  encodeVeggieTrades,
  indexVeggieTrades,
  tradeMapsLabel,
  type VeggieTradesFile,
} from "../src/lib/veggie-trades";

const ITEM_IDS: Record<string, number> = {
  "Iron Ore": 1,
  Potion: 2,
  "Wyvern Egg": 4,
  "Mega Potion": 5,
};
const FH = ["Forest and Hills (Day)", "Forest and Hills (Night)"];

const file: VeggieTradesFile = {
  rare_chance: 20,
  elders: [
    {
      maps: FH,
      trades: [
        { give: "Wyvern Egg", common: "Potion", rare: "Mega Potion" },
        { give: "Iron Ore", common: "Potion", rare: "Potion" },
        { give: "Mystery Item", common: "Potion", rare: "Potion" },
      ],
    },
    { maps: ["Old Swamp"], trades: [{ give: "Potion", common: "Iron Ore", rare: "Mega Potion" }] },
  ],
};

describe("Veggie Elder trades", () => {
  const { bundle, unresolved } = encodeVeggieTrades(file, (name) => ITEM_IDS[name]);
  const trades = indexVeggieTrades(JSON.parse(JSON.stringify(bundle)));

  test("rows become item IDs; a row with an unknown item is left out", () => {
    assert.deepEqual(unresolved, ["Mystery Item"]);
    assert.deepEqual(bundle.elders[0]!.rows, [
      [4, 2, 5],
      [1, 2, 2],
    ]);
  });

  test("what gives an item, best chance first, in list order within a chance", () => {
    assert.deepEqual(trades.get(2)!.gives, [
      { maps: FH, row: 2, item: 1, chance: 100, rare: false },
      { maps: FH, row: 1, item: 4, chance: 80, rare: false },
    ]);
    assert.deepEqual(trades.get(5)!.gives, [
      { maps: FH, row: 1, item: 4, chance: 20, rare: true },
      { maps: ["Old Swamp"], row: 1, item: 2, chance: 20, rare: true },
    ]);
  });

  test("what the Elder gives for an item: the common and rare trades, or one sure one", () => {
    assert.deepEqual(trades.get(4)!.takes, [
      { maps: FH, row: 1, item: 2, chance: 80, rare: false },
      { maps: FH, row: 1, item: 5, chance: 20, rare: true },
    ]);
    assert.deepEqual(trades.get(1)!.takes, [
      { maps: FH, row: 2, item: 2, chance: 100, rare: false },
    ]);
  });

  test("an Elder's maps are named once, without the time of day", () => {
    assert.equal(tradeMapsLabel(FH), "Forest and Hills");
    assert.equal(tradeMapsLabel(["Old Swamp"]), "Old Swamp");
  });

  test("data/veggie-trades.json: every item resolves, and the first trade is the disc's", () => {
    const read = <T>(f: string) =>
      JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8")) as T;
    const { index } = buildItemNameIndex(read<{ items: ItemRecord[] }>("items.json").items);
    const id = (name: string) => index.get(normalizeItemName(name));
    const real = encodeVeggieTrades(read<VeggieTradesFile>("veggie-trades.json"), id);
    assert.deepEqual(real.unresolved, []);
    assert.equal(real.bundle.elders.length, 7);
    // The Forest and Hills Elder's first trade: a Wyvern Egg for a Potion, or a Mega Potion.
    assert.deepEqual(real.bundle.elders[0]!.rows[0], [
      id("Wyvern Egg"),
      id("Potion"),
      id("Mega Potion"),
    ]);
  });
});
