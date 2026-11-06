import assert from "node:assert/strict";
import { test } from "node:test";
import {
  displayRarity,
  formatSignedAmount,
  groupEquipCreateByEquipId,
  halveCost,
  materialsOrNull,
  rankFromRarity,
  resolveMaterial,
  resolveMaterials,
} from "../src/emit/common.js";
import type { NameResolver } from "../src/strings/names.js";

const fakeNames: NameResolver = {
  source: "mhp2g-patterns-enum",
  resolve: (table, index) => (table === "ItemID" && index === 201 ? "Disk Stone" : null),
};

test("rankFromRarity buckets by the documented breakpoints", () => {
  assert.equal(rankFromRarity(1), "low-rank");
  assert.equal(rankFromRarity(5), "low-rank");
  assert.equal(rankFromRarity(6), "high-rank");
  assert.equal(rankFromRarity(8), "high-rank");
  assert.equal(rankFromRarity(9), "g-rank");
  assert.equal(rankFromRarity(10), "g-rank");
});

test("displayRarity shifts the 0-based raw value to the schema's 1-based value", () => {
  assert.equal(displayRarity(0), 1);
  assert.equal(displayRarity(5), 6);
});

test("halveCost rounds raw sell price down to the create/improve cost", () => {
  assert.equal(halveCost(300), 150);
  assert.equal(halveCost(900), 450);
  assert.equal(halveCost(301), 151); // rounds, doesn't truncate
});

test("formatSignedAmount always shows a sign", () => {
  assert.equal(formatSignedAmount(3), "+3");
  assert.equal(formatSignedAmount(0), "+0");
  assert.equal(formatSignedAmount(-2), "-2");
});

test("resolveMaterial resolves a craft slot to the data/ material shape", () => {
  const material = resolveMaterial({ itemId: 201, quantity: 1 }, fakeNames, "weapon");
  assert.deepEqual(material, { name: "Disk Stone", amount: 1, type: "ore", color: "gray" });
});

test("resolveMaterial returns null for an unused craft slot", () => {
  assert.equal(resolveMaterial({ itemId: 0, quantity: 0 }, fakeNames, "weapon"), null);
});

test("resolveMaterial returns null when the item name can't be resolved", () => {
  assert.equal(resolveMaterial({ itemId: 9999, quantity: 1 }, fakeNames, "weapon"), null);
});

test("resolveMaterial applies a global item-name correction regardless of context", () => {
  const names: NameResolver = { source: "mhp2g-patterns-enum", resolve: (t, i) => (t === "ItemID" && i === 1 ? "High Qualty Pelt" : null) };
  const material = resolveMaterial({ itemId: 1, quantity: 1 }, names, "weapon");
  assert.equal(material?.name, "High Quality Pelt");
});

test("resolveMaterial applies an armor-scoped item-name correction only for armor context", () => {
  const names: NameResolver = { source: "mhp2g-patterns-enum", resolve: (t, i) => (t === "ItemID" && i === 2 ? "Firestone" : null) };
  const armorMaterial = resolveMaterial({ itemId: 2, quantity: 1 }, names, "armor");
  assert.equal(armorMaterial?.name, "Fire Stone");
  const weaponMaterial = resolveMaterial({ itemId: 2, quantity: 1 }, names, "weapon");
  assert.equal(weaponMaterial?.name, "Firestone");
  const decorationMaterial = resolveMaterial({ itemId: 2, quantity: 1 }, names, "decoration");
  assert.equal(decorationMaterial?.name, "Firestone");
});

test("resolveMaterials drops unused slots and resolves the rest", () => {
  const materials = resolveMaterials(
    [
      { itemId: 201, quantity: 2 },
      { itemId: 0, quantity: 0 },
      { itemId: 0, quantity: 0 },
      { itemId: 0, quantity: 0 },
    ],
    fakeNames,
    "weapon"
  );
  assert.equal(materials.length, 1);
  assert.equal(materials[0]!.name, "Disk Stone");
});

test("materialsOrNull returns null for an empty list, the list otherwise", () => {
  assert.equal(materialsOrNull([]), null);
  const list = [{ name: "Disk Stone", amount: 1, type: "ore", color: "gray" }];
  assert.equal(materialsOrNull(list), list);
});

test("groupEquipCreateByEquipId groups by equipId, preserving encounter order for duplicates", () => {
  const entries = [
    { index: 0, hide: false, equipId: 948, craft: [], unkn: 0, unkn2: 0 },
    { index: 5, hide: false, equipId: 953, craft: [], unkn: 0, unkn2: 0 },
    { index: 40, hide: false, equipId: 948, craft: [], unkn: 0, unkn2: 0 },
  ];
  const grouped = groupEquipCreateByEquipId(entries);
  assert.deepEqual(
    grouped.get(948)!.map((e) => e.index),
    [0, 40]
  );
  assert.deepEqual(
    grouped.get(953)!.map((e) => e.index),
    [5]
  );
});
