/**
 * The per-material craft checks (lib/hunter-progress.ts) and the weapon tree
 * filter built on it (lib/tree-filter.ts), on small hand-made inputs.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkCraft, checkCreate, checkUpgrade, type CraftCheck } from "../src/lib/hunter-progress";
import {
  cycleTreeFilter,
  filterTree,
  matchesTreeFilter,
  treeRowKey,
  type ProgressLookups,
  type TreeFilterId,
} from "../src/lib/tree-filter";
import type { CompactWeapon, Dictionaries } from "../src/lib/schema";
import type { WeaponTreeNode } from "../src/lib/types";

const dict = {
  material_ids: ["Iron Ore", "Machalite Ore", "Monster Bone S"],
} as unknown as Dictionaries;
/** recipe material name -> in-game item ID */
const materials = { "Iron Ore": 10, "Machalite Ore": 11, "Monster Bone S": 12 };
const weapon = (im: CompactWeapon["im"], ic = 1000): CompactWeapon => ({
  n: "Test",
  s: "test",
  im,
  ic,
});

describe("checkUpgrade", () => {
  test("ready: every material and the zenny in hand", () => {
    const counts = new Map([
      [10, 5],
      [11, 2],
    ]);
    assert.deepEqual(
      checkUpgrade(
        dict,
        materials,
        weapon([
          [0, 3],
          [1, 2],
        ]),
        counts,
        1000,
      ),
      {
        status: "ready",
        via: "upgrade",
        cost: 1000,
        missing: 0,
        materials: [
          { name: "Iron Ore", need: 3, have: 5 },
          { name: "Machalite Ore", need: 2, have: 2 },
        ],
      },
    );
  });

  test("short: counts each short material once, and the zenny as one more", () => {
    const counts = new Map([[10, 1]]);
    const result = checkUpgrade(
      dict,
      materials,
      weapon(
        [
          [0, 3],
          [1, 2],
          [2, 1],
        ],
        5000,
      ),
      counts,
      4000,
    );
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
    assert.deepEqual(
      checkUpgrade(
        dict,
        { "Iron Ore": 10 },
        weapon([
          [0, 1],
          [1, 1],
        ]),
        counts,
        1000,
      ),
      unknown,
    );
    assert.deepEqual(checkUpgrade(dict, materials, weapon([[0, "1-2"]]), counts, 1000), unknown);
  });
});

describe("checkCreate and checkCraft", () => {
  // Forged from 2 Iron Ore for 500z, or upgraded from its parent with
  // 1 Machalite Ore for 1000z.
  const both: CompactWeapon = {
    n: "Test",
    s: "test",
    cm: [[0, 2]],
    cc: 500,
    im: [[1, 1]],
    ic: 1000,
  };

  test("checkCreate uses the create recipe and cost", () => {
    const counts = new Map([[10, 2]]);
    assert.deepEqual(checkCreate(dict, materials, both, counts, 500), {
      status: "ready",
      via: "create",
      cost: 500,
      missing: 0,
      materials: [{ name: "Iron Ore", need: 2, have: 2 }],
    });
    assert.equal(
      checkCreate(dict, materials, weapon([[0, 1]]), counts, 1000).status,
      "unknown",
      "a weapon with no create recipe can't be forged",
    );
  });

  test("without the parent, only forging counts", () => {
    const counts = new Map([[11, 1]]);
    const result = checkCraft(dict, materials, both, counts, 9999, false);
    assert.ok(result.status === "short");
    assert.equal(result.via, "create");
    assert.equal(
      checkCraft(dict, materials, weapon([[1, 1]]), counts, 9999, false).status,
      "unknown",
      "an upgrade-only weapon needs its parent",
    );
  });

  test("with the parent, the closer route wins; a tie goes to the upgrade", () => {
    const forge = checkCraft(dict, materials, both, new Map([[10, 2]]), 9999, true);
    assert.ok(forge.status === "ready" && forge.via === "create");
    const upgrade = checkCraft(dict, materials, both, new Map([[11, 1]]), 9999, true);
    assert.ok(upgrade.status === "ready" && upgrade.via === "upgrade");
    const tie = checkCraft(
      dict,
      materials,
      both,
      new Map([
        [10, 2],
        [11, 1],
      ]),
      9999,
      true,
    );
    assert.ok(tie.status === "ready" && tie.via === "upgrade");
    // Forging is one Iron Ore short; the upgrade lacks Machalite Ore and the zenny.
    const closer = checkCraft(dict, materials, both, new Map([[10, 1]]), 700, true);
    assert.ok(closer.status === "short" && closer.via === "create" && closer.missing === 1);
  });
});

describe("tree filter", () => {
  const ready: CraftCheck = { status: "ready", via: "upgrade", cost: 0, missing: 0, materials: [] };
  const shortOne: CraftCheck = {
    status: "short",
    via: "upgrade",
    cost: 0,
    missing: 1,
    materials: [],
  };
  const shortTwo: CraftCheck = {
    status: "short",
    via: "upgrade",
    cost: 0,
    missing: 2,
    materials: [],
  };

  // root (owned) -> a (ready), b (short by one) -> d (forgeable), c (short by two),
  //                 e (owned), x (a lance this sword upgrades into, ready)
  const tree: WeaponTreeNode[] = [
    {
      slug: "root",
      name: "Root",
      type: "great-sword",
      rarity: 1,
      children: [
        { slug: "a", name: "A", type: "great-sword", rarity: 2 },
        {
          slug: "b",
          name: "B",
          type: "great-sword",
          rarity: 2,
          children: [{ slug: "d", name: "D", type: "great-sword", rarity: 3 }],
        },
        { slug: "c", name: "C", type: "great-sword", rarity: 2 },
        { slug: "e", name: "E", type: "great-sword", rarity: 2 },
        { slug: "x", name: "X", type: "lance", rarity: 2 },
      ],
    },
  ];
  const owned = new Set(["/blacksmith/great-sword/root/", "/blacksmith/great-sword/e/"]);
  const checks: Record<string, CraftCheck> = {
    a: ready,
    b: shortOne,
    c: shortTwo,
    d: ready,
    e: ready,
    x: ready,
  };
  const asked: string[] = [];
  const progress: ProgressLookups = {
    active: true,
    isOwned: (href) => owned.has(href),
    craftCheck: (type, slug, parentOwned) => {
      asked.push(`${type}/${slug}${parentOwned ? " (parent owned)" : ""}`);
      return checks[slug] ?? null;
    },
  };
  const run = (filter: TreeFilterId) =>
    filterTree(tree, "great-sword", "/blacksmith/great-sword/", progress, filter);
  const matching = (filter: TreeFilterId) =>
    [...run(filter).rows].filter(([, row]) => row.match).map(([slug]) => slug);

  test("checks every unowned weapon, saying whether its parent is owned", () => {
    asked.length = 0;
    const { rows } = run("all");
    // root and e are owned; d's parent b isn't.
    assert.deepEqual(asked.sort(), [
      "great-sword/a (parent owned)",
      "great-sword/b (parent owned)",
      "great-sword/c (parent owned)",
      "great-sword/d",
      "lance/x (parent owned)",
    ]);
    assert.equal(rows.get("d")?.craft, ready);
    assert.equal(rows.get("e")?.craft, null);
    assert.equal(rows.get("x")?.href, "/blacksmith/lance/x/");
    assert.equal(rows.get("x")?.external, true);
  });

  test("matches per filter; cross-type rows only under All", () => {
    assert.deepEqual(matching("all"), ["root", "a", "b", "d", "c", "e", "x"]);
    assert.deepEqual(matching("owned"), ["root", "e"]);
    assert.deepEqual(matching("not-owned"), ["a", "b", "d", "c"]);
    assert.deepEqual(matching("craftable"), ["a", "d"]);
    assert.deepEqual(matching("within-one"), ["a", "b", "d"]);
  });

  test("counts every row, cross-type rows included in the total", () => {
    const { matched, total } = run("craftable");
    assert.equal(matched, 2);
    assert.equal(total, 7);
  });

  test("a row still loading its check matches neither Craftable nor Within 1", () => {
    const row = { external: false, owned: false, craft: null };
    assert.equal(matchesTreeFilter("craftable", row), false);
    assert.equal(matchesTreeFilter("within-one", row), false);
    assert.equal(matchesTreeFilter("not-owned", row), true);
  });

  test("weapons forged from scratch count without owning anything", () => {
    const nothingOwned: ProgressLookups = {
      active: true,
      isOwned: () => false,
      craftCheck: (_type, slug, parentOwned) =>
        // Only the root has a create recipe; the rest are upgrades.
        slug === "root" ? { ...ready, via: "create" } : parentOwned ? ready : { status: "unknown" },
    };
    const { rows, matched } = filterTree(
      tree,
      "great-sword",
      "/blacksmith/great-sword/",
      nothingOwned,
      "craftable",
    );
    assert.equal(matched, 1);
    assert.equal(rows.get("root")?.match, true);
  });

  test("an alias row has its own status, and its weapon counts once", () => {
    // m upgrades from both p (not owned) and q (owned); its branch is under p.
    const merged: WeaponTreeNode[] = [
      {
        slug: "p",
        name: "P",
        type: "great-sword",
        rarity: 1,
        children: [{ slug: "m", name: "M", type: "great-sword", rarity: 2 }],
      },
      {
        slug: "q",
        name: "Q",
        type: "great-sword",
        rarity: 1,
        children: [{ slug: "m", name: "M", type: "great-sword", rarity: 2, alias: true }],
      },
    ];
    const lookups: ProgressLookups = {
      active: true,
      isOwned: (href) => href === "/blacksmith/great-sword/q/",
      craftCheck: (_type, slug, parentOwned) =>
        slug === "m" && parentOwned ? ready : { status: "unknown" },
    };
    const { rows, matched, total } = filterTree(
      merged,
      "great-sword",
      "/blacksmith/great-sword/",
      lookups,
      "craftable",
    );
    const first = rows.get(treeRowKey(merged[0].children![0], "/blacksmith/great-sword/p/"));
    const alias = rows.get(treeRowKey(merged[1].children![0], "/blacksmith/great-sword/q/"));
    // Only the upgrade from the owned parent, under the alias, is ready.
    assert.equal(first?.match, false);
    assert.equal(alias?.match, true);
    assert.equal(total, 3);
    assert.equal(matched, 1);
  });

  test("cycles in order and wraps around", () => {
    const order: TreeFilterId[] = ["all"];
    for (let i = 0; i < 5; i++) order.push(cycleTreeFilter(order[order.length - 1], 1));
    assert.deepEqual(order, ["all", "owned", "not-owned", "craftable", "within-one", "all"]);
    assert.equal(cycleTreeFilter("all", -1), "within-one");
  });
});
