import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyRewardTable,
  emitQuest,
  emitQuestsFile,
  QUEST_HUB_TO_FILE,
  questHub,
} from "../src/emit/quests.js";
import type { SizeTables } from "../src/monsters/sizes.js";
import type { ParsedQuest } from "../src/quests/parser.js";

/** Real quest ID 1 ("Hunt 1 Giadrome", the game's very first quest) — every field below is a real decrypted/parsed value from the JP disc. */
const GIADROME_HUNT: ParsedQuest = {
  header: {
    suppliesPtr: 676,
    rewardsPtr: 2560,
    questScriptPtr: 564,
    largeMonPtr: 4808,
    smallMonPtr: 4656,
    gatheringLocTblPtr: 2476,
    gatheringItemsPtr: 1388,
    monSizeModifier: 0,
    rank: 0,
    spawn: 0,
    unknownFlags: [0, 0],
    sizeVariation: 0,
    statTable: 0,
    supplyCond: 0,
    attackRoll: 4,
    questType: 4,
    fee: 100,
    reward: 1200,
    penalty: 400,
    timeLimit: 90000,
    stringPtrTbl: 536,
    questId: 1,
    questStars: 1,
    map: 11,
    specialCond: 0,
    targetId: 77, // Giadrome
    targetNum: 1,
    arenaPtr: 0,
  },
  supplies: [
    { itemId: 863, amount: 1 }, // Map
    { itemId: 867, amount: 2 }, // Mini Whetstone
    { itemId: 864, amount: 3 }, // First-Aid Med
  ],
  rewards: [
    {
      // Unkn1/Unkn2 as on the EU disc's quest 1; itemsPtr is illustrative.
      unkn1: 0x8000,
      unkn2: 0x0500,
      itemsPtr: 2568,
      items: [
        { chance: 1, itemId: 345, amount: 1 },
        { chance: 25, itemId: 342, amount: 1 }, // Giaprey Hide
        { chance: 10, itemId: 344, amount: 1 },
        { chance: 25, itemId: 281, amount: 1 }, // Sm Monster Bone
        { chance: 4, itemId: 223, amount: 1 },
      ],
    },
  ],
  largeMonsters: [{ monsterId: 77, quantity: 1, power: 4, stage: 97 }], // Giadrome
  smallMonsters: [
    { stageId: 92, dataPtr: 90, monsters: [] },
    {
      stageId: 93,
      dataPtr: 100,
      monsters: [
        { monsterId: 35, quantity: 2, power: 0 }, // Giaprey
        { monsterId: 35, quantity: 1, power: 0 },
        { monsterId: 19, quantity: 3, power: 0 }, // Vespoid
      ],
    },
    // The whole zone list repeats verbatim a second time — real on-disc
    // behavior (see readSmallMonsters' docs), with a higher Giaprey count
    // this time, to prove dedup keeps the *max* quantity seen anywhere.
    {
      stageId: 93,
      dataPtr: 200,
      monsters: [
        { monsterId: 35, quantity: 5, power: 0 },
        { monsterId: 19, quantity: 3, power: 0 },
      ],
    },
    // The same records again (same address): counted once.
    { stageId: 93, dataPtr: 100, monsters: [{ monsterId: 35, quantity: 2, power: 0 }] },
    // 99 marks a species that keeps spawning: flagged, not counted.
    { stageId: 94, dataPtr: 300, monsters: [{ monsterId: 19, quantity: 99, power: 0 }] },
  ],
  strings: {
    title: "強敵、ドスギアノス現る！",
    goal: "ドスギアノス１頭の狩猟",
    fail: "報酬金ゼロ\nタイムアップ",
    details: "ずる賢い肉食竜のギアノス共を束ねる、大型のボスがいる。",
    monsters: "ドスギアノス\nギアノス",
    client: "元気のいい少年",
  },
};

/**
 * Quest 1 is on no board (see questHub), so tests that need an emitted quest
 * renumber it into the Village's ★1 block.
 */
const VILLAGE_GIADROME: ParsedQuest = {
  ...GIADROME_HUNT,
  header: { ...GIADROME_HUNT.header, questId: 10006 },
};

test("emitQuest reproduces the real 'Hunt 1 Giadrome' quest end-to-end", () => {
  const emitted = emitQuest(VILLAGE_GIADROME);
  assert.ok(emitted);
  assert.equal(emitted.id, 10006);
  assert.equal(emitted.hub, "village");
  assert.equal(emitted.rank, "low-rank");
  assert.equal(emitted.stars, 1);
  assert.equal(emitted.map, "Snowy Mountains (Day)");
  assert.equal(emitted.fee, 100);
  assert.equal(emitted.reward, 1200);
  assert.equal(emitted.penalty, 400);
  assert.equal(emitted.time_limit_minutes, 50);
  assert.deepEqual(emitted.target, { monster: "Giadrome", amount: 1 });
  assert.deepEqual(emitted.supplies, [
    { item: "Map", amount: 1 },
    { item: "Mini Whetstone", amount: 2 },
    { item: "First-Aid Med", amount: 3 },
  ]);
  assert.equal(emitted.reward_tables.length, 1);
  assert.equal(emitted.reward_tables[0]!.kind, "main");
  assert.equal(emitted.reward_tables[0]!.draws, 5);
  assert.equal(emitted.reward_tables[0]!.condition, null);
  assert.deepEqual(emitted.reward_tables[0]!.items, [
    { chance: 1, item: "Giadrome Claw", amount: 1 },
    { chance: 25, item: "Giaprey Hide", amount: 1 },
    { chance: 10, item: "Giadrome Hide", amount: 1 },
    { chance: 25, item: "Sm Monster Bone", amount: 1 },
    { chance: 4, item: "Armor Sphere", amount: 1 },
  ]);
  assert.deepEqual(emitted.large_monsters, [{ monster: "Giadrome", quantity: 1, power: 4 }]);
  // The repeat of the first table is dropped; per species: the most in one table, and the sum of the distinct tables.
  assert.deepEqual(emitted.small_monsters, [
    { monster: "Giaprey", max_quantity: 5, total_quantity: 8 },
    { monster: "Vespoid", max_quantity: 3, total_quantity: 6, endless: true },
  ]);
  assert.equal(emitted.title, "強敵、ドスギアノス現る！");
  assert.equal(emitted.client, "元気のいい少年");
});

test("emitQuest maps rank 3 (real Treasure Hunting client 'トレジィ') to the treasure-hunting hub with a null target", () => {
  const treasureHunt: ParsedQuest = {
    ...GIADROME_HUNT,
    header: { ...GIADROME_HUNT.header, rank: 3, questId: 4001, targetId: 928, targetNum: 1 }, // 928 is out of emID's 90-entry range
    strings: { ...GIADROME_HUNT.strings!, client: "トレジィ" },
  };
  const emitted = emitQuest(treasureHunt);
  assert.ok(emitted);
  assert.equal(emitted.hub, "treasure-hunting");
  assert.equal(emitted.rank, null);
  // targetId 928 doesn't resolve to a real monster -> no single target, as expected for Treasure Hunting.
  assert.equal(emitted.target, null);
});

test("emitQuest maps rank 4 (real Training School client '教官') to the training-school hub", () => {
  const training: ParsedQuest = {
    ...GIADROME_HUNT,
    header: { ...GIADROME_HUNT.header, rank: 4, questId: 21001, targetId: 6, fee: 0 },
    strings: { ...GIADROME_HUNT.strings!, title: "イャンクック討伐訓練", client: "教官" },
  };
  const emitted = emitQuest(training);
  assert.ok(emitted);
  assert.equal(emitted.hub, "training-school");
  assert.equal(emitted.rank, null);
  assert.equal(emitted.fee, 0);
  assert.deepEqual(emitted.target, { monster: "Yian Kut-Ku", amount: 1 });
});

const withHeader = (questId: number, rank: number) =>
  emitQuest({ ...GIADROME_HUNT, header: { ...GIADROME_HUNT.header, questId, rank } });

test("emitQuest maps guild ranks 1/2/5 to guild low/high/g-rank tiers", () => {
  const guildLow = withHeader(1001, 1);
  const guildHigh = withHeader(2001, 2);
  const guildG = withHeader(3001, 5);
  assert.deepEqual([guildLow?.hub, guildLow?.rank], ["guild", "low-rank"]);
  assert.deepEqual([guildHigh?.hub, guildHigh?.rank], ["guild", "high-rank"]);
  assert.deepEqual([guildG?.hub, guildG?.rank], ["guild", "g-rank"]);
});

test("emitQuest puts the Village's quests on the Village board, whatever their rank byte", () => {
  // Real headers: 10104 "The Carnivorous Leader" is rank 1 like Guild Low
  // Rank, 11001 rank 2 like Guild High Rank, 10004 "Sinking Feeling" rank 0.
  const elder = withHeader(10104, 1);
  const high = withHeader(11001, 2);
  const tigrex = withHeader(10004, 0);
  assert.deepEqual([elder?.hub, elder?.rank], ["village", "low-rank"]);
  assert.deepEqual([high?.hub, high?.rank], ["village", "high-rank"]);
  assert.deepEqual([tigrex?.hub, tigrex?.rank], ["village", "low-rank"]);
});

test("questHub reads the board from the quest ID block", () => {
  const cases: [number, ReturnType<typeof questHub>][] = [
    [0, null],
    [1, "guild"],
    [10, "guild"],
    [101, "guild"],
    [105, "guild"],
    [109, "guild"],
    [1001, "guild"],
    [2116, "guild"],
    [3233, "guild"],
    [4001, "treasure-hunting"],
    [10001, "village"],
    [11226, "village"],
    [20001, "training-school"],
    [21001, "training-school"],
    [22006, "training-school"],
    [30090, "guild"],
    [40001, null],
    [50001, null],
  ];
  for (const [id, hub] of cases) assert.equal(questHub(id), hub, `quest ${id}`);
});

test("emitQuest puts quests 1-10 and 101-109 on Guild Low Rank (★1 and ★2)", () => {
  // Real headers: 1 "A True Foe - The Giadrome!" (★1), 101 "The Shadow in
  // the Mountains" and 109 "Attack of the Rathian" (★2) are all rank 0.
  const giadrome = emitQuest(GIADROME_HUNT);
  const first = withHeader(101, 0);
  const rathian = withHeader(109, 0);
  assert.deepEqual([giadrome?.hub, giadrome?.rank], ["guild", "low-rank"]);
  assert.deepEqual([first?.hub, first?.rank], ["guild", "low-rank"]);
  assert.deepEqual([rathian?.hub, rathian?.rank], ["guild", "low-rank"]);
});

test("emitQuest flags the Urgent Quests", () => {
  // 10203 "Shadow in the Snow" (Village ★3) and 3233 "Absolute Zero" (G★3) are urgent.
  assert.equal(withHeader(10203, 1)?.urgent, true);
  assert.equal(withHeader(3233, 5)?.urgent, true);
  assert.equal(withHeader(109, 0)?.urgent, false);
});

test("emitQuest records a known prerequisite in requires, else null", () => {
  // 109 "Attack of the Rathian" appears once 10203 "Shadow in the Snow" is cleared.
  assert.equal(withHeader(109, 0)?.requires, 10203);
  assert.equal(withHeader(101, 0)?.requires, null);
  assert.equal(withHeader(10203, 1)?.requires, null);
});

test("emitQuest returns null for the disc's unused/disabled quest slots (real 'm5000x' placeholder text)", () => {
  const disabled: ParsedQuest = {
    ...GIADROME_HUNT,
    header: { ...GIADROME_HUNT.header, questId: 50001, fee: 0, reward: 1 },
    strings: {
      title: "**********",
      goal: "**********",
      fail: "**********",
      details: "**********",
      monsters: "**********",
      client: "**********",
    },
  };
  assert.equal(emitQuest(disabled), null);
});

test("emitQuest also drops the EU disc's unused slots, whose text is 'none'", () => {
  const none = {
    title: "none",
    goal: "none",
    fail: "none",
    details: "none",
    monsters: "none",
    client: "none",
  };
  const unused: ParsedQuest = {
    ...GIADROME_HUNT,
    header: { ...GIADROME_HUNT.header, questId: 40001, fee: 0, reward: 3000 },
    strings: none,
  };
  assert.equal(emitQuest(unused), null);
});

test("classifyRewardTable labels main, extra and conditional tables from Unkn1/Unkn2", () => {
  // Real (Unkn1, Unkn2) pairs from the EU disc.
  assert.deepEqual(classifyRewardTable({ unkn1: 0x8000, unkn2: 0x0600 }), {
    kind: "main",
    draws: 6,
    condition: null,
  });
  assert.deepEqual(classifyRewardTable({ unkn1: 0x8001, unkn2: 0 }), {
    kind: "extra",
    draws: 1,
    condition: null,
  });
  // Elder dragon "Slay" quests (1) and Treasure Hunting tiers (0x10c-0x119) stay raw.
  for (const unkn1 of [1, 0x28, 0x101, 0x119]) {
    assert.deepEqual(classifyRewardTable({ unkn1, unkn2: 0 }), {
      kind: "conditional",
      draws: null,
      condition: unkn1,
    });
  }
});

test("emitQuest labels every table of a multi-table quest in disc order", () => {
  const items = [{ chance: 100, itemId: 342, amount: 3 }];
  const emitted = emitQuest({
    ...VILLAGE_GIADROME,
    rewards: [
      { unkn1: 0x8000, unkn2: 0x0500, itemsPtr: 0, items },
      { unkn1: 0x8001, unkn2: 0, itemsPtr: 0, items },
      { unkn1: 1, unkn2: 0, itemsPtr: 0, items },
    ],
  });
  assert.deepEqual(
    emitted?.reward_tables.map((t) => [t.kind, t.draws, t.condition]),
    [
      ["main", 5, null],
      ["extra", 1, null],
      ["conditional", null, 1],
    ],
  );
  assert.deepEqual(emitted?.reward_tables[2]!.items, [
    { chance: 100, item: "Giaprey Hide", amount: 3 },
  ]);
});

test("emitQuest returns a null target when targetNum is 0 (no single hunt/capture objective)", () => {
  const emitted = emitQuest({
    ...VILLAGE_GIADROME,
    header: { ...VILLAGE_GIADROME.header, targetNum: 0 },
  });
  assert.ok(emitted);
  assert.equal(emitted.target, null);
});

test("emitQuestsFile groups quests by hub and drops unused slots and boardless quests", () => {
  const disabled: ParsedQuest = {
    ...GIADROME_HUNT,
    header: { ...GIADROME_HUNT.header, rank: 0, questId: 50001 },
    strings: { ...GIADROME_HUNT.strings!, title: "**********" },
  };
  const training: ParsedQuest = {
    ...GIADROME_HUNT,
    header: { ...GIADROME_HUNT.header, rank: 4, questId: 21001 },
  };

  // 40001 has real text here, but its ID block is on no board.
  const boardless: ParsedQuest = {
    ...GIADROME_HUNT,
    header: { ...GIADROME_HUNT.header, questId: 40001 },
  };

  const output = emitQuestsFile([VILLAGE_GIADROME, GIADROME_HUNT, disabled, training, boardless]);
  assert.deepEqual(Object.keys(output).sort(), Object.values(QUEST_HUB_TO_FILE).sort());
  assert.equal(output[QUEST_HUB_TO_FILE.village]!.quests.length, 1);
  assert.equal(output[QUEST_HUB_TO_FILE["training-school"]]!.quests.length, 1);
  assert.equal(output[QUEST_HUB_TO_FILE.guild]!.quests.length, 1);
  assert.equal(output[QUEST_HUB_TO_FILE["treasure-hunting"]]!.quests.length, 0);
});

test("emitQuest gives each large monster its stat multiplier row", () => {
  const calls: [number, number, number][] = [];
  const row = { hp: 0.35, attack: 1.02, defense: 1, status: 1 };
  const emitted = emitQuest(
    { ...GIADROME_HUNT, header: { ...GIADROME_HUNT.header, statTable: 1 } },
    (emId, statTable, power) => {
      calls.push([emId, statTable, power]);
      return row;
    },
  )!;
  assert.deepEqual(calls, [[77, 1, 4]]);
  assert.deepEqual(emitted.large_monsters, [
    { monster: "Giadrome", quantity: 1, power: 4, multipliers: row },
  ]);
  // No row: the field is left out rather than null.
  assert.deepEqual(emitQuest(GIADROME_HUNT, () => null)!.large_monsters, [
    { monster: "Giadrome", quantity: 1, power: 4 },
  ]);
});

test("emitQuest gives the quest's monster size range, and the flag fixed-size story quests wait on", () => {
  const sizes: SizeTables = {
    // Every roll is 100.
    tierPick: Array(32).fill(0),
    tiers: [Array(32).fill(100)],
    variation: [
      [100, 100],
      [100, 105],
      [100, 115],
      [95, 114],
      [85, 125],
    ],
    crowns: [{ emIds: [77], mini: 90, silver: 119, gold: 123 }],
    baseSizes: [],
    fixedSizeQuests: new Map([[10006, 322]]),
  };
  const quest = (questId: number, monSizeModifier: number, sizeVariation: number) => ({
    ...GIADROME_HUNT,
    header: { ...GIADROME_HUNT.header, questId, monSizeModifier, sizeVariation },
  });
  assert.deepEqual(emitQuest(quest(1, 130, 4), undefined, sizes)!.monster_size, {
    modifier: 130,
    min: 110,
    max: 162,
  });
  // Giadrome at 130 is always a gold crown.
  assert.deepEqual(
    emitQuest(quest(1, 130, 4), undefined, sizes)!.large_monsters[0]!.crown_chances,
    {
      mini: 0,
      silver: 0,
      gold: 1,
    },
  );
  assert.deepEqual(emitQuest(quest(10006, 100, 3), undefined, sizes)!.monster_size, {
    modifier: 100,
    min: 95,
    max: 114,
    fixed_until_flag: 322,
  });
  // No size tables, or no large monsters: null.
  assert.equal(emitQuest(quest(1, 100, 0))!.monster_size, null);
  assert.equal(
    emitQuest({ ...quest(1, 100, 0), largeMonsters: [] }, undefined, sizes)!.monster_size,
    null,
  );
});
