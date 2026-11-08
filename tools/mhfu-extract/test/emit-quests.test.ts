import assert from "node:assert/strict";
import { test } from "node:test";
import { emitQuest, emitQuestsFile, QUEST_HUB_TO_FILE } from "../src/emit/quests.js";
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
    rank: 0,
    spawn: 0,
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
    { stageId: 92, monsters: [] },
    {
      stageId: 93,
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
      monsters: [
        { monsterId: 35, quantity: 5, power: 0 },
        { monsterId: 19, quantity: 3, power: 0 },
      ],
    },
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

test("emitQuest reproduces the real 'Hunt 1 Giadrome' quest (ID 1) end-to-end", () => {
  const emitted = emitQuest(GIADROME_HUNT);
  assert.ok(emitted);
  assert.equal(emitted.id, 1);
  assert.equal(emitted.hub, "village");
  assert.equal(emitted.rank, null);
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
  assert.deepEqual(emitted.reward_tables[0]!.items, [
    { chance: 1, item: "Giadrome Claw", amount: 1 },
    { chance: 25, item: "Giaprey Hide", amount: 1 },
    { chance: 10, item: "Giadrome Hide", amount: 1 },
    { chance: 25, item: "Sm Monster Bone", amount: 1 },
    { chance: 4, item: "Armor Sphere", amount: 1 },
  ]);
  assert.deepEqual(emitted.large_monsters, [{ monster: "Giadrome", quantity: 1, power: 4 }]);
  // Deduped across the two verbatim-repeated zone lists, keeping the max quantity seen per species.
  assert.deepEqual(emitted.small_monsters, [
    { monster: "Giaprey", max_quantity: 5 },
    { monster: "Vespoid", max_quantity: 3 },
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

test("emitQuest maps guild ranks 1/2/5 to guild low/high/g-rank tiers", () => {
  const guildLow = emitQuest({ ...GIADROME_HUNT, header: { ...GIADROME_HUNT.header, rank: 1 } });
  const guildHigh = emitQuest({ ...GIADROME_HUNT, header: { ...GIADROME_HUNT.header, rank: 2 } });
  const guildG = emitQuest({ ...GIADROME_HUNT, header: { ...GIADROME_HUNT.header, rank: 5 } });
  assert.deepEqual([guildLow?.hub, guildLow?.rank], ["guild", "low-rank"]);
  assert.deepEqual([guildHigh?.hub, guildHigh?.rank], ["guild", "high-rank"]);
  assert.deepEqual([guildG?.hub, guildG?.rank], ["guild", "g-rank"]);
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

test("emitQuest returns a null target when targetNum is 0 (no single hunt/capture objective)", () => {
  const emitted = emitQuest({
    ...GIADROME_HUNT,
    header: { ...GIADROME_HUNT.header, targetNum: 0 },
  });
  assert.equal(emitted?.target, null);
});

test("emitQuestsFile groups quests by hub and drops unused slots", () => {
  const disabled: ParsedQuest = {
    ...GIADROME_HUNT,
    header: { ...GIADROME_HUNT.header, rank: 0, questId: 50001 },
    strings: { ...GIADROME_HUNT.strings!, title: "**********" },
  };
  const training: ParsedQuest = {
    ...GIADROME_HUNT,
    header: { ...GIADROME_HUNT.header, rank: 4, questId: 21001 },
  };

  const output = emitQuestsFile([GIADROME_HUNT, disabled, training]);
  assert.deepEqual(Object.keys(output).sort(), Object.values(QUEST_HUB_TO_FILE).sort());
  assert.equal(output[QUEST_HUB_TO_FILE.village]!.quests.length, 1);
  assert.equal(output[QUEST_HUB_TO_FILE["training-school"]]!.quests.length, 1);
  assert.equal(output[QUEST_HUB_TO_FILE.guild]!.quests.length, 0);
  assert.equal(output[QUEST_HUB_TO_FILE["treasure-hunting"]]!.quests.length, 0);
});
