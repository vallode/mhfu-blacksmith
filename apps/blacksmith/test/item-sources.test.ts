/** Item sources (lib/item-sources.ts): monster drops and quest rewards indexed by item. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { encodeQuestBundle, type QuestRecord } from "../scripts/lib/quest-bundle";
import { ITEM_CATEGORIES, itemCategory } from "../src/lib/item-categories";
import { buildItemSources, groupBy, itemHref, type SourceMonster } from "../src/lib/item-sources";
import { buildItemNameIndex, normalizeItemName, type ItemRecord } from "../src/lib/items";
import { DATA_DIR } from "../src/lib/paths";
import { decodeQuests } from "../src/lib/quests";
import { slugify } from "../src/lib/slug";
import type { Monster } from "../src/lib/types";

const ITEM_IDS: Record<string, number> = { "Rathalos Scale": 1, "Rathalos Ruby": 2, Map: 3 };
const itemId = (name: string) => ITEM_IDS[name];

const rathalos: SourceMonster = {
  name: "Rathalos",
  href: "/monsters/flying-wyvern/rathalos/",
  drops: {
    "high-rank": {
      "body carves (x3)": [
        { name: "Rathalos Scale", chance: "30%" },
        { name: "Rathalos Ruby", chance: "2%" },
      ],
      "break head": [{ name: "Rathalos Scale", chance: "45%", quantity: 2 }],
    },
    "low rank": {
      "shiny drop : stagger in flight": [{ name: "Rathalos Scale", chance: "60%" }],
    },
  },
};

function quest(overrides: Partial<QuestRecord>): QuestRecord {
  return {
    id: 1,
    hub: "village",
    rank: null,
    stars: 1,
    map: "Forest and Hills (Day)",
    fee: 100,
    reward: 1200,
    time_limit_minutes: 50,
    target: null,
    supplies: [{ item: "Map", amount: 1 }],
    reward_tables: [],
    large_monsters: [],
    small_monsters: [],
    title: "A quest",
    goal: null,
    details: null,
    fail: null,
    client: null,
    ...overrides,
  };
}

const quests = decodeQuests(
  encodeQuestBundle({
    quests: [
      quest({
        id: 10,
        stars: 4,
        title: "Village Rathalos",
        reward_tables: [
          {
            kind: "main",
            draws: 5,
            condition: null,
            items: [
              { chance: 20, item: "Rathalos Scale", amount: 1 },
              { chance: 5, item: "Rathalos Ruby", amount: 1 },
            ],
          },
        ],
      }),
      quest({
        id: 20,
        hub: "guild",
        rank: "high-rank",
        stars: 6,
        title: "Guild Rathalos",
        reward_tables: [
          {
            kind: "extra",
            draws: 1,
            condition: null,
            items: [{ chance: 50, item: "Rathalos Scale", amount: 2 }],
          },
        ],
      }),
      // A hidden copy (lib/quests.ts isHiddenQuest): no page, so not a source.
      quest({
        id: 30001,
        hub: "guild",
        rank: "low-rank",
        reward_tables: [
          {
            kind: "main",
            draws: 1,
            condition: null,
            items: [{ chance: 100, item: "Rathalos Scale", amount: 1 }],
          },
        ],
      }),
    ],
    itemId: (name) => ITEM_IDS[name],
    monsterPage: () => undefined,
  }).bundle,
);

describe("buildItemSources", () => {
  const sources = buildItemSources([rathalos], quests, itemId);

  test("indexes monster drops by item, ranks in game order, best chance first", () => {
    const scale = sources.get(1)!.monsters;
    assert.deepEqual(
      scale.map((s) => [s.rank, s.source.title, s.source.count, s.chance, s.quantity]),
      [
        ["Low Rank", "Shiny drop", undefined, 60, 1],
        ["High Rank", "Break head", undefined, 45, 2],
        ["High Rank", "Body carves", 3, 30, 1],
      ],
    );
    assert.equal(scale[0]!.source.note, "stagger in flight");
    assert.deepEqual(scale[0]!.monster, { name: "Rathalos", href: rathalos.href });
  });

  test("indexes quest rewards by board, best chance first, skipping hidden quests", () => {
    const scale = sources.get(1)!.quests;
    assert.deepEqual(
      scale.map((s) => [s.quest.id, s.table.kind, s.chance, s.amount]),
      [
        [10, "main", 20, 1],
        [20, "extra", 50, 2],
      ],
    );
  });

  test("leaves out items nothing gives", () => {
    assert.equal(sources.get(3), undefined); // Map: only in supplies
    assert.equal(sources.get(2)!.monsters.length, 1);
    assert.equal(sources.get(2)!.quests.length, 1);
  });
});

describe("item pages", () => {
  test("itemHref slugs the name", () => {
    assert.equal(itemHref("Rathalos Scale+"), "/items/rathalos-scale-plus/");
  });

  test("groupBy keeps first-seen order", () => {
    assert.deepEqual(
      groupBy(["b1", "a1", "b2"], (s) => s[0]!),
      [
        ["b", ["b1", "b2"]],
        ["a", ["a1"]],
      ],
    );
  });

  test("every item has its own page slug, and every monster drop resolves to an item", () => {
    const { items } = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "items.json"), "utf-8")) as {
      items: ItemRecord[];
    };
    const slugs = items.filter((i) => !i.placeholder).map((i) => slugify(i.name));
    assert.equal(new Set(slugs).size, slugs.length);

    const { index } = buildItemNameIndex(items);
    const unresolved: string[] = [];
    for (const file of fs.readdirSync(path.join(DATA_DIR, "monsters"))) {
      const { monsters } = JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, "monsters", file), "utf-8"),
      ) as { monsters: Monster[] };
      for (const m of monsters)
        for (const sources of Object.values(m.drops ?? {}))
          for (const drops of Object.values(sources))
            for (const d of drops)
              if (!index.has(normalizeItemName(d.name))) unresolved.push(`${m.name}: ${d.name}`);
    }
    assert.deepEqual(unresolved, []);
  });
});

describe("item categories", () => {
  test("every real item is in exactly one category", () => {
    const { items } = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "items.json"), "utf-8")) as {
      items: ItemRecord[];
    };
    for (const item of items) {
      if (item.placeholder) continue;
      const owners = ITEM_CATEGORIES.filter((c) =>
        c.ranges.some(([from, to]) => item.id >= from && item.id <= to),
      );
      assert.equal(owners.length, 1, `${item.id} ${item.name}: ${owners.map((c) => c.slug)}`);
    }
  });

  test("ranges follow the game's item groups", () => {
    assert.equal(itemCategory(7), "consumables"); // Potion
    assert.equal(itemCategory(97), "ammo"); // Normal S Lv2
    assert.equal(itemCategory(548), "monster-materials"); // Rathalos Scale
    assert.equal(itemCategory(989), "jewels"); // Attack Jewel
    assert.equal(itemCategory(1124), "treasures"); // Lao-Shan Melon
    assert.equal(itemCategory(70000), "other");
  });
});
