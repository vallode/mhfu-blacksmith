/** The quests bundle (scripts/lib/quest-bundle.ts) round-tripped through its decoder (lib/quests.ts). */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  encodeQuestBundle,
  monsterSizeRanges,
  type QuestRecord,
} from "../scripts/lib/quest-bundle";
import {
  bestCrownQuests,
  decodeQuests,
  questHp,
  questHref,
  questHubSlug,
  questsOnHub,
  questStarLevel,
  questStarLevels,
  questsWithMonster,
  smallMonsterStages,
  questType,
  questTypeLabel,
  questTypesIn,
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
    baseHp: (name) => (name === "Giadrome" ? 1200 : undefined),
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

describe("monsterSizeRanges", () => {
  const giadrome = (size: QuestRecord["monster_size"]) =>
    quest({
      large_monsters: [
        { monster: "Giadrome", crown_chances: { mini: 0, silver: 0, gold: 0 } },
        // No crowns: always 100, so no range.
        { monster: "Kirin" },
      ],
      monster_size: size,
    });

  test("spans every quest a crowned monster rolls in", () => {
    const ranges = monsterSizeRanges([
      giadrome({ modifier: 100, min: 85, max: 125 }),
      giadrome({ modifier: 130, min: 130, max: 149 }),
      giadrome(null),
    ]);
    assert.deepEqual([...ranges], [["Giadrome", { min: 85, max: 149 }]]);
  });

  test("counts 100 for a quest that holds its monsters there until a flag", () => {
    // Rolls above 100 once the flag is set: 100 is the smallest.
    assert.deepEqual(
      monsterSizeRanges([giadrome({ modifier: 130, min: 130, max: 130, fixed_until_flag: 322 })]),
      new Map([["Giadrome", { min: 100, max: 130 }]]),
    );
    // Rolls below 100 once the flag is set: 100 is the largest.
    assert.deepEqual(
      monsterSizeRanges([giadrome({ modifier: 80, min: 76, max: 92, fixed_until_flag: 322 })]),
      new Map([["Giadrome", { min: 76, max: 100 }]]),
    );
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

  test("gives each distinct large monster spawn its HP and multipliers", () => {
    const row = { hp: 0.6, attack: 1.15, defense: 1, status: 1 };
    const { bundle } = encode([
      quest({
        large_monsters: [
          { monster: "Giadrome", multipliers: row },
          // The same row again (another quantity on the disc): shown once.
          { monster: "Giadrome", multipliers: row },
          { monster: "Rathian", multipliers: { hp: 1.75, attack: 3.5, defense: 0.7, status: 2.3 } },
          { monster: "Kirin" },
        ],
      }),
      quest({ id: 2 }),
    ]);
    const [a, b] = decodeQuests(bundle);
    assert.deepEqual(
      a!.monsterStats.map((s) => [s.monster.name, s.hp, s.attack, s.defense, s.stagger]),
      [
        ["Giadrome", 720, 1.15, 1, 1],
        // No base HP: no HP, but the multipliers still show.
        ["Rathian", null, 3.5, 0.7, 2.3],
      ],
    );
    assert.deepEqual(b!.monsterStats, []);
  });

  test("keeps the monster size range and each crowned monster's crown chances", () => {
    const { bundle } = encode([
      quest({
        large_monsters: [
          { monster: "Giadrome", crown_chances: { mini: 84 / 1024, silver: 31 / 1024, gold: 0 } },
          { monster: "Giadrome", crown_chances: { mini: 84 / 1024, silver: 31 / 1024, gold: 0 } },
          // No crowns: always 100.
          { monster: "Kirin" },
        ],
        monster_size: { modifier: 100, min: 85, max: 125 },
      }),
      quest({
        id: 2,
        large_monsters: [{ monster: "Giadrome", crown_chances: { mini: 0, silver: 0, gold: 1 } }],
        monster_size: { modifier: 130, min: 130, max: 130, fixed_until_flag: 322 },
      }),
      quest({ id: 3, large_monsters: [], monster_size: null }),
    ]);
    const [a, b, c] = decodeQuests(bundle);
    assert.deepEqual(
      {
        ...a!.monsterSize,
        crowns: a!.monsterSize!.crowns.map((x) => ({ ...x, monster: x.monster.name })),
      },
      {
        modifier: 100,
        min: 85,
        max: 125,
        fixedFirst: false,
        crowns: [{ monster: "Giadrome", mini: 84 / 1024, silver: 31 / 1024, gold: 0 }],
      },
    );
    assert.equal(b!.monsterSize!.fixedFirst, true);
    assert.equal(c!.monsterSize, null);
    // Quest 2 is the only one with gold, quest 1 the best for silver and
    // mini; a copy of quest 1 ties it, and is marked too.
    const tie = { ...a!, id: 4 };
    assert.deepEqual(
      [...bestCrownQuests([a!, b!, tie], "Giadrome")],
      [
        [2, [{ crown: "gold", chance: 1 }]],
        [
          1,
          [
            { crown: "silver", chance: 31 / 1024 },
            { crown: "mini", chance: 84 / 1024 },
          ],
        ],
        [
          4,
          [
            { crown: "silver", chance: 31 / 1024 },
            { crown: "mini", chance: 84 / 1024 },
          ],
        ],
      ],
    );
    assert.equal(bestCrownQuests([a!, b!], "Kirin").size, 0);
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

  test("questStarLevel shows G Rank's ★9-★11 as G★1-G★3", () => {
    assert.deepEqual(questStarLevel("g-rank", 9), { g: true, stars: 1 });
    assert.deepEqual(questStarLevel("g-rank", 11), { g: true, stars: 3 });
    assert.deepEqual(questStarLevel("village", 9), { g: false, stars: 9 });
    assert.deepEqual(questStarLevel("high-rank", 6), { g: false, stars: 6 });
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

describe("questType", () => {
  test("reads the type from the goal", () => {
    assert.equal(questType("village", "Hunt the Giadrome"), "hunting");
    assert.equal(questType("guild", "Defend the Fortress from\nLao-Shan Lung"), "hunting");
    assert.equal(questType("village", "Slay 5 Giaprey"), "slaying");
    assert.equal(questType("village", "Deliver 5 Mountain Herbs"), "gathering");
    assert.equal(
      questType("guild", "Survive until Time Over or\nDeliver the Paw Pass Ticket"),
      "gathering",
    );
    assert.equal(questType("treasure-hunting", "2000 Pts Before Time Over or"), "treasure");
    assert.equal(questType("village", null), "hunting");
  });

  test("decodeQuests gives each quest its type", () => {
    const { bundle } = encode([quest({ id: 1 }), quest({ id: 2, goal: "Slay 5 Giaprey" })]);
    assert.deepEqual(
      decodeQuests(bundle).map((q) => q.type),
      ["hunting", "slaying"],
    );
  });

  test("questTypesIn lists the types present, in filter order", () => {
    assert.deepEqual(questTypesIn([{ type: "gathering" }, { type: "hunting" }]), [
      "hunting",
      "gathering",
    ]);
  });

  test("questTypeLabel heads the card like the game", () => {
    assert.equal(questTypeLabel("hunting"), "Hunting Quest");
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

describe("questHp", () => {
  test("multiplies in single precision and truncates, as the game does", () => {
    assert.equal(questHp(1200, 0.6), 720);
    // Single precision lands either side of doubles (840, 919.999...).
    assert.equal(questHp(800, 1.05), 839);
    assert.equal(questHp(800, 1.15), 920);
  });
});

test("encodeQuestBundle marks the quests area-maps.json has", () => {
  const { bundle } = encodeQuestBundle({
    quests: [quest({ id: 1 }), quest({ id: 2 })],
    itemId: () => undefined,
    monsterPage: () => undefined,
    hasAreaMap: (id) => id === 2,
  });
  assert.deepEqual(
    decodeQuests(bundle).map((q) => q.hasAreaMap),
    [false, true],
  );
});

describe("small monster totals", () => {
  const spawn = (monster: string, total_quantity: number, endless?: boolean) => ({
    monster,
    max_quantity: total_quantity,
    total_quantity,
    ...(endless ? { endless } : {}),
  });

  test("round-trips each small monster's total and endless flag", () => {
    const { bundle } = encode([
      quest({
        small_monsters: [spawn("Giaprey", 8), spawn("Vespoid", 0, true), spawn("Rocks", 5)],
      }),
    ]);
    const q = decodeQuests(bundle)[0]!;
    assert.deepEqual(
      q.smallMonsters.map((m) => m.name),
      ["Giaprey", "Vespoid"],
    );
    assert.deepEqual(q.smallSpawns, [
      { total: 8, endless: false },
      { total: 0, endless: true },
    ]);
  });

  test("smallMonsterStages picks the biggest total per star level, keeping ties and endless quests", () => {
    const { bundle } = encode([
      quest({ id: 1, stars: 1, small_monsters: [spawn("Vespoid", 6)] }),
      quest({ id: 2, stars: 1, small_monsters: [spawn("Vespoid", 9)] }),
      quest({ id: 3, stars: 1, small_monsters: [spawn("Vespoid", 9)] }),
      quest({ id: 4, stars: 1, small_monsters: [spawn("Vespoid", 0, true)] }),
      quest({ id: 5, stars: 2, small_monsters: [spawn("Giaprey", 4)] }),
      quest({ id: 6, stars: 3, small_monsters: [spawn("Vespoid", 2)] }),
      quest({
        id: 7,
        hub: "training-school",
        stars: 1,
        small_monsters: [spawn("Vespoid", 50)],
      }),
    ]);
    const stages = smallMonsterStages(decodeQuests(bundle), "Vespoid");
    assert.deepEqual(
      stages.map((s) => ({
        hub: s.hub,
        stars: s.stars,
        best: s.best.map((b) => [b.quest.id, b.total]),
        endless: s.endless.map((e) => e.id),
      })),
      [
        {
          hub: "village",
          stars: 1,
          best: [
            [2, 9],
            [3, 9],
          ],
          endless: [4],
        },
        { hub: "village", stars: 3, best: [[6, 2]], endless: [] },
      ],
    );
  });
});
