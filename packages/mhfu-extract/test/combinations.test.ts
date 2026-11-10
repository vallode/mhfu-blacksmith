import assert from "node:assert/strict";
import { test } from "node:test";
import type { SiteIndex } from "../src/build/ids.js";
import { nameCombinationItems } from "../src/cli/build-data.js";
import { emitCombinations } from "../src/emit/combinations.js";
import {
  RECIPE_SIZE,
  findRecipeRecords,
  readCombinations,
  readRecipeIndex,
} from "../src/tables/combinations.js";

const BASE = 0x08801a4c;

interface Recipe {
  a: number;
  b: number;
  result: number;
  rate: number;
  qty: number;
  flags: number;
}

/** 70 recipes: three per lower ingredient, the last also flagged. */
const RECIPES: Recipe[] = Array.from({ length: 70 }, (_, i) => ({
  a: 10 + Math.floor(i / 3),
  b: 300 + i,
  result: 500 + i,
  rate: i % 3,
  qty: i % 2,
  flags: i === 0 ? 0x01 : i === 1 ? 0x02 | 0x08 : i === 2 ? 0x10 : 0,
}));

/**
 * An EBOOT-shaped buffer laid out like the EU one: noise, the recipe
 * records and their per-item index, then the Combination List (here in
 * reverse record order, the second ingredient first on odd entries) and the
 * tables after it.
 */
function buildEboot(recipes = RECIPES): { buf: Buffer; list: number; records: number } {
  const buf = Buffer.alloc(0x4000);
  let x = 7;
  for (let i = 0; i < buf.length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    buf[i] = x >>> 24;
  }
  const records = 0x402;
  recipes.forEach((r, i) => {
    const o = records + i * RECIPE_SIZE;
    buf.writeUInt16LE(r.b, o);
    buf.writeUInt16LE(r.result, o + 2);
    buf[o + 4] = r.rate;
    buf[o + 5] = r.qty;
    buf[o + 6] = i;
    buf[o + 7] = r.flags;
    buf[o + 8] = 255;
    buf[o + 9] = 0;
  });
  const index = records + recipes.length * RECIPE_SIZE;
  buf.fill(0, index, index + 2048 * 2);
  recipes.forEach((r, i) => {
    if (buf[index + r.a * 2] === 0) buf[index + r.a * 2 + 1] = i;
    buf.writeUInt8(buf.readUInt8(index + r.a * 2) + 1, index + r.a * 2);
  });

  const list = 0x1800;
  const order = recipes.map((_, i) => recipes.length - 1 - i);
  order.forEach((record, i) => {
    const r = recipes[record]!;
    const [first, second] = i % 2 ? [r.b, r.a] : [r.a, r.b];
    buf.writeUInt16LE(first, list + i * 4);
    buf.writeUInt16LE(second, list + i * 4 + 2);
  });
  let p = list + recipes.length * 4;
  buf.writeUInt32LE(0xffffffff, p);
  p += 4;
  // Two quantity rolls: always 1, and 1 (70%) or 2 (30%).
  const rolls = [p, p + 4];
  buf.set([1, 100, 0, 0, 1, 70, 30, 0], p);
  p += 8;
  for (const roll of rolls) {
    buf.writeUInt32LE(BASE + roll, p);
    p += 4;
  }
  buf.set([1, 2, 0, 0], p); // largest amounts, padded
  p += 4;
  buf.set([100, 95, 90, 0], p); // rates, ended by 0
  p += 4;
  for (const id of [1, 2, 3, 4, 5, 0]) {
    buf.writeUInt16LE(id, p);
    p += 2;
  }
  buf.set([0, 5, 10, 20, 30, 50], p);
  return { buf, list, records };
}

test("findRecipeRecords finds the run whose index byte counts up", () => {
  const { buf, records } = buildEboot();
  assert.deepEqual(findRecipeRecords(buf), { offset: records, count: RECIPES.length });
});

test("readRecipeIndex gives each record its lower-ID ingredient", () => {
  const { buf, records } = buildEboot();
  const firsts = readRecipeIndex(buf, records + RECIPES.length * RECIPE_SIZE, RECIPES.length);
  assert.deepEqual(
    firsts,
    RECIPES.map((r) => r.a),
  );
});

test("readCombinations reads the list in its own order, with rates and amounts", () => {
  const { buf, list, records } = buildEboot();
  const t = readCombinations(buf, BASE);
  assert.equal(t.recipes.length, RECIPES.length);
  assert.equal(t.offsets.list, list);
  assert.equal(t.offsets.records, records);
  assert.deepEqual(t.rates, [100, 95, 90]);
  assert.deepEqual(t.quantities, [
    [{ amount: 1, chance: 100 }],
    [
      { amount: 1, chance: 70 },
      { amount: 2, chance: 30 },
    ],
  ]);
  assert.deepEqual(t.maxQuantities, [1, 2]);
  assert.deepEqual(t.books, [1, 2, 3, 4, 5]);
  assert.deepEqual(t.bookBonus, [0, 5, 10, 20, 30, 50]);

  // The list is in reverse record order; odd entries name the second ingredient first.
  const last = RECIPES.at(-1)!;
  assert.deepEqual(t.recipes[0], {
    listIndex: 0,
    record: RECIPES.length - 1,
    ingredients: [last.a, last.b],
    result: last.result,
    rateClass: last.rate,
    quantityClass: last.qty,
    flags: last.flags,
  });
  const second = RECIPES.at(-2)!;
  assert.deepEqual(t.recipes[1]!.ingredients, [second.b, second.a]);
  assert.equal(t.recipes[1]!.result, second.result);
});

test("readCombinations refuses a list that misses a recipe", () => {
  const { buf, list } = buildEboot();
  buf.writeUInt16LE(2047, list + 2); // no recipe has this pair
  assert.throws(() => readCombinations(buf, BASE), /no Combination List/);
});

test("readCombinations refuses a quantity roll that isn't 100%", () => {
  const { buf, list } = buildEboot();
  buf[list + RECIPES.length * 4 + 4 + 1] = 90;
  assert.throws(() => readCombinations(buf, BASE), /doesn't reach 100%/);
});

test("emitCombinations numbers the list from 1 and flags alchemy, bomb and trap recipes", () => {
  const { buf } = buildEboot();
  const out = emitCombinations(readCombinations(buf, BASE));
  assert.deepEqual(out.book_bonus, [0, 5, 10, 20, 30, 50]);
  assert.equal(out.books[0]!.id, 1);
  assert.equal(out.books[0]!.name, "Book of Combos 1");
  assert.equal(out.combinations.length, RECIPES.length);
  assert.deepEqual(
    out.combinations.map((c) => c.number),
    RECIPES.map((_, i) => i + 1),
  );
  const byRecord = (i: number) => out.combinations[RECIPES.length - 1 - i]!;
  assert.equal(byRecord(0).alchemy, true);
  assert.equal(byRecord(0).bomb, undefined);
  assert.equal(byRecord(1).bomb, true);
  assert.equal(byRecord(1).alchemy, undefined);
  assert.equal(byRecord(2).trap, true);
  assert.equal(byRecord(3).alchemy ?? byRecord(3).bomb ?? byRecord(3).trap, undefined);
  assert.equal(byRecord(0).success_rate, 100);
  assert.equal(byRecord(1).success_rate, 95);
  assert.deepEqual(byRecord(1).quantity, [
    { amount: 1, chance: 70 },
    { amount: 2, chance: 30 },
  ]);
});

test("nameCombinationItems renames items to data/items.json's names by ID", () => {
  const site = {
    items: new Map([
      [7, { id: 7, name: "Potion", name_jp: "回復薬" }],
      [163, { id: 163, name: "Herb", name_jp: "薬草" }],
    ]),
  } as unknown as SiteIndex;
  const named = nameCombinationItems(
    {
      books: [{ id: 7, name: "Potn" }],
      book_bonus: [0],
      combinations: [
        {
          number: 1,
          result: { id: 7, name: "Potn" },
          ingredients: [
            { id: 163, name: "Hrb" },
            { id: 999, name: "Unknown" },
          ],
        },
      ],
    },
    site,
  ) as ReturnType<typeof emitCombinations>;
  assert.equal(named.books[0]!.name, "Potion");
  assert.equal(named.combinations[0]!.result.name, "Potion");
  assert.deepEqual(
    named.combinations[0]!.ingredients.map((i) => i.name),
    ["Herb", "Unknown"],
  );
});
