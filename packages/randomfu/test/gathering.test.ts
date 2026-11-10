import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { parseQuest } from "mhfu-extract/src/quests/parser.js";
import { readGatheringItems } from "../src/game/gathering.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import { formatSpoiler } from "../src/spoiler.js";
import { buildFixtureDisc, buildQuestPayload, FIXTURE_QUESTS, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

async function load(): Promise<{ game: GameData; close: () => void }> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: {} });
  return { game, close: () => source.close() };
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

/** Every quest's gathering pairs (offset, value, item) as a payload reads, by quest ID. */
function gathering(game: GameData, payloadOf: (index: number) => Buffer) {
  return new Map(
    game.quests.map((q) => [
      q.parsed.header.questId,
      readGatheringItems(payloadOf(q.index), q.parsed).slots,
    ]),
  );
}

/** The fixture's gathered items per tier: what each tier must still hold after shuffling. */
const TIERS: Record<string, { quests: number[]; items: number[] }> = {
  "Low 1★": { quests: [1001, 10102], items: [120, 122, 123, 124, 125, 126] },
  "Low 2★": { quests: [10101], items: [130, 131] },
  "High 6★": { quests: [2001], items: [220, 221, 222] },
};

test("the reader gives each used pair once, with its offset and value", () => {
  const quest = FIXTURE_QUESTS.find((q) => q.questId === 1001)!;
  const payload = buildQuestPayload(quest);
  const { items, slots, problem } = readGatheringItems(payload, parseQuest(payload));
  assert.equal(problem, undefined);
  assert.deepEqual(items, [120, 122, 123]);
  // Table 3 is table 0 again and two nodes use table 0: still one set of pairs.
  assert.deepEqual(
    slots.map((s) => [s.table, s.value, s.itemId]),
    [
      [0, 10, 120],
      [0, 30, 122],
      [2, 20, 123],
    ],
  );
  for (const s of slots) {
    assert.equal(payload.readUInt16LE(s.offset), s.value);
    assert.equal(payload.readUInt16LE(s.offset + 2), s.itemId);
  }

  // A bad item ID or a table past the list gives nothing rather than something wrong.
  const bad = Buffer.from(payload);
  bad.writeUInt16LE(5000, slots[0]!.offset + 2);
  assert.deepEqual(readGatheringItems(bad, parseQuest(bad)), {
    items: [],
    slots: [],
    problem: "item table 0 has item 5000",
  });
  const past = buildQuestPayload({
    ...quest,
    gathering: { tables: [[[10, 120]]], areas: { 0: [600] } },
  });
  assert.match(readGatheringItems(past, parseQuest(past)).problem!, /item table 600, past/);
});

test("gathering: items move within their tier; values, tables and other quests stay", async () => {
  const { game, close } = await load();
  const before = gathering(game, (i) => game.quests.find((q) => q.index === i)!.file.payload);
  let crossed = false;
  for (const seed of ["a", "b", "c", "d", "e", "f"]) {
    const result = randomize(game, settingsWith(seed, ["gathering"]));
    const payloadOf = (i: number) =>
      result.edits.quests.get(i)?.payload ?? game.quests.find((q) => q.index === i)!.file.payload;
    const after = gathering(game, payloadOf);

    for (const [questId, slots] of before) {
      const now = after.get(questId)!;
      assert.deepEqual(
        now.map((s) => [s.table, s.offset, s.value]),
        slots.map((s) => [s.table, s.offset, s.value]),
        `quest ${questId}: same pairs, same values`,
      );
    }
    for (const [tier, { quests, items }] of Object.entries(TIERS)) {
      const now = quests.flatMap((id) => after.get(id)!.map((s) => s.itemId));
      assert.deepEqual(sorted(now), items, `${tier} keeps its items`);
    }
    if (after.get(1001)!.some((s) => [124, 125, 126].includes(s.itemId))) crossed = true;

    // Only gathering pairs change: every other byte of every quest is as it was.
    for (const quest of game.quests) {
      const was = quest.file.payload;
      const now = payloadOf(quest.index);
      const pairs = new Set(before.get(quest.parsed.header.questId)!.map((s) => s.offset + 2));
      for (let i = 0; i < was.length; i++) {
        if (was[i] !== now[i]) {
          assert.ok(pairs.has(i) || pairs.has(i - 1), `quest ${quest.path}: byte ${i}`);
        }
      }
    }
    assert.equal(result.edits.changedEboot(), null);
    assert.equal(result.edits.files.size, 0);
  }
  assert.ok(crossed, "some seed moves an item between the two 1★ quests");
  close();
});

test("gathering: the recipe check uses the shuffled gathering points and still passes", async () => {
  const { game, close } = await load();
  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const result = randomize(game, settingsWith(seed, ["gathering", "recipes"]));
    assert.deepEqual(result.problems, [], `seed ${seed}`);
  }
  // Coarser tiers: rank-wide pools still keep each rank's items in that rank.
  for (const seed of ["a", "b", "c", "d"]) {
    const s = settingsWith(seed, ["gathering", "recipes", "quest-rewards"], {
      "logic.tiers": "rank",
    });
    assert.deepEqual(randomize(game, s).problems, []);
  }
  close();
});

test("gathering: deterministic, own random stream, and in the spoiler", async () => {
  const { game, close } = await load();
  const s = settingsWith("g", ["gathering", "quest-rewards"]);
  const a = randomize(game, s);
  assert.equal(formatSpoiler(game, s, a), formatSpoiler(game, s, randomize(game, s)));
  const lines = (r: typeof a, title: string) => r.reports.find((x) => x.title === title)!.lines;
  assert.deepEqual(
    lines(a, "Quest rewards"),
    lines(randomize(game, settingsWith("g", ["quest-rewards"])), "Quest rewards"),
  );
  assert.deepEqual(
    lines(a, "Gathering points"),
    lines(randomize(game, settingsWith("g", ["gathering"])), "Gathering points"),
  );
  const gatheringLines = lines(a, "Gathering points");
  assert.equal(gatheringLines.length, 11, "every used pair in Village and Guild quests, once");
  assert.ok(!gatheringLines.some((l) => l.where.startsWith("20001")), "Training School");
  assert.match(formatSpoiler(game, s, a), /== Gathering points ==/);
  close();
});

test("gathering pools: same rank keeps every gatherable item and fills the rest from that rank", async () => {
  const { game, close } = await load();
  let fromElsewhere = false;
  // Kept: every gatherable item is still in its tier. (The fixture's tiers have no spare
  // slots once each item is kept; the real disc's spots repeat items, leaving room.)
  // Not kept: every spot draws from its quest's rank.
  for (const keepItems of [true, false]) {
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const s = settingsWith(seed, ["gathering"], {
        "gathering.pool": "rank",
        "gathering.keepItems": keepItems,
      });
      const result = randomize(game, s);
      const payloadOf = (i: number) =>
        result.edits.quests.get(i)?.payload ?? game.quests.find((q) => q.index === i)!.file.payload;
      const after = gathering(game, payloadOf);
      const bands = result.sources.tiers;
      for (const [tier, { quests, items }] of Object.entries(TIERS)) {
        const now = quests.flatMap((id) => after.get(id)!.map((slot) => slot.itemId));
        if (keepItems) {
          for (const item of items) assert.ok(now.includes(item), `${tier} still has item ${item}`);
          continue;
        }
        const band = tier.startsWith("Low") ? "low" : "high";
        for (const item of now) {
          assert.equal(
            bands.get(item)?.band,
            band,
            `${tier}: item ${item} is first found in ${band} rank`,
          );
          if (!items.includes(item)) fromElsewhere = true;
        }
      }
    }
  }
  assert.ok(fromElsewhere, "some spots give items that were never gatherable");
  close();
});

test("gathering pools: with any item and nothing kept, spots can give anything", async () => {
  const { game, close } = await load();
  const gatherable = new Set(Object.values(TIERS).flatMap((t) => t.items));
  let outside = 0;
  for (const seed of ["a", "b", "c"]) {
    const s = settingsWith(seed, ["gathering"], {
      "gathering.pool": "any",
      "gathering.keepItems": false,
    });
    const result = randomize(game, s);
    const after = gathering(
      game,
      (i) =>
        result.edits.quests.get(i)?.payload ?? game.quests.find((q) => q.index === i)!.file.payload,
    );
    const all = [...after.values()].flat().map((slot) => slot.itemId);
    outside += all.filter(
      (v) => !gatherable.has(v) && result.sources.tiers.get(v) === undefined,
    ).length;
    assert.match(
      result.reports.find((r) => r.title === "Gathering points")!.notes.join(" "),
      /may now be found nowhere/,
    );
  }
  assert.ok(outside > 0, "some spots give items found nowhere else in the fixture");

  // With the same-rank pool and items kept, recipes stay craftable.
  for (const seed of ["a", "b", "c", "d"]) {
    const s = settingsWith(seed, ["gathering", "recipes"], { "gathering.pool": "rank" });
    assert.deepEqual(randomize(game, s).problems, [], `seed ${seed}`);
  }
  close();
});
