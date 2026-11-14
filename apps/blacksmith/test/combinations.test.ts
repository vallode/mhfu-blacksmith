/** Item combinations (lib/combinations.ts) and data/combinations.json. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  combinationNotes,
  decodeCombination,
  decodeCombinations,
  encodeCombination,
  encodeCombinations,
  indexCombinations,
  quantityLabel,
  type CombinationRecord,
  type CombinationsFile,
} from "../src/lib/combinations";
import type { ItemRecord } from "../src/lib/items";
import { DATA_DIR } from "../src/lib/paths";
import { readData } from "game-data";

const ref = (id: number, name: string) => ({ id, name });

const potion: CombinationRecord = {
  number: 1,
  result: ref(7, "Potion"),
  ingredients: [ref(163, "Herb"), ref(177, "Blue Mushroom")],
  success_rate: 95,
  quantity: [{ amount: 1, chance: 100 }],
};
const megaPotion: CombinationRecord = {
  number: 2,
  result: ref(8, "Mega Potion"),
  ingredients: [ref(7, "Potion"), ref(161, "Honey")],
  success_rate: 90,
  quantity: [{ amount: 1, chance: 100 }],
};
const pellet: CombinationRecord = {
  number: 61,
  result: ref(110, "Pellet S Lv1"),
  ingredients: [ref(93, "Huskberry"), ref(189, "Scatternut")],
  success_rate: 85,
  quantity: [
    { amount: 1, chance: 5 },
    { amount: 2, chance: 85 },
    { amount: 3, chance: 10 },
  ],
  alchemy: true,
  trap: true,
};

describe("combinations", () => {
  test("a combination survives the compact form", () => {
    for (const c of [potion, pellet]) {
      const decoded = decodeCombination(encodeCombination(c));
      assert.equal(decoded.number, c.number);
      assert.equal(decoded.result, c.result.id);
      assert.deepEqual(decoded.ingredients, [c.ingredients[0].id, c.ingredients[1].id]);
      assert.equal(decoded.successRate, c.success_rate);
      assert.deepEqual(decoded.quantity, c.quantity);
      assert.equal(decoded.alchemy, !!c.alchemy);
      assert.equal(decoded.bomb, !!c.bomb);
      assert.equal(decoded.trap, !!c.trap);
    }
    assert.equal(encodeCombination(potion).length, 6, "no flags, no flags slot");
  });

  test("the index lists what an item is made from and used in, in list order", () => {
    const index = indexCombinations(
      [megaPotion, pellet, potion].map((c) => decodeCombination(encodeCombination(c))),
    );
    assert.deepEqual(
      index.get(7)?.madeFrom.map((c) => c.number),
      [1],
    );
    assert.deepEqual(
      index.get(7)?.usedIn.map((c) => c.number),
      [2],
    );
    assert.deepEqual(
      index.get(163)?.usedIn.map((c) => c.number),
      [1],
    );
    assert.equal(index.get(163)?.madeFrom.length, 0);
    assert.equal(index.get(999), undefined);
  });

  test("a combination that makes one of its ingredients is only listed as made", () => {
    const more = decodeCombination(encodeCombination({ ...megaPotion, result: ref(7, "Potion") }));
    const index = indexCombinations([more]);
    assert.deepEqual(
      index.get(7)?.madeFrom.map((c) => c.number),
      [2],
    );
    assert.equal(index.get(7)?.usedIn.length, 0);
    assert.equal(index.get(161)?.usedIn.length, 1);
  });

  test("the bundle keeps the book bonuses and indexes every item", () => {
    const decoded = decodeCombinations(
      encodeCombinations({ books: [], book_bonus: [0, 5, 10], combinations: [potion, megaPotion] }),
    );
    assert.deepEqual(decoded.bookBonus, [0, 5, 10]);
    assert.deepEqual(
      decoded.byItem.get(7)?.usedIn.map((c) => c.number),
      [2],
    );
  });

  test("an item combined with itself is listed once", () => {
    const twice = decodeCombination(
      encodeCombination({ ...potion, ingredients: [ref(163, "Herb"), ref(163, "Herb")] }),
    );
    assert.equal(indexCombinations([twice]).get(163)?.usedIn.length, 1);
  });

  test("quantities and notes", () => {
    const p = decodeCombination(encodeCombination(pellet));
    assert.equal(quantityLabel(p.quantity), "×1-3");
    assert.equal(quantityLabel([{ amount: 2, chance: 100 }]), "×2");
    assert.deepEqual(combinationNotes(p), [
      "Needs Alchemy or the Alchemy Guide",
      "100% with Trap Master",
      "Makes 1 (5%), 2 (85%), 3 (10%)",
    ]);
    assert.deepEqual(combinationNotes(decodeCombination(encodeCombination(potion))), []);
  });
});

describe("data/combinations.json", () => {
  const file = readData(DATA_DIR, "combinations.json") as CombinationsFile;
  const { items } = readData(DATA_DIR, "items.json") as {
    items: ItemRecord[];
  };
  const byId = new Map(items.map((i) => [i.id, i]));

  test("is the whole Combination List, numbered from 1", () => {
    assert.equal(file.combinations.length, 172);
    assert.deepEqual(
      file.combinations.map((c) => c.number),
      file.combinations.map((_, i) => i + 1),
    );
    assert.equal(file.combinations[0].result.name, "Potion");
  });

  test("names every item as data/items.json does", () => {
    const refs = [...file.books, ...file.combinations.flatMap((c) => [c.result, ...c.ingredients])];
    for (const r of refs) {
      const item = byId.get(r.id);
      assert.ok(item && !item.placeholder, `item ${r.id} (${r.name}) is not a real item`);
      assert.equal(r.name, item.name, `item ${r.id}`);
    }
  });

  test("every quantity's chances add up to 100", () => {
    for (const c of file.combinations)
      assert.equal(
        c.quantity.reduce((n, q) => n + q.chance, 0),
        100,
        `No. ${c.number}`,
      );
  });

  test("no two combinations share a pair of ingredients", () => {
    const pairs = file.combinations.map((c) =>
      c.ingredients
        .map((i) => i.id)
        .sort((a, b) => a - b)
        .join("+"),
    );
    assert.equal(new Set(pairs).size, pairs.length);
  });
});
