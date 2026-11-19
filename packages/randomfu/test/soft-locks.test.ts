/**
 * The guards against quests that can't be finished: slay goals keep enough
 * small monsters, deliveries keep the monsters they're carved from, swapped
 * monsters start where their kind starts, HP stays within what the game
 * holds, and a randomized carve list never repeats an item it keeps. Built
 * on hand-made quest payloads, so each case is exactly the one tested.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Edits } from "../src/edits.js";
import type { GameData, LoadedOverlay, LoadedQuest } from "../src/game/load.js";
import { readSpawns } from "../src/game/spawns.js";
import { Rng } from "../src/rng.js";
import type { MonsterRewardSlot, RewardList } from "../src/shuffles/monster-rewards.js";
import { choiceStarts, fittingLevels } from "../src/patches/unknown-quests.js";
import {
  carvesOf,
  isDeliveryCarve,
  randomizeMonsterRewards,
} from "../src/shuffles/monster-rewards.js";
import {
  collectStartPoints,
  hpLimit,
  MAX_HP,
  randomizeDifficulty,
  randomizeSmallCounts,
  readStart,
  restart,
  smallMonsterFloors,
  swapSpecies,
  type QuestMonsters,
} from "../src/shuffles/quest-monsters.js";

const LARGE_TABLE = 0x100;
const LARGE_DATA = 0x140;
const SMALL_INDEX = 0x400;
const SMALL_DATA = 0x440;
const RECORD = 60;

interface QuestSpec {
  questId: number;
  map: number;
  type?: number;
  target?: [number, number];
  /** A second goal (header 0x74): hunt this monster, `count` of it. */
  second?: [number, number];
  objective?: [number, number];
  large?: { em: number; stage: number; x?: number; power?: number }[];
  small?: [number, number][];
}

/** A quest payload with the header fields and spawn lists `readSpawns` reads. */
function quest(spec: QuestSpec, index = spec.questId): LoadedQuest {
  const payload = Buffer.alloc(0x800);
  payload[76] = spec.type ?? 1;
  const [target, count] = spec.target ?? [spec.large?.[0]?.em ?? 0, 1];
  payload.writeUInt16LE(target, 112);
  payload.writeUInt16LE(count, 114);
  if (spec.second) {
    payload.writeUInt32LE(1, 0x74);
    payload.writeUInt16LE(spec.second[0], 0x78);
    payload.writeUInt16LE(spec.second[1], 0x7a);
  }
  if (spec.objective) {
    payload.writeUInt32LE(1, 0x28);
    payload.writeUInt16LE(spec.objective[0], 0x2c);
    payload[0x2e] = spec.objective[1];
  }
  const large = spec.large ?? [];
  payload.writeUInt16LE(1, LARGE_TABLE);
  payload.writeUInt32LE(LARGE_TABLE + 0x20, LARGE_TABLE + 8);
  payload.writeUInt32LE(LARGE_DATA, LARGE_TABLE + 12);
  const species = [...new Set(large.map((l) => l.em))];
  species.forEach((em, i) => payload.writeUInt16LE(em, LARGE_TABLE + 0x20 + i * 4));
  payload.writeUInt16LE(0xffff, LARGE_TABLE + 0x20 + species.length * 4);
  large.forEach((l, i) => {
    const at = LARGE_DATA + i * RECORD;
    payload.writeUInt16LE(l.em, at);
    payload[at + 4] = 1;
    payload[at + 5] = l.power ?? 3;
    payload.writeUInt16LE(l.stage, at + 8);
    payload.writeUInt32LE(0x4000, at + 28);
    payload.writeFloatLE(l.x ?? 0, at + 32);
  });
  payload.writeUInt16LE(0xffff, LARGE_DATA + large.length * RECORD);
  payload.writeUInt32LE(SMALL_INDEX + 0x10, SMALL_INDEX);
  payload.writeUInt32LE(1, SMALL_INDEX + 0x10);
  payload.writeUInt32LE(SMALL_DATA, SMALL_INDEX + 0x10 + 12);
  const small = spec.small ?? [];
  small.forEach(([em, quantity], i) => {
    payload.writeUInt16LE(em, SMALL_DATA + i * RECORD);
    payload[SMALL_DATA + i * RECORD + 4] = quantity;
  });
  payload.writeUInt16LE(0xffff, SMALL_DATA + small.length * RECORD);
  const header = {
    questId: spec.questId,
    rank: 1,
    questStars: 1,
    map: spec.map,
    statTable: 0,
    questType: payload[76],
    targetId: target,
    targetNum: count,
    largeMonPtr: large.length > 0 ? LARGE_TABLE : 0,
    smallMonPtr: small.length > 0 ? SMALL_INDEX : 0,
  };
  return {
    index,
    path: `mission_jpn/m${spec.questId}.mib`,
    file: { payload },
    parsed: { header, largeMonsters: [], smallMonsters: [], rewards: [] },
  } as unknown as LoadedQuest;
}

const monsters = (q: LoadedQuest): QuestMonsters => ({
  quest: q,
  tier: { band: "low", stars: 1 },
  spawns: readSpawns(q.file.payload, q.parsed.header),
});

const edits = () => new Edits({} as GameData);
const name = (em: number) => `monster ${em}`;
const total = (payload: Buffer, q: LoadedQuest, em: number) =>
  readSpawns(payload, q.parsed.header)
    .small.filter((s) => s.monsterId === em)
    .reduce((n, s) => n + s.quantity, 0);

test("a slay goal's small monsters, and a delivery's carved ones, never fall below what it needs", () => {
  // Slay 10 Blangos (61), with exactly 10; Velociprey (16) are free to change.
  const slay = quest({
    questId: 1001,
    map: 2,
    target: [61, 10],
    small: [
      [61, 5],
      [61, 5],
      [16, 6],
    ],
  });
  // An objective asks for 4 Remobras (63) of 6.
  const objective = quest({ questId: 1002, map: 2, objective: [63, 4], small: [[63, 6]] });
  // Deliver Popo Tongues: Popos (70) are carved for them.
  const delivery = quest({ questId: 1003, map: 2, type: 2, target: [304, 3], small: [[70, 4]] });
  const keep = (q: LoadedQuest, em: number) => q === delivery && em === 70;

  assert.deepEqual([...smallMonsterFloors(monsters(slay), () => false)], [[61, 10]]);
  // A second goal asks for 3 Velociprey (16) of 6 too.
  const both = quest({
    questId: 1004,
    map: 2,
    target: [61, 10],
    second: [16, 3],
    small: [
      [61, 12],
      [16, 6],
    ],
  });
  assert.deepEqual([...smallMonsterFloors(monsters(both), () => false)].sort(), [
    [16, 3],
    [61, 10],
  ]);
  assert.deepEqual([...smallMonsterFloors(monsters(objective), () => false)], [[63, 4]]);
  assert.deepEqual([...smallMonsterFloors(monsters(delivery), (em) => em === 70)], [[70, 4]]);
  // A delivery's target is an item, not a monster.
  assert.equal(smallMonsterFloors(monsters(delivery), () => false).size, 0);

  let moved = 0;
  let held = 0;
  for (let seed = 0; seed < 40; seed++) {
    const e = edits();
    const report = randomizeSmallCounts(
      [slay, objective, delivery].map(monsters),
      0.9,
      new Rng(`counts${seed}`),
      e,
      name,
      keep,
    );
    assert.ok(total(e.questNow(slay), slay, 61) >= 10);
    assert.ok(total(e.questNow(objective), objective, 63) >= 4);
    assert.ok(total(e.questNow(delivery), delivery, 70) >= 4);
    if (total(e.questNow(slay), slay, 16) !== 6) moved++;
    if (report.notes.some((n) => /kept some counts/.test(n))) held++;
  }
  assert.ok(moved > 0, "other small monsters still change");
  assert.ok(held > 0, "the report says when counts were held");
});

test("a goal whose monster keeps coming (99) needs nothing kept", () => {
  const q = quest({ questId: 1001, map: 2, target: [16, 20], small: [[16, 99]] });
  assert.equal(smallMonsterFloors(monsters(q), () => false).size, 0);
});

test("swapped monsters only become ones that start on the map, and start where their kind does", () => {
  // Map 2 by day: a Rathian (1) on dry ground in stage 10, a Plesioth (21)
  // in the water of stage 20. Kushala (54) is met here only at night (map 16).
  const rathian = quest({ questId: 1001, map: 2, large: [{ em: 1, stage: 10, x: 1 }] }, 0);
  const plesioth = quest({ questId: 1002, map: 2, large: [{ em: 21, stage: 20, x: 2 }] }, 1);
  const night = quest({ questId: 1003, map: 16, large: [{ em: 54, stage: 30, x: 3 }] }, 2);
  const all = [rathian, plesioth, night];
  const starts = collectStartPoints(all);
  assert.deepEqual(
    starts.get(2)!.map((s) => [s.monster, s.stage]),
    [
      [1, 10],
      [21, 20],
    ],
  );

  const seen = new Set<string>();
  for (let seed = 0; seed < 40; seed++) {
    const e = edits();
    swapSpecies(all.map(monsters), "any", new Rng(`starts${seed}`), e, all, () => 1, starts, name);
    for (const q of [rathian, plesioth]) {
      const payload = e.questNow(q);
      const [spawn] = readSpawns(payload, q.parsed.header).large;
      assert.notEqual(spawn!.monsterId, 54, "no start for Kushala on the day map");
      const start = readStart(payload, spawn!.offset);
      const expected = spawn!.monsterId === 1 ? [10, 1] : [20, 2];
      assert.deepEqual([start.stage, start.x], expected, `monster ${spawn!.monsterId}`);
      seen.add(`${q.parsed.header.questId}:${spawn!.monsterId}`);
    }
  }
  assert.ok(seen.has("1001:21") && seen.has("1002:1"), "both quests swapped at some seed");
});

test("variant swaps keep their starts", () => {
  const rathian = quest({ questId: 1001, map: 2, large: [{ em: 1, stage: 10 }] }, 0);
  const pink = quest({ questId: 1002, map: 2, large: [{ em: 37, stage: 12 }] }, 1);
  const all = [rathian, pink];
  for (let seed = 0; seed < 10; seed++) {
    const e = edits();
    swapSpecies(
      all.map(monsters),
      "variants",
      new Rng(`v${seed}`),
      e,
      all,
      () => 1,
      collectStartPoints(all),
      name,
    );
    for (const [q, stage] of [
      [rathian, 10],
      [pink, 12],
    ] as const) {
      const [spawn] = readSpawns(e.questNow(q), q.parsed.header).large;
      assert.equal(readStart(e.questNow(q), spawn!.offset).stage, stage);
    }
  }
});

test("a variant swap moves both goals of a two-goal quest", () => {
  // Hunt the Rathian (1) and Rathalos (11); Pink Rathian (37) and Azure Rathalos (49) are on the map.
  const pair = quest(
    {
      questId: 1001,
      map: 2,
      target: [1, 1],
      second: [11, 1],
      large: [
        { em: 1, stage: 10 },
        { em: 11, stage: 11, x: 1 },
      ],
    },
    0,
  );
  const pink = quest({ questId: 1002, map: 2, large: [{ em: 37, stage: 10 }] }, 1);
  const azure = quest({ questId: 1003, map: 2, large: [{ em: 49, stage: 11 }] }, 2);
  const all = [pair, pink, azure];
  let swapped = 0;
  for (let seed = 0; seed < 20; seed++) {
    const e = edits();
    swapSpecies(
      all.map(monsters),
      "variants",
      new Rng(`pair${seed}`),
      e,
      all,
      () => 1,
      collectStartPoints(all),
      name,
    );
    const payload = e.questNow(pair);
    const large = new Set(readSpawns(payload, pair.parsed.header).large.map((s) => s.monsterId));
    const goals = [payload.readUInt16LE(0x70), payload.readUInt16LE(0x78)];
    for (const id of goals) assert.ok(large.has(id), `seed ${seed}: goal ${id} is in the quest`);
    if (!large.has(1) || !large.has(11)) swapped++;
  }
  assert.ok(swapped > 0, "the pair swapped at some seed");
});

test("a restart keeps points of the monster's kind and moves the rest to free ones, never shared", () => {
  const at = (monster: number, stage: number, x = 0) => ({
    monster,
    stage,
    rotation: 0,
    x,
    y: 0,
    z: 0,
  });
  const { monster: _, ...point } = at(1, 10);
  // Rathian (1) starts at 10 and 11 (twice: one point), Plesioth (21) at 20.
  const starts = [at(1, 10), at(1, 11), at(1, 11), at(21, 20)];
  const plesioth = { stage: 20, rotation: 0, x: 0, y: 0, z: 0 };
  assert.deepEqual(
    restart(starts, 1, [point], () => 0),
    [null],
    "its kind's point stays",
  );
  assert.deepEqual(
    restart(starts, 1, [plesioth, plesioth], () => 0)?.map((p) => p?.stage),
    [10, 11],
    "two records, two points",
  );
  assert.deepEqual(
    restart(starts, 1, [plesioth], () => 0, new Set(["10:0:0:0"]))?.map((p) => p?.stage),
    [11],
    "not where another monster of the quest starts",
  );
  assert.equal(
    restart(starts, 1, [plesioth, plesioth, plesioth], () => 0),
    null,
    "too few",
  );
  assert.equal(
    restart(starts, 54, [plesioth], () => 0),
    null,
    "its kind never starts here",
  );
});

test("a swapped monster's level steps down until its HP fits", () => {
  const rathian = quest({ questId: 1001, map: 2, large: [{ em: 1, stage: 10, power: 8 }] }, 0);
  const plesioth = quest({ questId: 1002, map: 2, large: [{ em: 21, stage: 20, power: 1 }] }, 1);
  const all = [rathian, plesioth];
  let swapped = 0;
  for (let seed = 0; seed < 20; seed++) {
    const e = edits();
    const { report } = swapSpecies(
      all.map(monsters),
      "any",
      new Rng(`hp${seed}`),
      e,
      all,
      () => 1,
      collectStartPoints(all),
      name,
      [],
      (em, _table, power) => em !== 21 || power <= 2,
    );
    const [spawn] = readSpawns(e.questNow(rathian), rathian.parsed.header).large;
    if (spawn!.monsterId !== 21) continue;
    swapped++;
    assert.equal(spawn!.power, 2);
    assert.ok(report.notes.some((n) => /took a lower level/.test(n)));
  }
  assert.ok(swapped > 0);
});

test("HP limits keep base HP times the highest multiplier of a set within the game's 16 bits", () => {
  const q = quest({ questId: 1001, map: 2, large: [{ em: 7, stage: 1, power: 4 }] });
  const hpOf = (set: number, _table: number, power: number) =>
    set === 3 ? (power === 4 ? 1.2 : 1) : null;
  const limit = hpLimit([q], edits(), (em) => (em === 7 || em === 58 ? 3 : 1), hpOf);
  assert.equal(limit(7), Math.floor(MAX_HP / 1.2));
  assert.equal(limit(58), Math.floor(MAX_HP / 1.2), "by set: another siege monster too");
  assert.equal(limit(1), 0xffff, "a set no quest uses has no limit");
});

test("difficulty never picks a level whose HP wouldn't fit, staying nearer the monster's own", () => {
  const low = quest({ questId: 1001, map: 2, large: [{ em: 7, stage: 1, power: 0 }] }, 0);
  const high = quest({ questId: 1002, map: 2, large: [{ em: 7, stage: 1, power: 10 }] }, 1);
  for (let seed = 0; seed < 20; seed++) {
    const e = edits();
    randomizeDifficulty(
      [low, high].map(monsters),
      { spread: 10, range: "any" },
      new Rng(`d${seed}`),
      e,
      () => 3,
      name,
      (_em, _table, power) => power <= 3,
    );
    const level = (q: LoadedQuest) => readSpawns(e.questNow(q), q.parsed.header).large[0]!.power;
    assert.ok(level(low) <= 3, `level ${level(low)}`);
    // Its own level is kept even if it doesn't fit: it's the disc's.
    assert.ok(level(high) === 10 || level(high) <= 3);
  }
});

test("randomized carves never draw an item the list keeps", () => {
  const offset = 0x10;
  const entries = [
    { chance: 50, itemId: 304 },
    { chance: 30, itemId: 1 },
    { chance: 20, itemId: 2 },
  ];
  const list: RewardList = {
    offset,
    stride: 4,
    entries,
    refs: [{ emId: 70, source: "body", rank: "low" }],
  };
  const tier = { band: "low" as const, stars: 1 };
  // The first slot (the delivery's carve) isn't given: it stays.
  const slots: MonsterRewardSlot[] = entries.slice(1).map((e, i) => ({
    list,
    tier,
    offset: offset + (i + 1) * 4,
    chance: e.chance,
    itemId: e.itemId,
    amount: undefined,
  }));
  const items = [304, 1, 2, 3];
  for (let seed = 0; seed < 30; seed++) {
    const e = edits();
    const gameSub = { index: 9 } as LoadedOverlay;
    const buf = Buffer.alloc(0x40);
    entries.forEach((x, i) => {
      buf.writeUInt16LE(x.chance, offset + i * 4);
      buf.writeUInt16LE(x.itemId, offset + i * 4 + 2);
    });
    e.files.set(gameSub.index, buf);
    randomizeMonsterRewards(
      slots,
      { scope: "any", chances: "rarity" },
      { tiers: new Map(items.map((i) => [i, tier])), allItems: items, amounts: () => [] },
      new Rng(`carves${seed}`),
      e,
      gameSub,
      name,
    );
    const drawn = [1, 2].map((k) => buf.readUInt16LE(offset + k * 4 + 2));
    assert.ok(!drawn.includes(304), `seed ${seed}: ${drawn}`);
    assert.equal(buf.readUInt16LE(offset + 2), 304, "the kept carve stays");
  }
});

test("a delivery's carve is pinned only on its monster's carves at the quest's rank", () => {
  // Popo (70) carves: Popo Tongues (304) in Low Rank and High Rank lists.
  const list = (rank: "low" | "high", stride: 4 | 6 = 4) => ({
    offset: 0,
    stride,
    entries: [{ chance: 100, itemId: 304 }],
    refs: [{ emId: 70, source: "body", rank }],
  });
  assert.ok(carvesOf(list("low"), 70, "low"));
  assert.ok(!carvesOf(list("high"), 70, "low"), "another rank's carves");
  assert.ok(!carvesOf(list("low", 6), 70, "low"), "a capture or break list");
  assert.ok(!carvesOf(list("low"), 69, "low"), "another monster's");

  const deliveries = [{ emId: 70, band: "low" as const, itemId: 304 }];
  const slot = (rank: "low" | "high", itemId = 304) =>
    ({ itemId, list: list(rank) }) as unknown as Parameters<typeof isDeliveryCarve>[0];
  assert.ok(isDeliveryCarve(slot("low"), deliveries));
  assert.ok(!isDeliveryCarve(slot("high"), deliveries), "a High Rank list stays free");
  assert.ok(!isDeliveryCarve(slot("low", 305), deliveries), "another item on the list");
});

test("an Unknown Monster choice moves only the records its kind doesn't start at, each to its own point", () => {
  const at = (monster: number, stage: number) => ({
    monster,
    stage,
    rotation: 0,
    x: stage,
    y: 0,
    z: 0,
  });
  const point = (stage: number) => ({ stage, rotation: 0, x: stage, y: 0, z: 0 });
  // The map: Rathalos (2) starts at 10 and 11, Plesioth (21) at 20 and 21.
  const starts = [at(2, 10), at(2, 11), at(21, 20), at(21, 21)];
  const template = {
    records: [
      { at: 0x200, point: point(20) }, // already a Plesioth point
      { at: 0x23c, point: point(10) },
    ],
  };
  assert.deepEqual(choiceStarts(template, starts, 21), [{ at: 0x23c, point: point(21) }]);
  assert.deepEqual(choiceStarts(template, starts, 2), [{ at: 0x200, point: point(11) }]);
  const three = { records: [...template.records, { at: 0x278, point: point(30) }] };
  assert.equal(choiceStarts(three, starts, 21), null, "two points for three records");
  assert.equal(choiceStarts(template, starts, 54), null, "its kind starts nowhere here");
});

test("an Unknown Monster choice's levels stop below where its HP would wrap", () => {
  assert.deepEqual(
    fittingLevels([2, 8], (p) => p <= 5),
    [2, 5],
  );
  assert.deepEqual(
    fittingLevels([2, 8], () => true),
    [2, 8],
  );
  assert.equal(
    fittingLevels([2, 8], (p) => p < 2),
    null,
  );
});

test("a swap's HP step-down never carries to another record of the same monster", () => {
  const rathian = quest(
    {
      questId: 1001,
      map: 2,
      large: [
        { em: 1, stage: 10, x: 1, power: 8 },
        { em: 1, stage: 11, x: 2, power: 3 },
      ],
    },
    0,
  );
  const plesioth = quest(
    {
      questId: 1002,
      map: 2,
      large: [
        { em: 21, stage: 20, x: 3 },
        { em: 21, stage: 21, x: 4 },
      ],
    },
    1,
  );
  const all = [rathian, plesioth];
  let swapped = 0;
  for (let seed = 0; seed < 20; seed++) {
    const e = edits();
    swapSpecies(
      all.map(monsters),
      "any",
      new Rng(`levels${seed}`),
      e,
      all,
      () => 1,
      collectStartPoints(all),
      name,
      [],
      (em, _table, power) => em !== 21 || power <= 6,
    );
    const large = readSpawns(e.questNow(rathian), rathian.parsed.header).large;
    if (large[0]!.monsterId !== 21) continue;
    swapped++;
    assert.deepEqual(
      large.map((s) => s.power),
      [6, 3],
    );
  }
  assert.ok(swapped > 0);
});
