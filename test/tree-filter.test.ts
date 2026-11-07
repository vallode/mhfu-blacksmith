/**
 * The per-material upgrade check (lib/hunter-progress.ts) and the weapon tree
 * filter built on it (lib/tree-filter.ts), on small hand-made inputs.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkUpgrade, type UpgradeCheck } from "../src/lib/hunter-progress";
import { cycleTreeFilter, filterTree, matchesTreeFilter, type ProgressLookups, type TreeFilterId } from "../src/lib/tree-filter";
import type { CompactWeapon, Dictionaries } from "../src/lib/schema";
import type { WeaponTreeNode } from "../src/lib/types";

const dict = { material_ids: ["Iron Ore", "Machalite Ore", "Monster Bone S"] } as unknown as Dictionaries;
/** recipe material name -> in-game item ID */
const materials = { "Iron Ore": 10, "Machalite Ore": 11, "Monster Bone S": 12 };
const weapon = (im: CompactWeapon["im"], ic = 1000): CompactWeapon => ({ n: "Test", s: "test", im, ic });

describe("checkUpgrade", () => {
  test("ready: every material and the zenny in hand", () => {
    const counts = new Map([
      [10, 5],
      [11, 2],
    ]);
    assert.deepEqual(checkUpgrade(dict, materials, weapon([[0, 3], [1, 2]]), counts, 1000), {
      status: "ready",
      cost: 1000,
      missing: 0,
      materials: [
        { name: "Iron Ore", need: 3, have: 5 },
        { name: "Machalite Ore", need: 2, have: 2 },
      ],
    });
  });

  test("short: counts each short material once, and the zenny as one more", () => {
    const counts = new Map([[10, 1]]);
    const result = checkUpgrade(dict, materials, weapon([[0, 3], [1, 2], [2, 1]], 5000), counts, 4000);
    assert.equal(result.status, "short");
    assert.ok(result.status === "short");
    assert.equal(result.missing, 4);
    assert.equal(result.cost, 5000);
    assert.deepEqual(result.materials, [
      { name: "Iron Ore", need: 3, have: 1 },
      { name: "Machalite Ore", need: 2, have: 0 },
      { name: "Monster Bone S", need: 1, have: 0 },
    ]);
  });

  test("short by the zenny alone is one missing item", () => {
    const counts = new Map([[10, 3]]);
    const result = checkUpgrade(dict, materials, weapon([[0, 3]], 1200), counts, 1199);
    assert.ok(result.status === "short");
    assert.equal(result.missing, 1);
    assert.deepEqual(result.materials, [{ name: "Iron Ore", need: 3, have: 3 }]);
  });

  test("the infinite-stack item always covers the recipe", () => {
    const counts = new Map([[10, Infinity]]);
    assert.equal(checkUpgrade(dict, materials, weapon([[0, 99]]), counts, 1000).status, "ready");
  });

  test("a save stored before zenny was kept still checks materials, not the cost", () => {
    const counts = new Map([[10, 3]]);
    const result = checkUpgrade(dict, materials, weapon([[0, 3]], 99999), counts, undefined);
    assert.equal(result.status, "ready");
    assert.ok(result.status === "ready");
    assert.deepEqual(result.materials, [{ name: "Iron Ore", need: 3, have: 3 }]);
  });

  test("unknown: no save, no improve recipe, unlinked material or odd amount", () => {
    const counts = new Map([[10, 5]]);
    const unknown = { status: "unknown" };
    assert.deepEqual(checkUpgrade(dict, materials, weapon([[0, 1]]), null, 1000), unknown);
    assert.deepEqual(checkUpgrade(dict, materials, weapon(undefined), counts, 1000), unknown);
    assert.deepEqual(checkUpgrade(dict, { "Iron Ore": 10 }, weapon([[0, 1], [1, 1]]), counts, 1000), unknown);
    assert.deepEqual(checkUpgrade(dict, materials, weapon([[0, "1-2"]]), counts, 1000), unknown);
  });
});

describe("tree filter", () => {
  const ready: UpgradeCheck = { status: "ready", cost: 0, missing: 0, materials: [] };
  const shortOne: UpgradeCheck = { status: "short", cost: 0, missing: 1, materials: [] };
  const shortTwo: UpgradeCheck = { status: "short", cost: 0, missing: 2, materials: [] };

  // root (owned) -> a (ready), b (short by one) -> d, c (short by two),
  //                 e (owned), x (a lance this sword upgrades into, ready)
  const tree: WeaponTreeNode[] = [
    {
      slug: "root",
      name: "Root",
      type: "great-sword",
      rarity: 1,
      children: [
        { slug: "a", name: "A", type: "great-sword", rarity: 2 },
        { slug: "b", name: "B", type: "great-sword", rarity: 2, children: [{ slug: "d", name: "D", type: "great-sword", rarity: 3 }] },
        { slug: "c", name: "C", type: "great-sword", rarity: 2 },
        { slug: "e", name: "E", type: "great-sword", rarity: 2 },
        { slug: "x", name: "X", type: "lance", rarity: 2 },
      ],
    },
  ];
  const owned = new Set(["/blacksmith/great-sword/root/", "/blacksmith/great-sword/e/"]);
  const checks: Record<string, UpgradeCheck> = { a: ready, b: shortOne, c: shortTwo, d: ready, e: ready, x: ready };
  const asked: string[] = [];
  const progress: ProgressLookups = {
    active: true,
    isOwned: (href) => owned.has(href),
    upgradeCheck: (type, slug) => {
      asked.push(`${type}/${slug}`);
      return checks[slug] ?? null;
    },
  };
  const run = (filter: TreeFilterId) => filterTree(tree, "great-sword", "/blacksmith/great-sword/", progress, filter);
  const matching = (filter: TreeFilterId) =>
    [...run(filter).rows].filter(([, row]) => row.match).map(([slug]) => slug);

  test("only checks unowned weapons whose parent is owned", () => {
    asked.length = 0;
    const { rows } = run("all");
    // d's parent b isn't owned, e is owned itself, root has no parent.
    assert.deepEqual(asked.sort(), ["great-sword/a", "great-sword/b", "great-sword/c", "lance/x"]);
    assert.equal(rows.get("d")?.upgrade, null);
    assert.equal(rows.get("x")?.href, "/blacksmith/lance/x/");
    assert.equal(rows.get("x")?.external, true);
  });

  test("matches per filter; cross-type rows only under All", () => {
    assert.deepEqual(matching("all"), ["root", "a", "b", "d", "c", "e", "x"]);
    assert.deepEqual(matching("owned"), ["root", "e"]);
    assert.deepEqual(matching("not-owned"), ["a", "b", "d", "c"]);
    assert.deepEqual(matching("craftable"), ["a"]);
    assert.deepEqual(matching("within-one"), ["a", "b"]);
  });

  test("counts every row, cross-type rows included in the total", () => {
    const { matched, total } = run("craftable");
    assert.equal(matched, 1);
    assert.equal(total, 7);
  });

  test("a row still loading its check matches neither Craftable nor Within 1", () => {
    const row = { external: false, owned: false, upgrade: null };
    assert.equal(matchesTreeFilter("craftable", row), false);
    assert.equal(matchesTreeFilter("within-one", row), false);
    assert.equal(matchesTreeFilter("not-owned", row), true);
  });

  test("cycles in order and wraps around", () => {
    const order: TreeFilterId[] = ["all"];
    for (let i = 0; i < 5; i++) order.push(cycleTreeFilter(order[order.length - 1], 1));
    assert.deepEqual(order, ["all", "owned", "not-owned", "craftable", "within-one", "all"]);
    assert.equal(cycleTreeFilter("all", -1), "within-one");
  });
});
