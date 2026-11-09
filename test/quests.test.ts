/** The quests bundle (scripts/lib/quest-bundle.ts) round-tripped through its decoder (lib/quests.ts). */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { encodeQuestBundle, type QuestRecord } from "../scripts/lib/quest-bundle";
import {
  decodeQuests,
  questHref,
  questHubSlug,
  questsOnHub,
  questStarLevels,
  starMarks,
  questsWithMonster,
  rewardTableHeading,
} from "../src/lib/quests";

const ITEM_IDS: Record<string, number> = { Map: 863, "Giaprey Hide": 342, "Rathian Scale+": 501 };

function quest(overrides: Partial<QuestRecord>): QuestRecord {
  return {
    id: 1,
    hub: "village",
    rank: null,
    stars: 1,
    map: "Snowy Mountains (Day)",
    fee: 100,
    reward: 1200,
    time_limit_minutes: 50,
    target: { monster: "Giadrome", amount: 1 },
    supplies: [],
    reward_tables: [],
    large_monsters: [{ monster: "Giadrome" }],
    small_monsters: [{ monster: "Giaprey" }],
    title: "Hunt the Giadrome",
    goal: "Hunt 1 Giadrome",
    details: null,
    fail: "Reward Zero\nTime Over",
    client: null,
    ...overrides,
  };
}

function encode(quests: QuestRecord[]) {
  return encodeQuestBundle({
    quests,
    itemId: (name) => ITEM_IDS[name],
    monsterPage: (name) =>
      name === "Giadrome" || name === "Scarred Yian Garuga"
        ? { category: "bird-wyvern", slug: name.toLowerCase().replace(/ /g, "-") }
        : undefined,
  });
}

describe("questHubSlug", () => {
  test("splits the guild by rank and keeps the other hubs whole", () => {
    assert.equal(questHubSlug("village", null), "village");
    assert.equal(questHubSlug("guild", "low-rank"), "low-rank");
    assert.equal(questHubSlug("guild", "g-rank"), "g-rank");
    assert.equal(questHubSlug("training-school", null), "training-school");
    assert.equal(questHubSlug("guild", null), null);
  });
});

describe("encodeQuestBundle / decodeQuests", () => {
  test("round-trips a quest's fields, item IDs and labelled reward tables", () => {
    const { bundle, unresolvedItems } = encode([
      quest({
        reward_tables: [
          {
            kind: "main",
            draws: 5,
            condition: null,
            items: [
              { chance: 75, item: "Giaprey Hide", amount: 1 },
              { chance: 25, item: "Giaprey Hide", amount: 2 },
            ],
          },
          {
            kind: "extra",
            draws: 1,
            condition: null,
            items: [{ chance: 100, item: "Map", amount: 1 }],
          },
          {
            kind: "conditional",
            draws: null,
            condition: 281,
            items: [{ chance: 100, item: "Unknown Thing", amount: 1 }],
          },
        ],
      }),
    ]);
    assert.deepEqual(unresolvedItems, ["Unknown Thing"]);

    const [q] = decodeQuests(bundle);
    assert.ok(q);
    assert.equal(q.hub, "village");
    assert.equal(q.title, "Hunt the Giadrome");
    assert.equal(q.fail, "Reward Zero\nTime Over");
    assert.equal(q.details, null);
    assert.equal(q.map, "Snowy Mountains (Day)");
    assert.deepEqual(q.target, {
      monster: { name: "Giadrome", href: "/monsters/bird-wyvern/giadrome/" },
      amount: 1,
    });
    assert.deepEqual(q.smallMonsters, [{ name: "Giaprey", href: null }]);
    assert.deepEqual(q.rewardTables, [
      {
        kind: "main",
        draws: 5,
        condition: null,
        items: [
          { chance: 75, itemId: 342, amount: 1 },
          { chance: 25, itemId: 342, amount: 2 },
        ],
      },
      {
        kind: "extra",
        draws: 1,
        condition: null,
        items: [{ chance: 100, itemId: 863, amount: 1 }],
      },
      // The unresolved item is left out rather than shown wrong.
      { kind: "conditional", draws: null, condition: 281, items: [] },
    ]);
  });

  test("keeps each distinct supply row once, with how many times it repeats", () => {
    const map = { item: "Map", amount: 1 };
    const { bundle } = encode([
      quest({ supplies: [map, map, map, { item: "Giaprey Hide", amount: 2 }, map] }),
    ]);
    assert.deepEqual(decodeQuests(bundle)[0]!.supplies, [
      { itemId: 863, amount: 1, stacks: 4 },
      { itemId: 342, amount: 2, stacks: 1 },
    ]);
  });

  test("stores identical reward tables and supply lists once", () => {
    const table = {
      kind: "main",
      draws: 4,
      condition: null,
      items: [{ chance: 100, item: "Map", amount: 1 }],
    };
    const supplies = [{ item: "Map", amount: 1 }];
    const { bundle } = encode([
      quest({ id: 1, reward_tables: [table], supplies }),
      quest({ id: 2, reward_tables: [table], supplies }),
    ]);
    assert.equal(bundle.tables.length, 1);
    assert.equal(bundle.supplies.length, 1);
    const [a, b] = decodeQuests(bundle);
    assert.deepEqual(a!.rewardTables, b!.rewardTables);
  });

  test("leaves Treasure Hunting's rocks out of the small monsters", () => {
    const { bundle } = encode([
      quest({ small_monsters: [{ monster: "Rocks" }, { monster: "Giaprey" }] }),
    ]);
    assert.deepEqual(
      decodeQuests(bundle)[0]!.smallMonsters.map((m) => m.name),
      ["Giaprey"],
    );
  });

  test("links disc monster names the site spells differently", () => {
    const { bundle } = encode([
      quest({ target: null, large_monsters: [{ monster: "One-Ear Yian Garuga" }] }),
    ]);
    assert.deepEqual(decodeQuests(bundle)[0]!.largeMonsters, [
      { name: "Scarred Yian Garuga", href: "/monsters/bird-wyvern/scarred-yian-garuga/" },
    ]);
  });

  test("keeps the urgent flag", () => {
    const { bundle } = encode([quest({ id: 10203, urgent: true }), quest({ id: 109 })]);
    assert.deepEqual(
      decodeQuests(bundle).map((q) => q.urgent),
      [true, false],
    );
  });

  test("keeps the quest a quest requires, and null when there is none", () => {
    const { bundle } = encode([quest({ id: 109, requires: 10203 }), quest({ id: 10203 })]);
    assert.deepEqual(
      decodeQuests(bundle).map((q) => q.requires),
      [10203, null],
    );
  });
});

describe("quest lookups", () => {
  const { bundle } = encode([
    quest({ id: 3, stars: 2 }),
    quest({ id: 1, stars: 2 }),
    quest({ id: 2, stars: 1 }),
    quest({ id: 1101, hub: "guild", rank: "low-rank", stars: 1 }),
    quest({ id: 4, target: null, large_monsters: [{ monster: "Rathian" }] }),
  ]);
  const quests = decodeQuests(bundle);

  test("questsOnHub sorts by stars, then ID", () => {
    assert.deepEqual(
      questsOnHub(quests, "village").map((q) => q.id),
      [2, 4, 1, 3],
    );
  });

  test("starMarks writes one star per level", () => {
    assert.equal(starMarks(1), "★");
    assert.equal(starMarks(5), "★★★★★");
    assert.equal(starMarks(0), "");
  });

  test("questStarLevels lists each star level once, lowest first", () => {
    assert.deepEqual(
      questStarLevels([{ stars: 3 }, { stars: 1 }, { stars: 3 }, { stars: 8 }]),
      [1, 3, 8],
    );
    assert.deepEqual(questStarLevels([]), []);
  });

  test("questsWithMonster finds targets and large monsters, village before guild", () => {
    assert.deepEqual(
      questsWithMonster(quests, "Giadrome").map((q) => q.id),
      [2, 1, 3, 1101],
    );
    assert.deepEqual(
      questsWithMonster(quests, "Rathian").map((q) => q.id),
      [4],
    );
  });

  test("questHref uses the hub and quest ID", () => {
    assert.equal(questHref({ hub: "low-rank", id: 1101 }), "/quests/low-rank/1101/");
  });
});

describe("rewardTableHeading", () => {
  test("names main and extra tables with their draws, and keeps conditions raw", () => {
    assert.deepEqual(rewardTableHeading({ kind: "main", draws: 5, condition: null, items: [] }), {
      title: "Main reward",
      count: 5,
    });
    assert.deepEqual(rewardTableHeading({ kind: "main", draws: 0, condition: null, items: [] }), {
      title: "Main reward",
      count: undefined,
    });
    assert.deepEqual(rewardTableHeading({ kind: "extra", draws: 1, condition: null, items: [] }), {
      title: "Extra reward",
      count: 1,
    });
    assert.deepEqual(
      rewardTableHeading({ kind: "conditional", draws: null, condition: 281, items: [] }),
      { title: "Conditional reward", note: "condition 281" },
    );
  });
});
