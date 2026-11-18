import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { isNeverDrawn } from "../src/game/quest-fields.js";
import { tierKey, type Tier } from "../src/game/tiers.js";
import { randomize } from "../src/randomize.js";
import { parseQuest } from "mhfu-extract/src/quests/parser.js";
import { Rng } from "../src/rng.js";
import { collectRewardLists } from "../src/shuffles/monster-rewards.js";
import { collectQuestRewardSlots } from "../src/shuffles/quest-rewards.js";
import { permuteWithinScope, reconcile } from "../src/shuffles/shuffle.js";
import { writeEdits } from "../src/write.js";
import { buildFixtureDisc, finish, patchInMemory, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

async function load(file: string): Promise<{ game: GameData; close: () => void }> {
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso);
  return { game, close: () => source.close() };
}

function fixtureFile(): string {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  return file;
}

/** Each quest's reward lists as `[chance, item, amount][]`, by quest ID. */
function lists(game: GameData, payloadOf?: Parameters<typeof collectQuestRewardSlots>[1]) {
  const out = new Map<number, [number, number, number][][]>();
  const slots = collectQuestRewardSlots(game.quests, payloadOf);
  for (const slot of slots) {
    const id = slot.quest.parsed.header.questId;
    const perQuest = out.get(id) ?? [];
    out.set(id, perQuest);
    const index = [
      ...new Set(slots.filter((s) => s.quest === slot.quest).map((s) => s.list)),
    ].indexOf(slot.list);
    (perQuest[index] ??= []).push([slot.chance, slot.itemId, slot.amount]);
  }
  return out;
}

const total = (list: [number, number, number][]) => list.reduce((sum, [c]) => sum + c, 0);

test("reconcile scales shares to a total, each at least 1", () => {
  assert.deepEqual(reconcile([60, 40], 100), [60, 40]);
  assert.deepEqual(
    reconcile([1, 1, 1], 100).reduce((a, b) => a + b),
    100,
  );
  assert.deepEqual(reconcile([5], 100), [100]);
  const rolled = reconcile([0.3, 40, 99.9, 7], 100);
  assert.equal(
    rolled.reduce((a, b) => a + b),
    100,
  );
  assert.ok(rolled.every((x) => x >= 1));
  assert.throws(() => reconcile([1, 1, 1], 2), RangeError);
});

test("adjacent scope trades Low with High and High with G, never Low with G", () => {
  const tiers: Tier[] = [
    ...Array.from({ length: 6 }, () => ({ band: "low" as const, stars: 1 })),
    ...Array.from({ length: 6 }, () => ({ band: "high" as const, stars: 1 })),
    ...Array.from({ length: 6 }, () => ({ band: "g" as const, stars: 1 })),
  ];
  const slots = tiers.map((tier, i) => ({ tier, i }));
  let crossed = 0;
  for (let seed = 0; seed < 20; seed++) {
    const out = permuteWithinScope(
      slots,
      (s) => s.tier,
      "adjacent",
      () => "",
      (s) => s.i,
      new Rng(`s${seed}`),
    );
    assert.deepEqual(
      [...out].sort((a, b) => a - b),
      slots.map((s) => s.i),
    );
    out.forEach((from, k) => {
      const gap = Math.abs(
        ["low", "high", "g"].indexOf(slots[from]!.tier.band) -
          ["low", "high", "g"].indexOf(slots[k]!.tier.band),
      );
      assert.ok(gap <= 1, `seed ${seed}: slot ${k} got a value from ${from}`);
      if (gap === 1) crossed++;
    });
  }
  assert.ok(crossed > 0, "ranks do trade");
});

test("shuffling reward slots moves chances with them and keeps each list at its total", async () => {
  const { game, close } = await load(fixtureFile());
  const before = lists(game);
  let moved = false;
  for (const scope of ["star", "rank", "adjacent", "any"] as const) {
    const s = settingsWith("fixture", [], {
      "questRewards.mode": "shuffle",
      "questRewards.scope": scope,
    });
    const result = randomize(game, s);
    const after = lists(game, (q) => result.edits.questNow(q));
    for (const [id, quest] of before) {
      quest.forEach((list, i) => {
        const now = after.get(id)![i]!;
        assert.equal(now.length, list.length, `${scope}: quest ${id} keeps its slot count`);
        assert.equal(total(now), total(list), `${scope}: quest ${id} chances still total`);
      });
    }
    // Training School stays as it was.
    assert.deepEqual(after.get(20001), before.get(20001));
    if (JSON.stringify([...after]) !== JSON.stringify([...before])) moved = true;
  }
  assert.ok(moved, "some scope moved something");
  close();
});

test("randomizing rewards rolls slots, items, amounts and chances within the rules", async () => {
  const file = fixtureFile();
  const { game, close } = await load(file);
  const before = lists(game);
  const sizes = new Set<number>();
  for (let n = 0; n < 12; n++) {
    for (const chances of ["rarity", "reasonable", "any"] as const) {
      const s = settingsWith(`seed${n}`, [], {
        "questRewards.mode": "randomize",
        "questRewards.scope": "any",
        "questRewards.slots": 0.95,
        "questRewards.chances": chances,
      });
      const result = randomize(game, s);
      const after = lists(game, (q) => result.edits.questNow(q));
      for (const [id, quest] of before) {
        if (id === 20001) {
          assert.deepEqual(after.get(id), quest, "Training School is left alone");
          continue;
        }
        quest.forEach((list, i) => {
          const now = after.get(id)![i]!;
          assert.equal(total(now), total(list), `${chances}: quest ${id} list ${i} totals 100`);
          assert.ok(now.every(([c, , amount]) => c >= 1 && amount >= 1));
          assert.equal(new Set(now.map(([, item]) => item)).size, now.length, "no repeated items");
          if (i === 0) sizes.add(now.length);
        });
      }
      // The extra lists keep their number of slots; only the main list's count rolls.
      assert.equal(after.get(1001)![1]!.length, 1);
    }
  }
  assert.ok(sizes.size > 1, "the main list's slot count varies");
  close();
});

test("a randomized quest with more slots writes to disc and reads back", async () => {
  const input = fixtureFile();
  const output = path.join(tempDir(), "out.iso");
  const original = readFileSync(input);
  const image = patchInMemory(original);
  const game = await loadGame(image.source, image.iso);
  // Some seeds grow a list (which moves to the end of its quest); take the first that does.
  const moved = (r: ReturnType<typeof randomize>) =>
    !r.reports
      .find((x) => x.title === "Quest rewards")!
      .notes.some((n) => /; 0 moved to the end/.test(n));
  let result!: ReturnType<typeof randomize>;
  for (let n = 0; n < 40 && !(result && moved(result)); n++) {
    result = randomize(
      game,
      settingsWith(`grow${n}`, [], {
        "questRewards.mode": "randomize",
        "questRewards.slots": 0.95,
        "questRewards.scope": "rank",
      }),
    );
  }
  assert.ok(moved(result), "a list outgrew its place and moved");
  assert.deepEqual(result.problems, []);
  writeEdits(image, game, result.edits);
  writeFileSync(output, finish(image, original));

  const after = await load(output);
  const written = lists(after.game);
  const expected = lists(game, (q) => result.edits.questNow(q));
  assert.deepEqual([...written], [...expected]);
  after.close();
});

/** Each monster reward list as `[chance, item][]`, read from a written disc. */
async function monsterLists(file: string): Promise<[number, number][][]> {
  const { game, close } = await load(file);
  const out = collectRewardLists(game.gameSub.ovl).map((l) =>
    l.entries.map((e): [number, number] => [e.chance, e.itemId]),
  );
  close();
  return out;
}

test("monster rewards shuffle and randomize keep every list's length and chance total", async () => {
  const input = fixtureFile();
  const before = await monsterLists(input);
  for (const [mode, extra] of [
    ["shuffle", {}],
    ["randomize", { "monsterRewards.chances": "any" }],
    ["randomize", { "monsterRewards.chances": "reasonable" }],
  ] as const) {
    for (const scope of ["star", "adjacent", "any"] as const) {
      const output = path.join(tempDir(), "out.iso");
      const original = readFileSync(input);
      const image = patchInMemory(original);
      const game = await loadGame(image.source, image.iso);
      const result = randomize(
        game,
        settingsWith("monsters", [], {
          "monsterRewards.mode": mode,
          "monsterRewards.scope": scope,
          ...extra,
        }),
      );
      assert.deepEqual(result.problems, []);
      writeEdits(image, game, result.edits);
      writeFileSync(output, finish(image, original));
      const after = await monsterLists(output);
      assert.equal(after.length, before.length);
      let changed = false;
      before.forEach((list, i) => {
        const now = after[i]!;
        assert.equal(now.length, list.length, `${mode}/${scope}: list ${i} keeps its length`);
        const sum = (l: [number, number][]) => l.reduce((a, [c]) => a + c, 0);
        assert.equal(sum(now), sum(list), `${mode}/${scope}: list ${i} keeps its total`);
        assert.equal(new Set(now.map(([, item]) => item)).size, now.length);
        if (JSON.stringify(now) !== JSON.stringify(list)) changed = true;
      });
      if (mode === "randomize") assert.ok(changed, `${scope}: randomize changed something`);
    }
  }
});

test("keeping reward items: every item stays a reward at its star level, and none is never-drawn", async () => {
  const file = fixtureFile();
  const { game, close } = await load(file);
  const vanilla = collectQuestRewardSlots(game.quests);
  for (const seed of ["a", "b", "c", "d"]) {
    const result = randomize(
      game,
      settingsWith(seed, [], {
        "questRewards.mode": "randomize",
        "questRewards.scope": "any",
        "questRewards.slots": 0,
      }),
    );
    const after = collectQuestRewardSlots(game.quests, (q) => result.edits.questNow(q));
    const byTier = new Map<string, Set<number>>();
    for (const slot of after) {
      const key = tierKey(slot.tier);
      byTier.set(key, (byTier.get(key) ?? new Set()).add(slot.itemId));
      if (!vanilla.some((v) => v.itemId === slot.itemId)) {
        assert.ok(!isNeverDrawn(slot.itemId), `${slot.itemId} is never drawn`);
      }
    }
    for (const slot of vanilla) {
      assert.ok(byTier.get(tierKey(slot.tier))!.has(slot.itemId), `seed ${seed}: ${slot.itemId}`);
    }
  }
  close();
});

test("reward draws move a main table's draw count and keep the low byte", async () => {
  const { game, close } = await load(fixtureFile());
  const draws = (payloadOf: (q: (typeof game.quests)[number]) => Buffer) =>
    game.quests.map((q) =>
      parseQuest(payloadOf(q)).rewards.map((t) => ({ kind: t.unkn1, param: t.unkn2 })),
    );
  const before = draws((q) => q.file.payload);
  const most = Math.max(...before.flat().map((t) => (t.kind === 0x8000 ? t.param >> 8 : 0)), 1);
  const off = randomize(game, settingsWith("fixture", [], { "questRewards.draws": 0 }));
  assert.deepEqual(
    draws((q) => off.edits.questNow(q)),
    before,
    "0 leaves draws alone",
  );
  let moved = false;
  for (let n = 0; n < 8; n++) {
    const result = randomize(game, settingsWith(`seed${n}`, [], { "questRewards.draws": 0.95 }));
    const after = draws((q) => result.edits.questNow(q));
    after.forEach((tables, q) =>
      tables.forEach((t, i) => {
        const was = before[q]![i]!;
        assert.equal(t.kind, was.kind);
        assert.equal(t.param & 0xff, was.param & 0xff, "low byte kept");
        if (t.param === was.param) return;
        moved = true;
        assert.equal(t.kind, 0x8000, "only main tables move");
        assert.ok(t.param >> 8 >= 1 && t.param >> 8 <= Math.max(most, was.param >> 8));
      }),
    );
  }
  assert.ok(moved, "some draw count moved");
  close();
});

test("reward draws survive a disc write alongside randomized rewards", async () => {
  const input = fixtureFile();
  const output = path.join(tempDir(), "draws.iso");
  const original = readFileSync(input);
  const image = patchInMemory(original);
  const game = await loadGame(image.source, image.iso);
  const result = randomize(
    game,
    settingsWith("draws-disc", [], {
      "questRewards.mode": "randomize",
      "questRewards.slots": 0.95,
      "questRewards.draws": 0.95,
    }),
  );
  assert.deepEqual(result.problems, []);
  writeEdits(image, game, result.edits);
  writeFileSync(output, finish(image, original));

  const after = await load(output);
  const params = (g: GameData, payloadOf: (q: GameData["quests"][number]) => Buffer) =>
    g.quests.map((q) => parseQuest(payloadOf(q)).rewards.map((t) => t.unkn2));
  assert.deepEqual(
    params(after.game, (q) => q.file.payload),
    params(game, (q) => result.edits.questNow(q)),
  );
  after.close();
});
