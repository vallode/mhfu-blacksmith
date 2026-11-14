/** The wishlist (lib/wishlist.ts, lib/wishlist-store.ts): recipes, upgrade paths, material totals and source rankings. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import type { ItemPlaces } from "../src/lib/item-places";
import type { ItemSources } from "../src/lib/item-sources";
import { DATA_DIR } from "../src/lib/paths";
import { readData } from "game-data";

/** The site's own content: the weapon trees the bundles are built from. */
const CONTENT_DIR = path.resolve(__dirname, "../content");
import { slugify } from "../src/lib/slug";
import type { Material, Weapon, WeaponTreeNode } from "../src/lib/types";
import {
  bestDestinations,
  defaultRecipe,
  entryHref,
  entryKey,
  itemWays,
  recipesOf,
  totalCost,
  totalMaterials,
  treeParents,
  upgradeAncestors,
  weaponSteps,
  type MaterialNeed,
} from "../src/lib/wishlist";
import { parseWishlist, toggleEntry } from "../src/lib/wishlist-store";

const mat = (name: string, amount: number): Material => ({
  name,
  amount,
  type: "ore",
  color: "gray",
});

function weapon(name: string, w: Partial<Weapon> = {}): Weapon {
  return { name, slug: slugify(name), type: "great-sword", ...w };
}

// Bone → Bone+ → Big Bone → Huge Bone; Big Bone can also be created outright.
const tree = [
  weapon("Bone", { create_mats: [mat("Bone", 2)], create_cost: 100 }),
  weapon("Bone+", {
    improve_from: "Bone",
    improve_mats: [mat("Bone", 3)],
    improve_cost: 200,
  }),
  weapon("Big Bone", {
    improve_from: ["Bone+", "Other"],
    improve_mats: [mat("Monster Bone", 1)],
    improve_cost: 400,
    create_mats: [mat("Monster Bone", 4)],
    create_cost: 900,
  }),
  weapon("Huge Bone", {
    improve_from: "Big Bone",
    improve_mats: [mat("Monster Bone", 2), mat("Bone", 1)],
    improve_cost: 800,
  }),
];
const byName = new Map(tree.map((w) => [w.name, w]));
const [bone, , bigBone, hugeBone] = tree;
const names = (steps: { name: string; recipe: string }[]) =>
  steps.map((s) => `${s.recipe} ${s.name}`);

describe("entries", () => {
  test("keys and pages", () => {
    const w = { kind: "weapon", type: "great-sword", slug: "bone" } as const;
    const a = { kind: "armor", slot: "helmet", rank: "g-rank", slug: "rath-helm" } as const;
    assert.equal(entryKey(w), "weapon/great-sword/bone");
    assert.equal(entryHref(w), "/blacksmith/great-sword/bone/");
    assert.equal(entryKey(a), "armor/helmet/g-rank/rath-helm");
    assert.equal(entryHref(a), "/armorsmith/helmet/g-rank/rath-helm/");
  });

  test("toggle adds first and removes", () => {
    const ref = { kind: "weapon", type: "bow", slug: "hunters-bow" } as const;
    const [added, on] = toggleEntry([], ref);
    assert.equal(on, true);
    assert.equal(added.length, 1);
    const [removed, off] = toggleEntry(added, ref);
    assert.equal(off, false);
    assert.deepEqual(removed, []);
  });

  test("parse drops malformed and repeated entries", () => {
    const ok = { kind: "weapon", type: "bow", slug: "a", addedAt: 1 };
    const raw = JSON.stringify([
      ok,
      { ...ok, addedAt: 2 },
      { kind: "weapon", type: "spear", slug: "b", addedAt: 1 },
      { kind: "armor", slot: "helmet", rank: "g-rank", slug: "c", addedAt: 1, recipe: "x" },
      { kind: "armor", slot: "helmet", rank: "g-rank", slug: "c", addedAt: 1, recipe: "alt" },
      null,
    ]);
    assert.deepEqual(
      parseWishlist(raw).map((e) => e.slug),
      ["a", "c"],
    );
    assert.deepEqual(parseWishlist("not json"), []);
    assert.deepEqual(parseWishlist(null), []);
  });
});

describe("recipes", () => {
  test("which recipes a weapon has, and the default", () => {
    assert.deepEqual(recipesOf(bone), ["create"]);
    assert.deepEqual(recipesOf(bigBone), ["improve", "create"]);
    assert.deepEqual(recipesOf(hugeBone), ["improve"]);
    assert.equal(defaultRecipe(bigBone), "create");
    assert.equal(defaultRecipe(hugeBone), "improve");
  });

  test("ancestors follow the first parent to the root", () => {
    assert.deepEqual(
      upgradeAncestors(hugeBone, byName).map((a) => [a.name, a.creatable]),
      [
        ["Big Bone", true],
        ["Bone+", false],
        ["Bone", true],
      ],
    );
  });

  test("an upgrade from the weapon before it is one step", () => {
    assert.deepEqual(names(weaponSteps(hugeBone, "improve", undefined, byName)), [
      "improve Huge Bone",
    ]);
    assert.deepEqual(names(weaponSteps(hugeBone, "improve", "big-bone", byName)), [
      "improve Huge Bone",
    ]);
  });

  test("an upgrade from further up takes every step between", () => {
    assert.deepEqual(names(weaponSteps(hugeBone, "improve", "bone", byName)), [
      "improve Bone+",
      "improve Big Bone",
      "improve Huge Bone",
    ]);
  });

  test("from scratch creates the nearest creatable weapon up the tree", () => {
    assert.deepEqual(names(weaponSteps(hugeBone, "improve", null, byName)), [
      "create Big Bone",
      "improve Huge Bone",
    ]);
    const bonePlus = byName.get("Bone+")!;
    assert.deepEqual(names(weaponSteps(bonePlus, "improve", null, byName)), [
      "create Bone",
      "improve Bone+",
    ]);
  });

  test("a start that isn't up the path is ignored", () => {
    assert.deepEqual(names(weaponSteps(hugeBone, "improve", "nowhere", byName)), [
      "improve Huge Bone",
    ]);
  });

  test("create ignores the path", () => {
    assert.deepEqual(names(weaponSteps(bigBone, "create", "bone", byName)), ["create Big Bone"]);
  });
});

describe("tree parents", () => {
  test("from the trees, across types, preferring the row a branch hangs from", () => {
    const node = (name: string, extra: Partial<WeaponTreeNode> = {}): WeaponTreeNode => ({
      name,
      slug: slugify(name),
      type: "dual-blades",
      ...extra,
    });
    const parents = treeParents([
      [
        node("Odyssey", {
          type: "sword-and-shield",
          children: [node("Hurricane", { children: [node("Cyclone")] })],
        }),
        node("Hunter's Dagger", { children: [node("Cyclone", { alias: true })] }),
      ],
    ]);
    assert.equal(parents.get("Hurricane"), "Odyssey");
    assert.equal(parents.get("Cyclone"), "Hurricane");
    assert.equal(parents.has("Odyssey"), false);
  });
});

describe("materials", () => {
  const ids: Record<string, number> = { bone: 10, "monster bone": 11, "monster bone x1": 11 };
  const idOf = (n: string) => ids[n.toLowerCase()];

  test("sums by item over every craft, tagging the gear", () => {
    const crafts = [
      { gear: "Huge Bone", steps: weaponSteps(hugeBone, "improve", "bone", byName) },
      { gear: "Big Bone", steps: weaponSteps(bigBone, "create", undefined, byName) },
    ];
    const needs = totalMaterials(crafts, idOf);
    assert.deepEqual(
      needs.map((n) => [n.name, n.itemId, n.amount, n.for]),
      [
        ["Bone", 10, 4, ["Huge Bone"]],
        ["Monster Bone", 11, 7, ["Huge Bone", "Big Bone"]],
      ],
    );
    assert.equal(totalCost(crafts), 200 + 400 + 800 + 900);
  });
});

describe("ways and destinations", () => {
  const sources: ItemSources = {
    monsters: [
      {
        monster: { name: "Rathalos", href: "/r/" },
        rank: "G Rank",
        source: { title: "Body carves", count: 3 },
        chance: 50,
        quantity: 1,
      },
      {
        monster: { name: "Rathian", href: "/q/" },
        rank: "Low Rank",
        source: { title: "Shiny drop" },
        chance: 10,
        quantity: 1,
      },
      {
        monster: { name: "Kut-Ku", href: "/k/" },
        rank: "Low Rank",
        source: { title: "Body carves", count: 3 },
        chance: 20,
        quantity: 1,
      },
    ],
    quests: [],
  };
  const places: ItemPlaces = {
    gathering: [
      {
        group: "High Rank",
        map: "Volcano",
        points: [{ kind: "mine", areas: [2] }],
        chance: 30,
      },
    ],
    shops: [],
  };

  test("earliest rank first, then the most per try", () => {
    const ways = itemWays(sources, places, [{ ingredients: [1, 2], successRate: 90 }], {
      get: (id) => ({ name: `Item ${id}`, known: true }),
    });
    assert.deepEqual(
      ways.map((w) => `${w.kind} ${w.name}`),
      [
        "monster Kut-Ku",
        "monster Rathian",
        "gather Volcano",
        "monster Rathalos",
        "combine Item 1 + Item 2",
      ],
    );
  });

  test("a shop comes first", () => {
    const ways = itemWays(
      sources,
      {
        gathering: [],
        shops: [
          { shop: "General Store", currency: "zenny", price: 50, stages: [1], stageCount: 3 },
        ],
      },
      undefined,
      null,
    );
    assert.equal(ways[0].kind, "shop");
  });

  test("later stock and Pokke Points don't come first", () => {
    const ways = itemWays(
      sources,
      {
        gathering: [],
        shops: [
          { shop: "Late Store", currency: "zenny", price: 50, stages: [3], stageCount: 3 },
          { shop: "Pokke", currency: "pokke-points", price: null, stages: [1], stageCount: 1 },
        ],
      },
      undefined,
      null,
    );
    assert.notEqual(ways[0].kind, "shop");
    assert.ok(ways.filter((w) => w.kind === "shop").every((w) => w.tier === 3));
  });

  test("quest-only gathering stays apart, ranked by its quests", () => {
    const point = { kind: "mine" as const, areas: [1] };
    const ways = itemWays(
      undefined,
      {
        gathering: [
          { group: "Village", map: "Jungle (Day)", points: [point], chance: 50, quests: [7] },
          { group: "Village", map: "Jungle (Night)", points: [point], chance: 10 },
        ],
        shops: [],
      },
      undefined,
      null,
      new Map([[7, { hub: "village" as const, stars: 8 }]]),
    );
    assert.deepEqual(
      ways.map((w) => [w.name, w.tier, !!w.quests]),
      [
        ["Jungle", 0, false],
        ["Jungle", 1, true],
      ],
    );
  });

  test("destinations rank by how many missing materials they give", () => {
    const need = (name: string): MaterialNeed => ({
      name,
      href: `/items/${name}/`,
      type: "ore",
      color: "gray",
      amount: 1,
      for: [],
    });
    const way = (
      kind: "monster" | "gather" | "shop",
      name: string,
      group: string,
      chance: number,
    ) => ({
      kind,
      name,
      group,
      detail: "",
      chance,
      tier: kind === "shop" ? -1 : group === "Low Rank" ? 0 : 1,
      yield: chance / 100,
    });
    const d = bestDestinations([
      {
        need: need("a"),
        ways: [
          way("monster", "Rathalos", "High Rank", 10),
          way("monster", "Kut-Ku", "Low Rank", 50),
        ],
      },
      {
        need: need("b"),
        ways: [
          way("monster", "Rathalos", "High Rank", 20),
          way("monster", "Kut-Ku", "Low Rank", 5),
        ],
      },
      { need: need("c"), ways: [way("monster", "Rathalos", "High Rank", 30)] },
      // Bought, so it doesn't count for anyone.
      {
        need: need("d"),
        ways: [way("shop", "Store", "", 100), way("monster", "Kut-Ku", "Low Rank", 50)],
      },
      // Only one material, still a place to go.
      { need: need("e"), ways: [way("monster", "Rathian", "Low Rank", 5)] },
    ]);
    assert.deepEqual(
      d.map((x) => [x.name, x.materials.map((m) => m.need.name)]),
      [
        ["Rathalos", ["a", "b", "c"]],
        ["Kut-Ku", ["a", "b"]],
        ["Rathian", ["e"]],
      ],
    );
  });
});

describe("game data", () => {
  test("every weapon's path from scratch starts with a create and ends with it", () => {
    // One lookup over every type: Dual Blades upgrade from Sword and Shield.
    const dir = path.join(DATA_DIR, "weapons");
    const list = fs.readdirSync(dir).flatMap((file) => {
      const { weapons } = readData(DATA_DIR, "weapons", file) as {
        weapons: Weapon[];
      };
      return weapons.map((w) => ({ ...w, slug: slugify(w.name) }));
    });
    assert.equal(
      new Set(list.map((w) => w.name)).size,
      list.length,
      "names are unique across types",
    );

    // Parents as the page finds them: from the trees, not improve_from.
    const trees = fs
      .readdirSync(path.join(CONTENT_DIR, "blacksmith"))
      .map(
        (type) =>
          JSON.parse(
            fs.readFileSync(path.join(CONTENT_DIR, "blacksmith", type, "map.json"), "utf-8"),
          ).map as WeaponTreeNode[],
      );
    const parents = treeParents(trees);
    for (const w of list) {
      const from = [w.improve_from ?? []].flat();
      const parent = parents.get(w.name);
      if (from.length)
        assert.ok(parent && from.includes(parent), `${w.name}: tree parent ${parent}`);
      else assert.equal(parent, undefined, w.name);
    }
    const map = new Map(
      list.map((w) => [w.name, { ...w, improve_from: parents.get(w.name) ?? null }]),
    );
    let checked = 0;
    for (const w of map.values()) {
      if (!recipesOf(w).includes("improve")) continue;
      const steps = weaponSteps(w, "improve", null, map);
      assert.equal(steps.at(-1)!.name, w.name);
      assert.equal(steps[0].recipe, "create", `${w.name} has no creatable ancestor`);
      assert.equal(
        steps.length,
        upgradeAncestors(w, map).findIndex((a) => a.creatable) + 2,
        w.name,
      );
      checked++;
    }
    assert.ok(checked > 900, `checked ${checked}`);
  });
});
