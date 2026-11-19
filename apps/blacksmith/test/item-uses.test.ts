/** Item uses (lib/item-uses.ts): the gear whose recipes take each item. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { itemUsesFromData } from "../scripts/lib/item-uses-data";
import {
  buildItemUses,
  decodeItemUses,
  encodeItemUses,
  groupOfUse,
  type UseGear,
} from "../src/lib/item-uses";
import { DATA_DIR } from "../src/lib/paths";
import { slugify } from "../src/lib/slug";

const ITEM_IDS: Record<string, number> = { "Iron Ore": 1, Machalite: 2, "Rath Scale": 3 };
const itemId = (name: string) => ITEM_IDS[name];
const mat = (name: string, amount: number | string) => ({ name, amount, type: "", color: "" });

const gear: UseGear = {
  weapons: [
    {
      type: "great-sword",
      items: [
        { name: "Iron Sword", slug: "iron-sword", rarity: 1, create_mats: [mat("Iron Ore", 2)] },
        {
          name: "Iron Sword+",
          slug: "iron-sword-plus",
          rarity: "2",
          improve_mats: [mat("Iron Ore", 3), mat("Machalite", 1)],
        },
        // No tree parent: its upgrade recipe is left out.
        { name: "Orphan", slug: "orphan", rarity: 3, improve_mats: [mat("Iron Ore", 9)] },
      ],
    },
    {
      type: "lance",
      items: [
        {
          name: "Rath Lance",
          slug: "rath-lance",
          rarity: 5,
          create_mats: [mat("Rath Scale", 4), mat("Unknown Thing", 1)],
          alternative_create_mats: [mat("Iron Ore", 5)],
        },
      ],
    },
  ],
  armor: [
    {
      slot: "helmet",
      rank: "high-rank",
      items: [
        {
          name: "Rath Helm",
          slug: "rath-helm-male",
          rarity: 5,
          create_mats: [mat("Rath Scale", 2)],
        },
      ],
    },
  ],
  decorations: [
    {
      name: "Iron Jewel",
      slug: "iron-jewel",
      color: "gem-blue",
      create_mats: [mat("Iron Ore", 1)],
    },
  ],
  parents: new Map([["Iron Sword+", "Iron Sword"]]),
};

describe("buildItemUses", () => {
  const uses = buildItemUses(gear, itemId);

  test("lists every recipe that takes the item, in group then rarity order", () => {
    assert.deepEqual(
      uses.get(1)!.map((u) => [u.name, u.recipe, u.amount]),
      [
        ["Iron Sword", "create", 2],
        ["Iron Sword+", "improve", 3],
        ["Rath Lance", "alt", 5],
        ["Iron Jewel", "create", 1],
      ],
    );
  });

  test("names an upgrade's parent and links each piece of gear", () => {
    const [plus] = uses.get(2)!;
    assert.equal(plus!.kind === "weapon" && plus.from, "Iron Sword");
    assert.equal(plus!.href, "/blacksmith/great-sword/iron-sword-plus/");
    const helm = uses.get(3)!.find((u) => u.kind === "armor")!;
    assert.equal(helm.href, "/armorsmith/helmet/high-rank/rath-helm-male/");
    assert.equal(groupOfUse(helm), "high-rank");
  });

  test("leaves out names with no item and upgrades with no parent", () => {
    assert.equal([...uses.values()].flat().filter((u) => u.name === "Orphan").length, 0);
    assert.deepEqual([...uses.keys()].sort(), [1, 2, 3]);
  });

  test("survives item-uses.json", () => {
    assert.deepEqual(decodeItemUses(encodeItemUses(uses, slugify), slugify), uses);
  });
});

describe("item uses from data/mhfu/", () => {
  const uses = itemUsesFromData(DATA_DIR);

  test("survive item-uses.json", () => {
    const bundle = JSON.parse(JSON.stringify(encodeItemUses(uses, slugify)));
    assert.deepEqual(decodeItemUses(bundle, slugify), uses);
  });

  test("every upgrade names the weapon it starts from", () => {
    const upgrades = [...uses.values()].flat().filter((u) => u.recipe === "improve");
    assert.ok(upgrades.length > 1000);
    assert.deepEqual(
      upgrades.filter((u) => u.kind !== "weapon" || !u.from),
      [],
    );
  });
});
