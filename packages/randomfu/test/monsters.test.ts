import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import {
  GAME_TASK_JP,
  HITZONE_POINTER_OFFSET,
  HITZONE_ROW_SIZE,
  MONSTER_CHUNK_SIZE,
  TOLERANCE_OFFSET,
} from "mhfu-extract/src/monsters/hitzones.js";
import { openPatchableImage } from "../src/disc/node-file.js";
import { loadGame, type GameData, type LoadedQuest } from "../src/game/load.js";
import { readSpawns, SIZE_PERCENT_OFFSET, TARGET_ID_OFFSET } from "../src/game/spawns.js";
import { randomize } from "../src/randomize.js";
import type { OptionKey, Settings } from "../src/settings.js";
import { MONSTER_FAMILIES } from "../src/shuffles/quest-monsters.js";
import { formatSpoiler } from "../src/spoiler.js";
import { writeEdits } from "../src/write.js";
import {
  buildFixtureDisc,
  FIXTURE_TOLERANCES,
  fixtureHitzone,
  fixtureHp,
  GAME_TASK_INDEX,
  tempDir,
} from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

type Changes = Partial<Record<OptionKey, boolean | number | string>>;
const only = (seed: string, changes: Changes): Settings => settingsWith(seed, [], changes);

const CHUNKS = GAME_TASK_JP.monsterChunks - GAME_TASK_JP.loadBase;
const chunk = (emId: number) => CHUNKS + emId * MONSTER_CHUNK_SIZE;

function fixtureFile(): string {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  return file;
}

const FILE = fixtureFile();

async function load(file = FILE): Promise<{ game: GameData; close: () => void }> {
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: null });
  return { game, close: () => source.close() };
}

const byId = (game: GameData, id: number): LoadedQuest =>
  game.quests.find((q) => q.parsed.header.questId === id)!;

/** A quest's payload after `randomize`: the edited copy, or the original. */
function payloadAfter(result: ReturnType<typeof randomize>, quest: LoadedQuest): Buffer {
  return result.edits.quests.get(quest.index)?.payload ?? quest.file.payload;
}

test("spawn records are read with their offsets", async () => {
  const { game, close } = await load();
  const quest = byId(game, 1001);
  const spawns = readSpawns(quest.file.payload, quest.parsed.header);
  assert.deepEqual(
    spawns.large.map((s) => [s.monsterId, s.quantity, s.power]),
    [[1, 1, 3]],
  );
  assert.deepEqual(
    spawns.loads.map((l) => l.monsterId),
    [1],
  );
  assert.deepEqual(
    spawns.small.map((s) => [s.monsterId, s.quantity]),
    [
      [16, 5],
      [69, 99],
    ],
  );
  for (const s of [...spawns.large, ...spawns.small]) {
    assert.equal(quest.file.payload.readUInt16LE(s.offset), s.monsterId);
  }
  close();
});

test("variant swaps keep each monster in its family and on its map, and move the target", async () => {
  const { game, close } = await load();
  let swaps = 0;
  for (let seed = 0; seed < 20; seed++) {
    const result = randomize(game, only(`v${seed}`, { "questMonsters.species": true }));
    for (const quest of game.quests) {
      const after = payloadAfter(result, quest);
      const spawns = readSpawns(after, quest.parsed.header);
      const before = readSpawns(quest.file.payload, quest.parsed.header);
      const ids = spawns.large.map((s) => s.monsterId);
      if (quest.parsed.header.questId === 20001) {
        assert.deepEqual(ids, [1], "training quests stay");
        continue;
      }
      before.large.forEach((b, i) => {
        const family = MONSTER_FAMILIES.find((f) => f.includes(b.monsterId)) ?? [b.monsterId];
        assert.ok(family.includes(ids[i]!), `${b.monsterId} -> ${ids[i]}`);
        // Monster 42 (Gold Rathian) is in no fixture quest, so never on the map.
        assert.notEqual(ids[i], 42);
        if (ids[i] !== b.monsterId) swaps++;
      });
      assert.equal(new Set(ids).size, new Set(before.large.map((s) => s.monsterId)).size);
      assert.deepEqual(
        spawns.loads.map((l) => l.monsterId),
        [...new Set(ids)],
        "the preload list follows",
      );
      assert.equal(after.readUInt16LE(TARGET_ID_OFFSET), ids[0], "the target follows");
      assert.equal(after.readUInt16LE(0x2c), ids[0], "a monster objective follows");
      assert.equal(
        after.readUInt16LE(0x34),
        quest.file.payload.readUInt16LE(0x34),
        "an item objective stays",
      );
    }
  }
  assert.ok(swaps > 0);
  close();
});

test("rank swaps leave quests with several kinds of monster, and stay in the rank", async () => {
  const { game, close } = await load();
  const changed = new Set<number>();
  for (let seed = 0; seed < 20; seed++) {
    const result = randomize(
      game,
      only(`r${seed}`, { "questMonsters.species": true, "questMonsters.speciesPool": "rank" }),
    );
    for (const id of [10102, 2001, 20001]) {
      assert.ok(!result.edits.quests.has(byId(game, id).index), `quest ${id} unchanged`);
    }
    const quest = byId(game, 1001);
    const ids = readSpawns(payloadAfter(result, quest), quest.parsed.header).large.map(
      (s) => s.monsterId,
    );
    assert.ok([1, 2, 37].includes(ids[0]!));
    changed.add(ids[0]!);
  }
  assert.ok(changed.size > 1);
  close();
});

test("difficulty levels move within the levels quests of the same rank use", async () => {
  const { game, close } = await load();
  const levels = (result: ReturnType<typeof randomize>, id: number) => {
    const quest = byId(game, id);
    return readSpawns(payloadAfter(result, quest), quest.parsed.header).large.map((s) => s.power);
  };
  let moved = false;
  for (let seed = 0; seed < 10; seed++) {
    const result = randomize(
      game,
      only(`d${seed}`, { "questMonsters.difficulty": true, "questMonsters.difficultySpread": 31 }),
    );
    // Low Rank quests use levels 3 to 6; the one High Rank quest only 12.
    for (const id of [1001, 10101, 10102]) {
      for (const p of levels(result, id)) assert.ok(p >= 3 && p <= 6, `${id}: ${p}`);
    }
    assert.deepEqual(levels(result, 2001), [12]);
    assert.deepEqual(levels(result, 20001), [0]);
    moved ||= levels(result, 1001)[0] !== 3;

    const any = randomize(
      game,
      only(`d${seed}`, {
        "questMonsters.difficulty": true,
        "questMonsters.difficultySpread": 31,
        "questMonsters.difficultyRange": "any",
      }),
    );
    for (const id of [1001, 10101, 10102, 2001]) {
      for (const p of levels(any, id)) assert.ok(p >= 3 && p <= 12, `${id}: ${p}`);
    }
  }
  assert.ok(moved);
  close();
});

test("small monster counts stay between 1 and the most any quest has; 99 stays", async () => {
  const { game, close } = await load();
  let changed = 0;
  for (const seed of ["s0", "s1", "s2", "s3"]) {
    const result = randomize(
      game,
      only(seed, { "questMonsters.smallCounts": true, "questMonsters.smallCountSpread": 0.95 }),
    );
    for (const id of [1001, 10101, 2001]) {
      const quest = byId(game, id);
      const before = readSpawns(quest.file.payload, quest.parsed.header).small;
      const after = readSpawns(payloadAfter(result, quest), quest.parsed.header).small;
      after.forEach((s, i) => {
        if (before[i]!.quantity === 99) assert.equal(s.quantity, 99);
        else assert.ok(s.quantity >= 1 && s.quantity <= 8, `${id}: ${s.quantity}`);
        if (s.quantity !== before[i]!.quantity) changed++;
      });
    }
  }
  assert.ok(changed > 0);
  close();
});

test("monster stats change for monsters in quests only, within their spread", async () => {
  const { game, close } = await load();
  const result = randomize(
    game,
    only("stats", {
      "monsterStats.hp": true,
      "monsterStats.size": true,
      "monsterStats.status": true,
    }),
  );
  const task = result.edits.files.get(GAME_TASK_INDEX)!;
  for (const emId of [1, 2, 16, 37, 69]) {
    const hp = task.readUInt16LE(chunk(emId) + 0x100);
    const ratio = hp / fixtureHp(emId);
    assert.ok(ratio >= 0.74 && ratio <= 1.26, `HP ${emId}: ${ratio}`);
    const size = task.readFloatLE(chunk(emId) + 0x40);
    assert.ok(size >= 0.8 && size <= 1.2 && size !== 1, `size ${emId}: ${size}`);
    const paralysis = task.readUInt16LE(chunk(emId) + TOLERANCE_OFFSET);
    const ratioP = paralysis / FIXTURE_TOLERANCES.paralysis[0];
    assert.ok(ratioP >= 0.49 && ratioP <= 1.51, `paralysis ${emId}: ${ratioP}`);
    assert.equal(task.readUInt16LE(chunk(emId) + TOLERANCE_OFFSET + 10), 0, "zeros stay");
  }
  // Monster 3 is in no quest.
  assert.equal(task.readUInt16LE(chunk(3) + 0x100), fixtureHp(3));
  assert.equal(task.readFloatLE(chunk(3) + 0x40), 1);
  const spoiler = formatSpoiler(game, only("stats", { "monsterStats.hp": true }), result);
  assert.match(spoiler, /== Monster stats ==/);
  assert.match(spoiler, new RegExp(`HP \\d+ \\(was ${fixtureHp(1)}\\)`));
  close();
});

/** Each row's 9 values (no lead byte) of a monster's hitzone tables in `game_task.ovl`. */
function hitzones(task: Buffer, emId: number, tables: number): number[][][] {
  const load = GAME_TASK_JP.loadBase;
  const list = task.readUInt32LE(chunk(emId) + HITZONE_POINTER_OFFSET) - load;
  return Array.from({ length: tables }, (_, t) => {
    const at = task.readUInt32LE(list + t * 4) - load;
    return Array.from({ length: 7 }, (_, r) => [
      ...task.subarray(at + r * HITZONE_ROW_SIZE, at + (r + 1) * HITZONE_ROW_SIZE),
    ]);
  });
}

test("elemental weaknesses trade places on every row; nothing else moves", async () => {
  const { game, close } = await load();
  const result = randomize(game, only("e", { "weaknesses.elements": true }));
  const task = result.edits.files.get(GAME_TASK_INDEX)!;
  const tables = hitzones(task, 1, 2);
  let order: number[] | null = null;
  tables.forEach((rows, t) =>
    rows.forEach((row, r) => {
      const was = fixtureHitzone(1, t, r);
      assert.equal(row[0], 100 - r * 10, "lead byte");
      assert.deepEqual(row.slice(1, 4), was.slice(0, 3), "cut, bash, shot");
      assert.equal(row[9], was[8], "KO");
      const elements = row.slice(4, 9).map((v) => was.slice(3, 8).indexOf(v));
      order ??= elements;
      assert.deepEqual(elements, order, "one order for the whole monster");
    }),
  );
  // Monster 69 uses the filler table that non-monsters use: unchanged.
  assert.deepEqual(hitzones(task, 69, 1)[0]![0]!.slice(1), fixtureHitzone(0, 0, 0));
  const spoiler = formatSpoiler(game, only("e", { "weaknesses.elements": true }), result);
  assert.match(spoiler, /Pink Rathian\n {2}shares hitzones with Rathian/);
  close();
});

test("weak spots trade rows, the same way in every state", async () => {
  const { game, close } = await load();
  const result = randomize(game, only("p", { "weaknesses.parts": true }));
  const task = result.edits.files.get(GAME_TASK_INDEX)!;
  const tables = hitzones(task, 1, 2);
  const sources = tables.map((rows, t) =>
    rows.map((row, r) => {
      assert.equal(row[0], 100 - r * 10, "lead byte stays with the row");
      const from = [0, 1, 2, 3, 4, 5, 6].find(
        (k) => JSON.stringify(fixtureHitzone(1, t, k)) === JSON.stringify(row.slice(1)),
      );
      assert.notEqual(from, undefined, `row ${r} holds some row's values`);
      return from!;
    }),
  );
  assert.deepEqual(sources[1], sources[0], "broken state follows");
  assert.deepEqual([...sources[0]!].sort(), [0, 1, 2, 3, 4, 5, 6]);
  assert.notDeepEqual(sources[0], [0, 1, 2, 3, 4, 5, 6]);
  close();
});

test("monster edits are written and read back; other options don't change", async () => {
  const output = path.join(tempDir(), "out.iso");
  writeFileSync(output, readFileSync(FILE));
  const image = openPatchableImage(output);
  const game = await loadGame(image.source, image.iso, { eboot: null });
  const all = only("all", {
    "questMonsters.species": true,
    "questMonsters.difficulty": true,
    "questMonsters.smallCounts": true,
    "monsterStats.hp": true,
    "monsterStats.size": true,
    "monsterStats.status": true,
    "weaknesses.elements": true,
    "weaknesses.parts": true,
  });
  const result = randomize(game, all);
  writeEdits(image, game, result.edits); // checks every file reads back
  image.close();

  const after = await load(output);
  assert.ok(
    after.game.quests.some(
      (q) => !q.file.payload.equals(byId(game, q.parsed.header.questId).file.payload),
    ),
  );
  assert.ok(!after.game.dataBin.read(GAME_TASK_INDEX).equals(game.dataBin.read(GAME_TASK_INDEX)));
  after.close();

  // Each part has its own random stream: turning the monster options on
  // doesn't change what the reward shuffle does on its own.
  const rewardsOnly = randomize(game, settingsWith("all", ["quest-rewards"]));
  const withMonsters = randomize(
    game,
    settingsWith("all", ["quest-rewards"], { "monsterStats.hp": true }),
  );
  assert.deepEqual(
    withMonsters.reports.find((r) => r.title === "Quest rewards"),
    rewardsOnly.reports.find((r) => r.title === "Quest rewards"),
  );
});

test("quest size moves each Village and Guild quest's size percentage within the spread", async () => {
  const { game, close } = await load();
  let changed = 0;
  for (const seed of ["q0", "q1", "q2", "q3"]) {
    const result = randomize(
      game,
      only(seed, { "questMonsters.size": true, "questMonsters.sizeSpread": 0.3 }),
    );
    for (const quest of game.quests) {
      const before = quest.file.payload.readUInt32LE(SIZE_PERCENT_OFFSET);
      const after = payloadAfter(result, quest).readUInt32LE(SIZE_PERCENT_OFFSET);
      if (quest.parsed.header.questId === 20001) {
        assert.equal(after, before, "training quests stay");
        continue;
      }
      if (quest.parsed.header.questId === 2001) assert.equal(before, 110);
      assert.ok(after >= Math.round(before * 0.7) && after <= Math.round(before * 1.3), `${after}`);
      if (after !== before) changed++;
    }
  }
  assert.ok(changed > 0);
  close();
});

test("quest size is off by default and leaves every quest's size alone", async () => {
  const { game, close } = await load();
  const result = randomize(game, only("q", { "questMonsters.species": true }));
  for (const quest of game.quests) {
    assert.equal(
      payloadAfter(result, quest).readUInt32LE(SIZE_PERCENT_OFFSET),
      quest.file.payload.readUInt32LE(SIZE_PERCENT_OFFSET),
    );
  }
  close();
});

test("the species report says which quests kept their monsters, and which monsters never move", async () => {
  const { game, close } = await load();
  const result = randomize(game, only("n", { "questMonsters.species": true }));
  const notes = result.reports.find((r) => r.title === "Quest monsters")!.notes.join("\n");
  // Fatalis (2) has no variant in any fixture quest's map.
  assert.match(
    notes,
    /Never changed by this pool \(no other choice on any of their maps\): Fatalis\./,
  );
  assert.match(notes, /quests kept their monsters because no other variant is found on their map/);
  close();
});
