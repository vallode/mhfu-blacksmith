/**
 * The weapon tree's element filter (lib/tree-filter.ts) and its list views
 * (lib/tree-groups.ts), on a small hand-made tree.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  filterTree,
  matchesElementFilter,
  nodeElements,
  type ProgressLookups,
} from "../src/lib/tree-filter";
import {
  elementFilterCounts,
  groupByElement,
  groupByRarity,
  groupMatchesElementFilter,
  treeWeapons,
} from "../src/lib/tree-groups";
import { decodeTreeNode } from "../src/lib/schema";
import type { WeaponTreeNode } from "../src/lib/types";

const basePath = "/blacksmith/dual-blades/";
const node = (
  slug: string,
  rarity: number,
  extra: Partial<WeaponTreeNode> = {},
): WeaponTreeNode => ({ slug, name: slug, type: "dual-blades", rarity, ...extra });

// raw -> fire -> fire/ice (dual) ; raw -> poison ; a sword-and-shield upgrade
// (cross-type, fire) ; and an alias row of the fire blades under poison.
const tree: WeaponTreeNode[] = [
  node("raw", 1, {
    children: [
      node("fire", 2, {
        element: "fire",
        children: [node("frost-flame", 4, { element: "fire", elements: ["fire", "ice"] })],
      }),
      node("venom", 3, {
        element: "poison",
        children: [node("fire", 2, { element: "fire", alias: true })],
      }),
      node("shield", 3, { type: "sword-and-shield", element: "fire" }),
    ],
  }),
];

const noHunter: ProgressLookups = {
  active: false,
  isOwned: () => false,
  craftCheck: () => null,
};

describe("matchesElementFilter", () => {
  test("one element, any, any status, none", () => {
    assert.equal(matchesElementFilter("fire", ["fire"]), true);
    assert.equal(matchesElementFilter("ice", ["fire", "ice"]), true);
    assert.equal(matchesElementFilter("water", ["fire", "ice"]), false);
    assert.equal(matchesElementFilter("any", []), false);
    assert.equal(matchesElementFilter("any", ["sleep"]), true);
    assert.equal(matchesElementFilter("status", ["paralysis"]), true);
    assert.equal(matchesElementFilter("status", ["dragon"]), false);
    assert.equal(matchesElementFilter("none", []), true);
    assert.equal(matchesElementFilter("none", ["fire"]), false);
    assert.equal(matchesElementFilter("all", []), true);
  });

  test("a dual-element weapon carries both elements through the compact tree", () => {
    const decoded = decodeTreeNode(
      { s: "frost-flame", n: "Frost Flame", e: "fire", e2: "ice" },
      "x",
    );
    assert.equal(decoded.element, "fire");
    assert.deepEqual(nodeElements(decoded), ["fire", "ice"]);
    assert.deepEqual(nodeElements(decodeTreeNode({ s: "a", n: "A", e: "water" }, "x")), ["water"]);
    assert.deepEqual(nodeElements(decodeTreeNode({ s: "b", n: "B" }, "x")), []);
  });
});

describe("filterTree with an element filter", () => {
  const matching = (element: Parameters<typeof matchesElementFilter>[0]) =>
    [...filterTree(tree, "dual-blades", basePath, noHunter, { hunter: "all", element }).rows]
      .filter(([, row]) => row.match)
      .map(([key]) => key);

  test("matches by element; cross-type rows only under All", () => {
    assert.deepEqual(matching("fire"), ["fire", "frost-flame", `${basePath}venom/>fire`]);
    assert.deepEqual(matching("ice"), ["frost-flame"]);
    assert.deepEqual(matching("none"), ["raw"]);
    assert.deepEqual(matching("status"), ["venom"]);
    assert.equal(matching("all").length, 6);
  });

  test("counts each weapon once", () => {
    const { matched, total } = filterTree(tree, "dual-blades", basePath, noHunter, {
      hunter: "all",
      element: "fire",
    });
    assert.equal(matched, 2);
    assert.equal(total, 5);
  });
});

describe("tree groups", () => {
  const weapons = treeWeapons(tree, "dual-blades", basePath);

  test("lists each own weapon once, with its tree parent", () => {
    assert.deepEqual(
      weapons.map((w) => [w.node.slug, w.parentHref]),
      [
        ["raw", undefined],
        ["fire", `${basePath}raw/`],
        ["frost-flame", `${basePath}fire/`],
        ["venom", `${basePath}raw/`],
      ],
    );
  });

  test("by element: game order, dual-element weapons under both, no element last", () => {
    assert.deepEqual(
      groupByElement(weapons).map((g) => [g.key, g.weapons.map((w) => w.node.slug)]),
      [
        ["fire", ["fire", "frost-flame"]],
        ["ice", ["frost-flame"]],
        ["poison", ["venom"]],
        ["none", ["raw"]],
      ],
    );
  });

  test("by rarity, lowest first", () => {
    assert.deepEqual(
      groupByRarity(weapons).map((g) => [g.rarity, g.weapons.length]),
      [
        [1, 1],
        [2, 1],
        [3, 1],
        [4, 1],
      ],
    );
  });

  test("an element filter keeps only the element groups it can match", () => {
    const keys = (f: Parameters<typeof groupMatchesElementFilter>[1]) =>
      groupByElement(weapons)
        .filter((g) => groupMatchesElementFilter(g, f))
        .map((g) => g.key);
    assert.deepEqual(keys("ice"), ["ice"]);
    assert.deepEqual(keys("any"), ["fire", "ice", "poison"]);
    assert.deepEqual(keys("none"), ["none"]);
    assert.equal(
      groupByRarity(weapons).every((g) => groupMatchesElementFilter(g, "ice")),
      true,
    );
  });

  test("counts per element filter", () => {
    const counts = elementFilterCounts(weapons);
    assert.equal(counts.all, 4);
    assert.equal(counts.any, 3);
    assert.equal(counts.fire, 2);
    assert.equal(counts.ice, 1);
    assert.equal(counts.status, 1);
    assert.equal(counts.none, 1);
    assert.equal(counts.water, 0);
  });
});
