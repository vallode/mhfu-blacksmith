import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import {
  ITEM_ENTRY_SIZE,
  WEAPON_BM_ENTRY_SIZE,
  tableOffset,
} from "mhfu-extract/src/tables/offsets.js";
import { equipmentCreateLayout } from "mhfu-extract/src/tables/recipes.js";
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { openPatchableImage } from "../src/disc/node-file.js";
import { EBOOT_PATH, loadGame, type GameData } from "../src/game/load.js";
import { tierLabel } from "../src/game/tiers.js";
import { randomize } from "../src/randomize.js";
import type { Settings } from "../src/settings.js";
import { settingsWith, type ShuffleName } from "./settings-helper.js";
import { formatSpoiler } from "../src/spoiler.js";
import { collectRewardLists } from "../src/shuffles/monster-rewards.js";
import { collectRecipeSlots } from "../src/shuffles/recipes.js";
import { readGatheringItems } from "mhfu-extract/src/quests/gathering.js";
import { roundTrip, writeEdits } from "../src/write.js";
import { main } from "../src/cli.js";
import {
  buildFixtureDisc,
  EBOOT_SIZE,
  FIXTURE_PRICES,
  FIXTURE_QUESTS,
  FIXTURE_RECIPES,
  GAME_SUB_INDEX,
  LOBBY_TASK_INDEX,
  QUEST_INDICES,
  tempDir,
} from "./fixtures.js";

function settings(seed: string, ...shuffles: ShuffleName[]): Settings {
  return settingsWith(seed, shuffles);
}

const ALL = settings("fixture", "quest-rewards", "monster-rewards", "recipes");

function fixtureFile(): string {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  return file;
}

async function load(file: string): Promise<{ game: GameData; close: () => void }> {
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: {} });
  return { game, close: () => source.close() };
}

/** Every reward item ID per quest, by quest ID. */
function questItems(game: GameData): Map<number, number[]> {
  return new Map(
    game.quests.map((q) => [
      q.parsed.header.questId,
      q.parsed.rewards.flatMap((t) => t.items.map((i) => i.itemId)),
    ]),
  );
}

function monsterItems(game: GameData): number[][] {
  return collectRewardLists(game.gameSub.ovl).map((l) => l.entries.map((e) => e.itemId));
}

/** Each fixture recipe's materials as `[item, quantity]`, read from an EBOOT. */
function recipes(eboot: Buffer): [number, number][][] {
  const { offset } = equipmentCreateLayout(new BinaryReader(eboot)).head;
  return FIXTURE_RECIPES.map((r) => {
    const at = offset + r.index * 26 + 4;
    return r.materials.map((_, k) => [
      eboot.readUInt16LE(at + k * 4),
      eboot.readUInt16LE(at + k * 4 + 2),
    ]);
  });
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

test("the fixture disc loads like a real one", async () => {
  const { game, close } = await load(fixtureFile());
  assert.equal(game.region, "jp");
  assert.equal(game.quests.length, 5);
  assert.deepEqual(
    game.quests.map((q) => q.index),
    QUEST_INDICES,
  );
  assert.equal(game.eboot!.length, EBOOT_SIZE);
  assert.deepEqual(monsterItems(game), [[100, 101], [102, 103], [200], [150], [104]]);
  close();
});

test("roundtrip finds every file re-encrypts to the disc's bytes", async () => {
  const file = fixtureFile();
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: null });
  const result = roundTrip(game, (o, l) => source.read(o, l));
  source.close();
  assert.deepEqual(result, { checked: 8, mismatches: [] });
});

test("items get the earliest star level of a reward, monster or used gathering point", async () => {
  const { game, close } = await load(fixtureFile());
  const { sources } = randomize(game, settings("x"));
  const tier = (item: number) => {
    const t = sources.tiers.get(item);
    return t ? tierLabel(t) : null;
  };
  assert.equal(tier(120), "Low Rank 1★", "mined in a 1★ quest");
  assert.equal(tier(121), null, "in an item table no node uses");
  assert.equal(tier(124), "Low Rank 1★", "gathered in the other 1★ quest");
  assert.equal(tier(131), "Low Rank 2★", "gathered at 2★");
  assert.equal(tier(222), "High Rank 6★", "gathered at 6★");
  assert.equal(tier(998), null, "gathered in Training School");
  assert.equal(tier(100), "Low Rank 1★", "carved from a monster in a 1★ quest");
  assert.equal(tier(110), "Low Rank 1★", "1★ quest reward");
  assert.equal(tier(102), "Low Rank 2★", "monster 2 first appears at 2★");
  assert.equal(tier(113), "Low Rank 2★");
  assert.equal(tier(200), "High Rank 6★");
  assert.equal(tier(150), null, "monster 3 is in no quest");
  assert.equal(tier(999), null, "Training School");
  assert.equal(sources.gatheringQuests, 4);
  assert.deepEqual(sources.gatheringProblems, []);
  close();
});

test("randomizing is deterministic and keeps items within their tier", async () => {
  const { game, close } = await load(fixtureFile());
  const a = randomize(game, ALL);
  const b = randomize(game, ALL);
  assert.equal(formatSpoiler(game, ALL, a), formatSpoiler(game, ALL, b));
  assert.deepEqual(a.problems, []);

  const other = randomize(game, { ...ALL, seed: "another" });
  assert.notEqual(formatSpoiler(game, ALL, a), formatSpoiler(game, ALL, other));

  const quest = a.reports.find((r) => r.title === "Quest rewards")!;
  assert.equal(quest.lines.length, 6, "training quest left out");
  const monster = a.reports.find((r) => r.title.startsWith("Monster"))!;
  assert.equal(monster.lines.length, 6, "monster 3's list (no quest) left out");
  const crafting = a.reports.find((r) => r.title.startsWith("Crafting"))!;
  assert.equal(crafting.lines.length, 34, "every slot, including the entry with Hide set");
  assert.ok(crafting.notes.some((n) => n.startsWith("2 of 34 slots keep their material")));

  // Recipe materials only swap within a tier: 1★ slots get 1★ items, and so on.
  const tierOf = (item: number) => a.sources.tiers.get(item);
  const before = recipes(game.eboot!).flat();
  const after = recipes(a.edits.eboot()).flat();
  before.forEach(([item], i) => {
    const [next] = after[i]!;
    assert.deepEqual(tierOf(next), tierOf(item), `slot ${i}: ${item} -> ${next}`);
  });
  for (const recipe of recipes(a.edits.eboot())) {
    const items = recipe.map(([item]) => item);
    assert.equal(new Set(items).size, items.length, "no repeats");
  }
  close();
});

test("recipe amounts follow each material's usual quantity and stay in range", async () => {
  const { game, close } = await load(fixtureFile());
  const vanilla = recipes(game.eboot!);

  const unchanged = randomize(
    game,
    settingsWith("a", ["recipe-amounts"], { "recipes.amountSpread": 0 }),
  );
  assert.equal(
    unchanged.edits.changedEboot(),
    null,
    "spread 0 without material swaps changes nothing",
  );

  const amounts = randomize(game, settings("a", "recipe-amounts"));
  const after = recipes(amounts.edits.eboot());
  vanilla.forEach((recipe, r) =>
    recipe.forEach(([item, quantity], k) => {
      const [nextItem, nextQuantity] = after[r]![k]!;
      assert.equal(nextItem, item, "amounts alone keep the materials");
      assert.ok(
        nextQuantity >= Math.max(1, Math.round(quantity * 0.5)) - 0,
        `${quantity} -> ${nextQuantity}`,
      );
      assert.ok(nextQuantity <= Math.round(quantity * 1.5), `${quantity} -> ${nextQuantity}`);
    }),
  );

  // With materials swapped and no spread, a slot scales to its new item's usual amount:
  // a slot asking for 4 of an item usually wanted x4 that now takes one usually wanted x2 asks for 2.
  const both = randomize(
    game,
    settingsWith("b", ["recipes", "recipe-amounts"], { "recipes.amountSpread": 0 }),
  );
  // Each item's median quantity over every recipe slot on the disc.
  const quantities = new Map<number, number[]>();
  for (const slot of collectRecipeSlots(game.eboot!, undefined)) {
    quantities.set(slot.itemId, [...(quantities.get(slot.itemId) ?? []), slot.quantity]);
  }
  const typical = new Map(
    [...quantities].map(([item, qs]) => [item, sorted(qs)[Math.floor(qs.length / 2)]!]),
  );
  const swapped = recipes(both.edits.eboot());
  vanilla.forEach((recipe, r) =>
    recipe.forEach(([item, quantity], k) => {
      const [nextItem, nextQuantity] = swapped[r]![k]!;
      const expected = Math.max(
        1,
        Math.round((quantity * typical.get(nextItem)!) / typical.get(item)!),
      );
      assert.equal(nextQuantity, expected, `${item} x${quantity} -> ${nextItem} x${nextQuantity}`);
    }),
  );
  close();
});

test("costs vary within the spread in steps of 10z", async () => {
  const { game, close } = await load(fixtureFile());
  const result = randomize(game, settings("c", "costs"));
  const eboot = result.edits.eboot();
  const report = result.reports.find((r) => r.title === "Crafting costs")!;
  assert.equal(report.lines.length, 4);

  const bm = tableOffset("weaponsBlademaster");
  const deco = tableOffset("decorationValues");
  const prices = [
    ...FIXTURE_PRICES.blademaster.map(([i, p]) => [
      p,
      eboot.readUInt32LE(bm + i * WEAPON_BM_ENTRY_SIZE + 4),
    ]),
    ...FIXTURE_PRICES.decoration.map(([i, p]) => [
      p,
      eboot.readUInt32LE(deco + i * ITEM_ENTRY_SIZE + 12),
    ]),
  ];
  let changed = 0;
  for (const [before, after] of prices) {
    assert.equal(after! % 20, 0, "cost is a multiple of 10z");
    assert.ok(
      after! >= before! * 0.5 - 10 && after! <= before! * 1.5 + 10,
      `${before} -> ${after}`,
    );
    if (after !== before) changed++;
  }
  assert.ok(changed > 0);
  assert.match(
    formatSpoiler(game, settings("c", "costs"), result),
    /Crafting cost variation: ±50%/,
  );
  close();
});

test("written output reads back with the shuffled data, and nothing else changes", async () => {
  const input = fixtureFile();
  const output = path.join(tempDir(), "out.iso");
  writeFileSync(output, readFileSync(input));
  const image = openPatchableImage(output);
  const game = await loadGame(image.source, image.iso, { eboot: {} });
  const all = settings(
    "fixture",
    "quest-rewards",
    "monster-rewards",
    "recipes",
    "recipe-amounts",
    "costs",
    "gathering",
    "armor",
  );
  const result = randomize(game, all);
  const summary = writeEdits(image, game, result.edits);
  image.close();
  assert.equal(summary.eboot, "in place");

  const before = await load(input);
  const after = await load(output);

  // Quest rewards: each tier keeps its items, training untouched.
  const itemsBefore = questItems(before.game);
  const itemsAfter = questItems(after.game);
  for (const id of [1001, 10101, 2001]) {
    assert.deepEqual(sorted(itemsAfter.get(id)!), sorted(itemsBefore.get(id)!), `quest ${id}`);
  }
  assert.deepEqual(itemsAfter.get(20001), [999]);

  // Gathering points: re-read from the written disc, each tier keeps its items.
  const gathered = (g: GameData, ids: number[]) =>
    sorted(
      g.quests
        .filter((q) => ids.includes(q.parsed.header.questId))
        .flatMap((q) => readGatheringItems(q.file.payload, q.parsed).slots.map((s) => s.itemId)),
    );
  for (const ids of [[1001, 10102], [10101], [2001], [20001]]) {
    assert.deepEqual(gathered(after.game, ids), gathered(before.game, ids), `gathering ${ids}`);
  }
  assert.ok(
    result.reports.some((r) => r.title === "Armor progression" && r.lines.length > 0),
    "armor moved on the written EBOOT",
  );

  // Monster lists: same lengths and chances; each tier keeps its items.
  const listsBefore = collectRewardLists(before.game.gameSub.ovl);
  const listsAfter = collectRewardLists(after.game.gameSub.ovl);
  assert.deepEqual(
    listsAfter.map((l) => l.entries.map((e) => e.chance)),
    listsBefore.map((l) => l.entries.map((e) => e.chance)),
  );
  const items = (ls: typeof listsBefore, which: number[]) =>
    sorted(which.flatMap((i) => ls[i]!.entries.map((e) => e.itemId)));
  assert.deepEqual(items(listsAfter, [0, 4]), items(listsBefore, [0, 4]), "Low Rank 1★");
  assert.deepEqual(items(listsAfter, [1]), items(listsBefore, [1]), "Low Rank 2★");
  assert.deepEqual(listsAfter[3]!.entries, listsBefore[3]!.entries);

  // The EBOOT on disc is the edited one.
  const { iso, source } = openDiscImage(output);
  assert.ok(iso.readFile(EBOOT_PATH).equals(result.edits.eboot()));
  source.close();

  // DATA.BIN: only edited files' bytes differ.
  const dataBinBytes = (src: string) => {
    const { source, iso } = openDiscImage(src);
    const e = iso.stat("/PSP_GAME/USRDIR/DATA.BIN");
    const buf = source.read(e.lba * 2048, e.size);
    source.close();
    return buf;
  };
  const b = dataBinBytes(input);
  const a = dataBinBytes(output);
  const bin = before.game.dataBin;
  // (A shuffle can leave a small pool as it was, so edited files may also match.)
  const training = QUEST_INDICES[FIXTURE_QUESTS.findIndex((q) => q.questId === 20001)];
  const editable = new Set([
    ...QUEST_INDICES.filter((i) => i !== training),
    GAME_SUB_INDEX,
    LOBBY_TASK_INDEX,
  ]);
  const changed: number[] = [];
  for (let i = 0; i < bin.fileCount; i++) {
    const range = [bin.offsetOf(i), bin.offsetOf(i) + bin.lengthOf(i)] as const;
    if (!b.subarray(...range).equals(a.subarray(...range))) changed.push(i);
  }
  assert.ok(changed.length > 0);
  for (const i of changed) assert.ok(editable.has(i), `DATA.BIN file ${i} changed`);
  assert.equal(summary.quests + summary.files, changed.length);
  assert.equal(a.length, b.length);
  before.close();
  after.close();
});

test("the CLI writes an ISO and a spoiler log, and refuses to overwrite", async () => {
  const input = fixtureFile();
  const dir = tempDir();
  const output = path.join(dir, "random.iso");
  const log = console.log;
  console.log = () => {};
  try {
    await main([
      "randomize",
      "--iso",
      input,
      "--out",
      output,
      "--seed",
      "cli",
      "--shuffles",
      "quest-rewards,monster-rewards,recipes,recipe-amounts,costs,gathering,armor",
      "--cost-spread",
      "0.25",
    ]);
    const spoiler = readFileSync(path.join(dir, "random.spoiler.txt"), "utf-8");
    assert.match(spoiler, /Seed:\s+cli/);
    assert.match(spoiler, /Crafting cost variation: ±25%/);
    assert.match(spoiler, /== Quest rewards ==/);
    assert.match(spoiler, /== Gathering points ==/);
    assert.match(spoiler, /== Armor progression ==/);
    assert.match(spoiler, /== Where items are first found ==/);
    assert.match(spoiler, /Low Rank 1★ \(\d+\)/);
    await assert.rejects(
      main(["randomize", "--iso", input, "--out", output, "--seed", "cli"]),
      /already exists/,
    );
    await assert.rejects(
      main(["randomize", "--iso", input, "--out", output, "--cost-spread", "2", "--force"]),
      /costs\.spread must be a number from 0 to 0\.95/,
    );
  } finally {
    console.log = log;
  }
});
