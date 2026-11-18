/** The wishlist (lib/wishlist.ts, lib/wishlist-store.ts): recipes, upgrade paths, material totals and source rankings. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import type { ItemPlaces } from "../src/lib/item-places";
import type { ItemSources } from "../src/lib/item-sources";
import { DATA_DIR } from "../src/lib/paths";
import { readData } from "game-data";

import { slugify } from "../src/lib/slug";
import { WEAPON_TYPES } from "../src/lib/constants";
import { buildWeaponTree } from "../src/lib/trees";
import type { Decoration, Material, Weapon, WeaponTreeNode } from "../src/lib/types";
import {
  addEntries,
  bestDestinations,
  decorationNeed,
  decorationSteps,
  defaultRecipe,
  entryCount,
  entryHref,
  entryKey,
  hasAll,
  itemWays,
  recipesOf,
  setWants,
  totalCost,
  totalMaterials,
  treeParents,
  upgradeAncestors,
  madeSteps,
  ownedSteps,
  stepsDone,
  untickedMade,
  weaponSteps,
  type MaterialNeed,
  type WishlistEntry,
} from "../src/lib/wishlist";
import { parseWishlist, toggleEntry, unreadableEntries } from "../src/lib/wishlist-store";

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
    const d = { kind: "decoration", slug: "attack-jewel" } as const;
    assert.equal(entryKey(d), "decoration/attack-jewel");
    assert.equal(entryHref(d), "/decorations/attack-jewel/");
  });

  test("a decoration wants one unless counted", () => {
    assert.equal(entryCount({ kind: "decoration", slug: "a", addedAt: 1 }), 1);
    assert.equal(entryCount({ kind: "decoration", slug: "a", addedAt: 1, count: 4 }), 4);
    assert.equal(
      entryCount({ kind: "armor", slot: "leggings", rank: "g-rank", slug: "a", addedAt: 1 }),
      1,
    );
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
      { kind: "weapon", type: "bow", slug: "f", addedAt: 1, made: 3 },
      { kind: "weapon", type: "bow", slug: "g", addedAt: 1, made: "bone" },
      { kind: "armor", slot: "helmet", rank: "g-rank", slug: "c", addedAt: 1, recipe: "x" },
      { kind: "armor", slot: "helmet", rank: "g-rank", slug: "c", addedAt: 1, recipe: "alt" },
      { kind: "decoration", slug: "d", addedAt: 1, count: 0 },
      { kind: "decoration", slug: "d", addedAt: 1, count: 2.5 },
      { kind: "decoration", slug: "d", addedAt: 1, count: 3 },
      { kind: "decoration", slug: "e", addedAt: 1 },
      { kind: "decoration", slug: "e", addedAt: 1, count: 2 },
      null,
    ]);
    assert.deepEqual(
      parseWishlist(raw).map((e) => e.slug),
      ["a", "g", "c", "d", "e"],
    );
    assert.deepEqual(parseWishlist("not json"), []);
  });

  test("entries this build can't read are kept apart, to write back", () => {
    const future = { kind: "palico-gear", slug: "x", addedAt: 1 };
    const raw = JSON.stringify([{ kind: "weapon", type: "bow", slug: "a", addedAt: 1 }, future, 3]);
    assert.deepEqual(unreadableEntries(raw), [future]);
    assert.deepEqual(unreadableEntries("not json"), []);
    assert.deepEqual(unreadableEntries(null), []);
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

  test("made crafts count from the start of the path, never the last", () => {
    const steps = weaponSteps(hugeBone, "improve", "bone", byName);
    assert.equal(madeSteps(steps, undefined), 0);
    assert.equal(madeSteps(steps, "bone-plus"), 1);
    assert.equal(madeSteps(steps, "big-bone"), 2);
    assert.equal(madeSteps(steps, "huge-bone"), 0);
    // Off the path (a start further down, or another recipe): nothing made.
    assert.equal(madeSteps(steps, "bone"), 0);
    assert.equal(madeSteps(weaponSteps(hugeBone, "improve", "big-bone", byName), "big-bone"), 0);
  });

  test("owning a weapon along the path counts it and every craft before it", () => {
    const steps = weaponSteps(hugeBone, "improve", "bone", byName);
    const owns = (...slugs: string[]) =>
      new Set(slugs.map((s) => steps.find((st) => st.slug === s)!.href));
    assert.equal(ownedSteps(steps, null), 0);
    assert.equal(ownedSteps(steps, new Set()), 0);
    assert.equal(ownedSteps(steps, owns("bone-plus")), 1);
    assert.equal(ownedSteps(steps, owns("big-bone")), 2);
    assert.equal(ownedSteps(steps, owns("bone-plus", "big-bone")), 2);
    // Owning the gear itself isn't a step made: the entry is owned.
    assert.equal(ownedSteps(steps, owns("huge-bone")), 0);
  });

  test("made crafts are the hand-ticked ones or the save's, whichever reach further", () => {
    const steps = weaponSteps(hugeBone, "improve", "bone", byName);
    const owns = new Set([steps[0].href]);
    assert.deepEqual(stepsDone(steps, undefined, null), { done: 0, fromSave: 0 });
    assert.deepEqual(stepsDone(steps, "big-bone", owns), { done: 2, fromSave: 1 });
    assert.deepEqual(stepsDone(steps, undefined, owns), { done: 1, fromSave: 1 });
    assert.deepEqual(stepsDone(steps, "nowhere", owns), { done: 1, fromSave: 1 });
  });

  test("unticking keeps the crafts before it, but not the save's", () => {
    const steps = weaponSteps(hugeBone, "improve", "bone", byName);
    assert.equal(untickedMade(steps, 1, 0), "bone-plus");
    assert.equal(untickedMade(steps, 0, 0), undefined);
    // The craft before is ticked by the save: nothing of the player's is left.
    assert.equal(untickedMade(steps, 1, 1), undefined);
  });

  test("create ignores the path", () => {
    assert.deepEqual(names(weaponSteps(bigBone, "create", "bone", byName)), ["create Big Bone"]);
  });
});

describe("decorations", () => {
  const jewel: Decoration = {
    name: "Attack Jewel",
    slug: "attack-jewel",
    type: "decoration",
    create_cost: 400,
    create_mats: [mat("Monster Fluid", 1), mat("Iron Ore", 2)],
    alternative_create_mats: [mat("Rathalos Scale", 1)],
  };

  test("recipes", () => {
    assert.deepEqual(recipesOf(jewel), ["create", "alt"]);
    assert.equal(defaultRecipe(jewel), "create");
    assert.deepEqual(recipesOf({ ...jewel, create_mats: [] }), ["alt"]);
  });

  test("one craft, made once per jewel still to make", () => {
    const steps = decorationSteps(jewel, "/decorations/attack-jewel/", "create", 3);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].times, 3);
    assert.equal(totalCost([{ steps }]), 1200);
    const mats = totalMaterials([{ gear: jewel.name, steps }], () => undefined);
    assert.deepEqual(
      mats.map((m) => [m.name, m.amount]),
      [
        ["Monster Fluid", 3],
        ["Iron Ore", 6],
      ],
    );
    assert.deepEqual(
      decorationSteps(jewel, "", "alt", 1).map((s) => s.materials[0].name),
      ["Rathalos Scale"],
    );
    assert.deepEqual(decorationSteps(jewel, "", "create", 0), []);
  });

  test("jewels in the box count towards the wanted number", () => {
    assert.deepEqual(decorationNeed(3, null), { toMake: 3, owned: false });
    assert.deepEqual(decorationNeed(3, 0), { toMake: 3, owned: false });
    assert.deepEqual(decorationNeed(3, 2), { toMake: 1, owned: false });
    assert.deepEqual(decorationNeed(3, 3), { toMake: 0, owned: true });
    assert.deepEqual(decorationNeed(3, 87), { toMake: 0, owned: true });
    assert.deepEqual(decorationNeed(2, Infinity), { toMake: 0, owned: true });
  });
});

describe("adding a set", () => {
  const piece = (slot: "helmet" | "plate" | "waist", slug: string) =>
    ({ slot, rank: "g-rank", slug }) as const;
  const jewel = (slug: string) => ({ deco: { slug } });
  const set = {
    pieces: [piece("waist", "c"), null, piece("helmet", "a"), piece("plate", "b")],
    decorations: [jewel("fierce"), jewel("handy"), jewel("fierce"), jewel("fierce")],
  };

  test("the pieces head to legs, then each jewel with how many", () => {
    assert.deepEqual(setWants(set), [
      { kind: "armor", slot: "helmet", rank: "g-rank", slug: "a" },
      { kind: "armor", slot: "plate", rank: "g-rank", slug: "b" },
      { kind: "armor", slot: "waist", rank: "g-rank", slug: "c" },
      { kind: "decoration", slug: "fierce", count: 3 },
      { kind: "decoration", slug: "handy", count: 1 },
    ]);
    assert.deepEqual(setWants({ pieces: [null], decorations: [] }), []);
  });

  test("adds what's missing first, in order, and raises jewels to the count", () => {
    const old: WishlistEntry[] = [
      { kind: "weapon", type: "bow", slug: "x", addedAt: 1 },
      { kind: "armor", slot: "plate", rank: "g-rank", slug: "b", addedAt: 1, recipe: "alt" },
      { kind: "decoration", slug: "fierce", addedAt: 1 },
      { kind: "decoration", slug: "handy", count: 5, addedAt: 1 },
    ];
    const wants = setWants(set);
    assert.equal(hasAll(old, wants), false);
    const [next, changed] = addEntries(old, wants, 2);
    assert.equal(changed, 3);
    assert.deepEqual(
      next.map((e) => [entryKey(e), entryCount(e), e.addedAt]),
      [
        ["armor/helmet/g-rank/a", 1, 2],
        ["armor/waist/g-rank/c", 1, 2],
        ["weapon/bow/x", 1, 1],
        ["armor/plate/g-rank/b", 1, 1],
        ["decoration/fierce", 3, 1],
        // Never lowered.
        ["decoration/handy", 5, 1],
      ],
    );
    // The listed piece keeps its recipe.
    assert.equal(next[3].recipe, "alt");
    assert.equal(hasAll(next, wants), true);
    // Adding it again changes nothing.
    const [again, none] = addEntries(next, wants, 3);
    assert.equal(none, 0);
    assert.deepEqual(again, next);
  });

  test("gear wanted twice takes the largest count, never lowering a listed jewel", () => {
    const old: WishlistEntry[] = [{ kind: "decoration", slug: "fierce", addedAt: 1 }];
    const [next, changed] = addEntries(old, [
      { kind: "decoration", slug: "fierce", count: 5 },
      { kind: "decoration", slug: "fierce", count: 3 },
      { kind: "decoration", slug: "handy", count: 2 },
      { kind: "decoration", slug: "handy", count: 4 },
    ]);
    assert.equal(changed, 2);
    assert.deepEqual(
      next.map((e) => [entryKey(e), entryCount(e)]),
      [
        ["decoration/handy", 4],
        ["decoration/fierce", 5],
      ],
    );
  });

  test("a want over the most counts as met at the most", () => {
    const wants = [{ kind: "decoration", slug: "a", count: 500 }] as const;
    const [next] = addEntries([], wants);
    assert.equal(hasAll(next, wants), true);
  });

  test("a jewel count is kept to 1…99, and one is left unset", () => {
    const [next] = addEntries(
      [],
      [
        { kind: "decoration", slug: "a", count: 500 },
        { kind: "decoration", slug: "b", count: 1 },
      ],
    );
    assert.deepEqual(
      next.map((e) => e.kind === "decoration" && e.count),
      [99, undefined],
    );
    assert.deepEqual(parseWishlist(JSON.stringify(next)), next);
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
    farm: [],
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
        farm: [],
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
        farm: [],
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

  test("Pokke Farm is one way, its best point", () => {
    const ways = itemWays(
      undefined,
      {
        gathering: [],
        farm: [
          { point: "Mining Point", spot: "mining", chance: 7, gathers: 3, mostGathers: 4 },
          { point: "Mining Point +2", spot: "mining", chance: 23, gathers: 3, mostGathers: 4 },
        ],
        shops: [],
      },
      undefined,
      null,
    );
    assert.deepEqual(
      ways.map((w) => [w.kind, w.name, w.detail, w.chance]),
      [["farm", "Pokke Farm", "Mining Point +2 · Mining · 3-4 per quest", 23]],
    );
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
        farm: [],
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
    const trees = WEAPON_TYPES.map((type) => buildWeaponTree(type));
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

  test("every decoration has a recipe to make it by", () => {
    const { decorations } = readData(DATA_DIR, "decorations.json") as {
      decorations: Decoration[];
    };
    assert.ok(decorations.length > 100);
    for (const d of decorations) {
      const recipe = defaultRecipe(d);
      assert.ok(recipe, d.name);
      assert.ok(decorationSteps(d, "", recipe, 1)[0].materials.length > 0, d.name);
    }
  });
});
