import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import {
  parseQuest as parseDoc,
  serializeQuest,
  type QuestDoc,
} from "mhfu-extract/src/quests/document.js";
import { parseQuest } from "mhfu-extract/src/quests/parser.js";
import { sampleDoc, spawn } from "mhfu-extract/test/quest-document-sample.js";
import { enumMonsterNames } from "../src/names.js";
import { Edits } from "../src/edits.js";
import type { BoardFile } from "../src/game/board.js";
import { itemSources, lostSources } from "../src/game/first-tiers.js";
import { loadGame, type GameData, type LoadedQuest } from "../src/game/load.js";
import { largestQuest, rebuildQuest } from "../src/game/rebuild.js";
import { Rng } from "../src/rng.js";
import {
  collectDocQuests,
  moveQuests,
  randomizeStarts,
  updateBoardMaps,
  type DocQuest,
} from "../src/shuffles/quest-maps.js";
import { randomize } from "../src/randomize.js";
import type { RewardList } from "../src/shuffles/monster-rewards.js";
import { swapSmallSpecies } from "../src/shuffles/small-monsters.js";
import { writeEdits } from "../src/write.js";
import { buildFixtureDisc, finish, patchInMemory, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

// emIDs: large Rathian 1, Yian Kut-Ku 6, Pink Rathian 37, Diablos 14; small
// Kelbi 3, Genprey 13, Velociprey 16, Rocks 29, Ioprey 30, Giaprey 35.
// Maps: Forest and Hills 2 (day) and 16 (night), Desert 3, Volcano 5.

interface Area {
  stage: number;
  species: number[];
}

interface Setup {
  questId: number;
  map: number;
  /** Large monsters and the stage each starts in. */
  large: [monster: number, stage: number][];
  small?: Area[];
  /** The goal names this monster (a small one makes the quest stay). */
  target?: number;
  delivery?: boolean;
  /** The header's `spawn` byte. */
  spawn?: number;
  stars?: number;
}

function makeDoc(s: Setup): QuestDoc {
  const doc = sampleDoc(s.questId);
  const target = s.target ?? s.large[0]?.[0] ?? 0;
  doc.arena = null;
  doc.positions = [];
  doc.header.map = s.map;
  doc.header.spawn = s.spawn ?? 0;
  doc.header.stars = s.stars ?? 3;
  doc.header.questType = s.delivery ? 2 : 4;
  doc.header.objectives = [
    s.delivery
      ? { kind: 2, id: 120, count: 1, slot: 1 }
      : { kind: target ? 1 : 0, id: target, count: 1, slot: 1 },
    { kind: 0, id: 0, count: 0, slot: 2 },
  ];
  doc.header.targetId = s.delivery ? 120 : target;
  doc.large = [
    {
      unk1: 1,
      unk2: 0,
      preload: [...new Set(s.large.map(([m]) => m))],
      spawns: s.large.map(([m, stage]) => spawn(m, { stage, x: stage * 10 })),
    },
  ];
  const areas = s.small ?? [];
  doc.small = {
    sets: [0, 0, 0],
    lists: [{ stamp: 1123, areas: areas.map((a, group) => ({ stage: a.stage, group })) }],
    groups: areas.map((a) => ({
      preload: [...new Set(a.species)],
      spawns: a.species.map((m) => spawn(m, { stage: 0 })),
    })),
  };
  // Something to tell each map's gathering points apart by, in the first of
  // 13 areas (the Forest and Hills' count, as many as any map here has).
  doc.gatherAreas = [
    [{ x: s.map, y: 0, z: 0, range: 100, table: 0, mostGathers: 2, type: 0, gathers: 1 }],
    ...Array.from({ length: 12 }, () => []),
  ];
  doc.gatherTables = [{ items: [{ chance: 100, item: 200 + s.map }] }];
  return doc;
}

function loaded(doc: QuestDoc, index: number, room = 4096): LoadedQuest {
  const payload = serializeQuest(doc);
  return {
    index,
    path: `mission_jpn/m${String(doc.header.questId).padStart(5, "0")}.mib`,
    file: {
      payload,
      disc: payload,
      capacity: payload.length + room,
      seal: () => {
        throw new Error("tests don't seal");
      },
    },
    parsed: parseQuest(payload),
  };
}

function quests(setups: Setup[]): DocQuest[] {
  const { list, locked } = collectDocQuests(setups.map((s, i) => loaded(makeDoc(s), i)));
  assert.deepEqual(locked, []);
  return list;
}

const byId = (list: readonly DocQuest[], questId: number) =>
  list.find((e) => e.vanilla.header.questId === questId)!;
const fitsAll = () => true;

test("a quest moves to the other time of day and takes that map's parts", () => {
  const setups: Setup[] = [
    { questId: 1001, map: 2, large: [[1, 36]], small: [{ stage: 32, species: [16] }] },
    { questId: 1002, map: 16, large: [[1, 187]], small: [{ stage: 184, species: [13] }] },
    // Stays: a delivery quest.
    { questId: 1003, map: 2, large: [[1, 36]], delivery: true },
    // Stays: its goal is a small monster. Its Kut-Ku starts elsewhere on map 2.
    { questId: 1004, map: 2, large: [[6, 40]], target: 16 },
  ];
  for (const seed of ["a", "b", "c", "d"]) {
    const list = quests(setups);
    const { report, moved } = moveQuests(list, "time", new Rng(seed), fitsAll, enumMonsterNames);
    assert.deepEqual([...moved].map((e) => e.vanilla.header.questId).sort(), [1001, 1002]);

    const day = byId(list, 1001);
    const night = byId(list, 1002);
    assert.equal(day.doc.header.map, 16);
    assert.deepEqual(day.doc.gatherAreas, night.vanilla.gatherAreas);
    assert.deepEqual(day.doc.gatherTables, night.vanilla.gatherTables);
    assert.deepEqual(day.doc.small, night.vanilla.small);
    assert.deepEqual(day.doc.positions, night.vanilla.positions);
    // The monster, its record and everything else that isn't the map's stay.
    assert.equal(day.doc.large[0]!.spawns[0]!.monster, 1);
    assert.equal(day.doc.large[0]!.spawns[0]!.stage, 187);
    assert.equal(day.doc.large[0]!.spawns[0]!.x, 1870);
    assert.deepEqual(day.doc.large[0]!.spawns[0]!.data2, day.vanilla.large[0]!.spawns[0]!.data2);
    for (const key of ["rewards", "supplies", "text", "script"] as const) {
      assert.deepEqual(day.doc[key], day.vanilla[key]);
    }
    // Map 2 has a Rathian start (36) and a Kut-Ku one (40): Rathian takes its own kind's.
    assert.equal(night.doc.header.map, 2);
    assert.equal(night.doc.large[0]!.spawns[0]!.stage, 36);

    for (const id of [1003, 1004]) assert.deepEqual(byId(list, id).doc, byId(list, id).vanilla);
    assert.ok(report.notes.some((n) => n.startsWith("1 quests stayed: a delivery quest")));
    assert.ok(report.notes.some((n) => n === "1 quests stayed: a small monster target."));
  }
});

test("with any map, a quest only goes where all of its large monsters are found", () => {
  const setups: Setup[] = [
    { questId: 1001, map: 2, large: [[1, 36]] },
    { questId: 1002, map: 5, large: [[1, 162]] },
    { questId: 1003, map: 3, large: [[14, 141]] },
    // Rathian and Pink Rathian: only map 5 has both.
    {
      questId: 1004,
      map: 2,
      large: [
        [1, 36],
        [37, 37],
      ],
    },
    { questId: 1005, map: 5, large: [[37, 163]] },
  ];
  for (const seed of ["a", "b", "c", "d", "e"]) {
    const list = quests(setups);
    const { report } = moveQuests(list, "any", new Rng(seed), fitsAll, enumMonsterNames);
    assert.equal(byId(list, 1001).doc.header.map, 5);
    assert.equal(byId(list, 1002).doc.header.map, 2);
    assert.equal(byId(list, 1003).doc.header.map, 3);
    assert.equal(byId(list, 1004).doc.header.map, 5);
    // Two monsters, two starting points: each its own kind's.
    assert.deepEqual(
      byId(list, 1004).doc.large[0]!.spawns.map((s) => s.stage),
      [162, 163],
    );
    assert.ok(report.notes.some((n) => n.includes("1 quests stayed: no other map")));
  }
});

test("a donor whose parts don't fit is passed over, and a quest with none that fit stays", () => {
  const setups: Setup[] = [
    { questId: 1001, map: 2, large: [[1, 36]] },
    { questId: 1002, map: 16, large: [[1, 187]] },
  ];
  const list = quests(setups);
  const { report, moved } = moveQuests(
    list,
    "time",
    new Rng("x"),
    (entry) => entry.vanilla.header.questId !== 1001,
    enumMonsterNames,
  );
  assert.deepEqual(
    [...moved].map((e) => e.vanilla.header.questId),
    [1002],
  );
  assert.deepEqual(byId(list, 1001).doc, byId(list, 1001).vanilla);
  assert.ok(report.notes.includes("1 quests stayed: no new map's parts fit in their file."));
});

test("start points: only a monster's own kind's, and moved quests are left alone", () => {
  const setups: Setup[] = [
    { questId: 1001, map: 2, large: [[1, 36]] },
    { questId: 1002, map: 2, large: [[1, 38]] },
    { questId: 1003, map: 2, large: [[6, 40]] },
    // Two Kut-Ku and one Kut-Ku start: they share it rather than take a Rathian's.
    {
      questId: 1004,
      map: 2,
      large: [
        [6, 40],
        [6, 40],
      ],
    },
  ];
  const seen = new Set<number>();
  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const list = quests(setups);
    randomizeStarts(list, new Set([byId(list, 1002)]), new Rng(seed), enumMonsterNames);
    const stage = byId(list, 1001).doc.large[0]!.spawns[0]!.stage;
    assert.ok([36, 38].includes(stage));
    seen.add(stage);
    assert.deepEqual(byId(list, 1002).doc, byId(list, 1002).vanilla);
    // The only Kut-Ku start, so it keeps it.
    assert.deepEqual(byId(list, 1003).doc, byId(list, 1003).vanilla);
    for (const s of byId(list, 1004).doc.large[0]!.spawns) assert.equal(s.stage, 40);
  }
  assert.deepEqual([...seen].sort(), [36, 38]);
});

test("a quest only moves where each of its monsters' kinds starts", () => {
  const setups: Setup[] = [
    // Forest and Hills by day starts only a Kut-Ku, by night only a Rathian.
    { questId: 1001, map: 2, large: [[6, 40]] },
    { questId: 1002, map: 16, large: [[1, 187]] },
    // Pink Rathian is a Rathian: it can start where the night's Rathian does.
    { questId: 1003, map: 2, large: [[37, 37]] },
  ];
  for (const seed of ["a", "b", "c"]) {
    const list = quests(setups);
    const { report, moved } = moveQuests(list, "time", new Rng(seed), fitsAll, enumMonsterNames);
    assert.deepEqual(
      [...moved].map((e) => e.vanilla.header.questId),
      [1002, 1003],
    );
    assert.equal(byId(list, 1002).doc.large[0]!.spawns[0]!.stage, 37);
    assert.equal(byId(list, 1003).doc.large[0]!.spawns[0]!.stage, 187);
    assert.ok(report.notes.some((n) => n.startsWith("1 quests stayed: no other map")));
  }
});

test("a moved quest takes the new map's spawn byte unless the map uses its own, and boards follow", () => {
  const setups: Setup[] = [
    { questId: 1001, map: 2, large: [[1, 36]] },
    { questId: 1002, map: 16, large: [[1, 187]], spawn: 2 },
  ];
  const list = quests(setups);
  const { moved } = moveQuests(list, "time", new Rng("s"), fitsAll, enumMonsterNames);
  assert.equal(moved.size, 2);
  assert.equal(byId(list, 1001).doc.header.spawn, 2);
  assert.equal(byId(list, 1002).doc.header.spawn, 0);

  // Two boards list 1001 (Village and Guild style); one also lists a quest that didn't move.
  const files = new Map([
    [7, Buffer.alloc(0x80)],
    [8, Buffer.alloc(0x80)],
  ]);
  const boards: BoardFile[] = [
    {
      index: 7,
      path: "a",
      data: files.get(7)!,
      records: [
        { offset: 0x00, questId: 1001, stringPtrTbl: 0 },
        { offset: 0x40, questId: 9999, stringPtrTbl: 0 },
      ],
    },
    {
      index: 8,
      path: "b",
      data: files.get(8)!,
      records: [{ offset: 0x20, questId: 1001, stringPtrTbl: 0 }],
    },
  ];
  const edits = new Edits({
    dataBin: { read: (index: number) => files.get(index)! },
  } as unknown as GameData);
  updateBoardMaps([byId(list, 1001)], boards, edits);
  assert.equal(edits.dataFileNow(7)[0x1c], 16);
  assert.equal(edits.dataFileNow(7)[0x40 + 0x1c], 0);
  assert.equal(edits.dataFileNow(8)[0x20 + 0x1c], 16);
});

test("quest changes that take away where an item is first found are blamed", () => {
  // Gathering items are 200 + map. Velociprey (16) carves item 300 in Low Rank.
  const lists: RewardList[] = [
    {
      offset: 0,
      stride: 4,
      entries: [{ chance: 100, itemId: 300 }],
      refs: [{ emId: 16, source: "body", rank: "low" }],
    },
  ];
  const setups: Setup[] = [
    { questId: 1001, map: 2, stars: 1, large: [[1, 36]], small: [{ stage: 32, species: [16] }] },
    { questId: 1002, map: 16, stars: 1, large: [[1, 187]] },
    { questId: 1003, map: 2, stars: 3, large: [[1, 36]], small: [{ stage: 32, species: [16] }] },
  ];
  const vanilla = setups.map((s, i) => loaded(makeDoc(s), i));
  const before = itemSources(vanilla, lists);
  // 1001 moved to the night map and lost its Velociprey; nothing else changed.
  const moved = makeDoc({ ...setups[0]!, map: 16, small: [{ stage: 184, species: [13] }] });
  const now = vanilla.map((q, i) => (i === 0 ? loaded(moved, 0) : q));
  const check = (mode: "star" | "rank" | "none") =>
    lostSources(vanilla, before, itemSources(now, lists), new Set([0]), lists, mode);
  // Item 202 and Velociprey's 300 are now first found at 3★: 1001 is to blame.
  assert.deepEqual(check("star"), { blame: new Set([0]), lost: [] });
  // By rank, 3★ is as early as 1★.
  assert.deepEqual(check("rank"), { blame: new Set(), lost: [] });
  assert.deepEqual(check("none"), { blame: new Set(), lost: [] });
  // Not changed, so not to blame: the items are lost.
  const unblamed = lostSources(vanilla, before, itemSources(now, lists), new Set(), lists, "star");
  assert.deepEqual(unblamed.lost.sort(), [202, 300]);
});

test("one quest is blamed per item, when putting back either brings it back", () => {
  const lists: RewardList[] = [
    {
      offset: 0,
      stride: 4,
      entries: [{ chance: 100, itemId: 300 }],
      refs: [{ emId: 16, source: "body", rank: "low" }],
    },
  ];
  const setups: Setup[] = [
    { questId: 1001, map: 2, stars: 1, large: [[1, 36]], small: [{ stage: 32, species: [16] }] },
    { questId: 1002, map: 2, stars: 1, large: [[1, 36]], small: [{ stage: 32, species: [16] }] },
    { questId: 1003, map: 2, stars: 3, large: [[1, 36]], small: [{ stage: 32, species: [16] }] },
    { questId: 1004, map: 16, stars: 1, large: [[1, 187]] },
  ];
  const vanilla = setups.map((s, i) => loaded(makeDoc(s), i));
  const before = itemSources(vanilla, lists);
  // 1001 and 1002 both moved to the night map, losing their Velociprey and item 202.
  const night = (i: number) =>
    loaded(makeDoc({ ...setups[i]!, map: 16, small: [{ stage: 184, species: [13] }] }), i);
  const both = vanilla.map((q, i) => (i < 2 ? night(i) : q));
  const check = lostSources(
    vanilla,
    before,
    itemSources(both, lists),
    new Set([0, 1]),
    lists,
    "star",
  );
  assert.deepEqual(check, { blame: new Set([0]), lost: [] });
  // With 1001 back, 1002's move takes nothing away.
  const one = vanilla.map((q, i) => (i === 1 ? night(i) : q));
  const again = lostSources(vanilla, before, itemSources(one, lists), new Set([1]), lists, "star");
  assert.deepEqual(again, { blame: new Set(), lost: [] });
});

test("a small monster swap never doubles a species only in a preload list", () => {
  const setups: Setup[] = [
    { questId: 1001, map: 2, large: [[1, 36]], small: [{ stage: 33, species: [13, 30] }] },
    { questId: 1002, map: 2, large: [[1, 36]], small: [{ stage: 33, species: [13] }] },
  ];
  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const docs = setups.map(makeDoc);
    // 1002 loads Bullfango (30) in stage 33 but spawns only Hornetaurs (13).
    docs[1]!.small.groups[0]!.preload = [13, 30];
    const { list } = collectDocQuests(docs.map((d, i) => loaded(d, i)));
    swapSmallSpecies(list, new Rng(seed), enumMonsterNames);
    const preload = byId(list, 1002).doc.small.groups[0]!.preload;
    assert.equal(new Set(preload).size, preload.length, `seed ${seed}: ${preload}`);
  }
});

test("small monsters swap per quest, only to species found in every area they're in", () => {
  const setups: Setup[] = [
    // What each stage has across the game.
    {
      questId: 1001,
      map: 2,
      large: [[1, 36]],
      small: [
        { stage: 32, species: [30, 29] },
        { stage: 33, species: [13, 35, 30] },
      ],
    },
    {
      questId: 1002,
      map: 2,
      large: [[1, 36]],
      small: [
        { stage: 32, species: [16, 29] },
        { stage: 33, species: [16, 13] },
        { stage: 34, species: [3] },
      ],
    },
    // Its goal names Velociprey: they stay.
    {
      questId: 1003,
      map: 2,
      large: [[1, 36]],
      target: 16,
      small: [
        { stage: 32, species: [16] },
        { stage: 33, species: [13] },
      ],
    },
    {
      questId: 1004,
      map: 2,
      large: [[1, 36]],
      delivery: true,
      small: [{ stage: 33, species: [13] }],
    },
  ];
  const byStage: Record<number, number[]> = { 32: [16, 29, 30], 33: [13, 16, 30, 35], 34: [3] };
  let changed = 0;
  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const list = quests(setups);
    swapSmallSpecies(list, new Rng(seed), enumMonsterNames);
    for (const entry of list) {
      const { doc, vanilla } = entry;
      const mapping = new Map<number, number>();
      doc.small.lists[0]!.areas.forEach((area, i) => {
        const group = doc.small.groups[area.group]!;
        const old = vanilla.small.groups[area.group]!;
        // Same spawns, other species: each one found in this stage somewhere.
        assert.equal(group.spawns.length, old.spawns.length);
        group.spawns.forEach((s, k) => {
          assert.ok(byStage[area.stage]!.includes(s.monster), `${s.monster} in ${area.stage}`);
          const was = old.spawns[k]!.monster;
          assert.equal(mapping.get(was) ?? s.monster, s.monster, "one species, one replacement");
          mapping.set(was, s.monster);
          assert.deepEqual({ ...s, monster: was }, old.spawns[k]);
        });
        assert.deepEqual(
          group.preload,
          [...new Set(group.spawns.map((s) => s.monster))],
          `area ${i}`,
        );
      });
      // Never two species made one.
      assert.equal(new Set(mapping.values()).size, mapping.size);
      assert.equal(mapping.get(29) ?? 29, 29, "Rocks stay");
      if (vanilla.header.questId === 1003) assert.equal(mapping.get(16), 16);
      if (vanilla.header.questId === 1004) assert.deepEqual(doc, vanilla);
      if (doc !== vanilla && [...mapping].some(([a, b]) => a !== b)) changed++;
    }
  }
  assert.ok(changed > 0);
});

test("a rebuilt quest is padded to its disc length, and refused past its sectors or the largest quest", () => {
  const doc = makeDoc({ questId: 1001, map: 2, large: [[1, 36]] });
  const quest = loaded(doc, 0, 64);
  const roomy = 1 << 20;
  const shorter = structuredClone(doc);
  shorter.supplies = [];
  const rebuilt = rebuildQuest(quest, shorter, roomy)!;
  assert.equal(rebuilt.file.payload.length, quest.file.disc.length);
  assert.equal(rebuilt.file.disc, quest.file.disc);
  assert.deepEqual(parseDoc(rebuilt.file.payload), shorter);
  assert.equal(rebuilt.parsed.supplies.length, 0);

  const longer = structuredClone(doc);
  longer.supplies = Array.from({ length: 200 }, (_, i) => ({ item: 100 + i, amount: 1 }));
  assert.equal(rebuildQuest(quest, longer, roomy), null);

  // Room in its sectors, but past the largest quest on the disc.
  const spacious = loaded(doc, 0, 4096);
  const bigger = structuredClone(doc);
  bigger.supplies.push(...Array.from({ length: 60 }, (_, i) => ({ item: 300 + i, amount: 1 })));
  assert.ok(rebuildQuest(spacious, bigger, roomy));
  assert.equal(rebuildQuest(spacious, bigger, spacious.file.disc.length), null);
  assert.equal(largestQuest([quest, loaded(bigger, 1)]), serializeQuest(bigger).length);
});

test("on a disc: a rebuilt quest is written and read back; quests that can't be rebuilt are named", async () => {
  const output = path.join(tempDir(), "out.iso");
  const original = buildFixtureDisc();
  const image = patchInMemory(original);
  const game = await loadGame(image.source, image.iso);

  // The fixture's small monster tables aren't laid out like the disc's, so most of its quests are locked.
  const result = randomize(
    game,
    settingsWith("maps", [], {
      "questMaps.enabled": true,
      "questMaps.starts": true,
      "questMonsters.smallSpecies": true,
    }),
  );
  const notes = result.reports.flatMap((r) => r.notes).join("\n");
  assert.match(notes, /3 quests can't be rebuilt and were left alone: mission_jpn\/m00001\.mib/);

  // The write path for a rebuilt quest: its own document with the monster moved.
  const quest = game.quests.find((q) => q.parsed.header.questId === 10102)!;
  const doc = parseDoc(quest.file.payload);
  doc.large[0]!.spawns[0]!.stage = 151;
  // The fixture's quests rebuild longer than they are, past its largest.
  const rebuilt = rebuildQuest(quest, doc, quest.file.capacity)!;
  const edits = new Edits(game);
  edits.quest(rebuilt);
  assert.equal(writeEdits(image, game, edits).quests, 1); // and reads it back
  writeFileSync(output, finish(image, original));

  const { source, iso } = openDiscImage(output);
  const after = await loadGame(source, iso);
  const written = after.quests.find((q) => q.parsed.header.questId === 10102)!;
  assert.equal(parseDoc(written.file.payload).large[0]!.spawns[0]!.stage, 151);
  source.close();
});
