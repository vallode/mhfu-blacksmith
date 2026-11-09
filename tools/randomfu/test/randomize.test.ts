import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "../../mhfu-extract/src/container/image.js";
import { readRewardList } from "../../mhfu-extract/src/monsters/rewards.js";
import { PatchableImage } from "../src/disc/image.js";
import { EBOOT_PATH, loadGame, type GameData } from "../src/game/load.js";
import { randomize, type Settings } from "../src/randomize.js";
import { formatSpoiler } from "../src/spoiler.js";
import { collectRewardLists } from "../src/shuffles/monster-rewards.js";
import { roundTrip, writeEdits } from "../src/write.js";
import { main } from "../src/cli.js";
import {
  buildFixtureDisc,
  EBOOT_SIZE,
  FIXTURE_RECIPES,
  GAME_SUB_INDEX,
  QUEST_INDICES,
  tempDir,
} from "./fixtures.js";

const ALL: Settings = {
  seed: "fixture",
  shuffles: ["quest-rewards", "monster-rewards", "recipes"],
};

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

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

test("the fixture disc loads like a real one", async () => {
  const { game, close } = await load(fixtureFile());
  assert.equal(game.region, "jp");
  assert.equal(game.quests.length, 4);
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
  assert.deepEqual(result, { checked: 6, mismatches: [] });
});

test("randomizing is deterministic and keeps items within their rank", async () => {
  const { game, close } = await load(fixtureFile());
  const a = randomize(game, ALL);
  const b = randomize(game, ALL);
  assert.equal(formatSpoiler(game, ALL, a), formatSpoiler(game, ALL, b));
  assert.deepEqual(a.problems, []);

  const other = randomize(game, { ...ALL, seed: "another" });
  assert.notEqual(formatSpoiler(game, ALL, a), formatSpoiler(game, ALL, other));

  // Each shuffle's slots: Low Rank keeps exactly the Low Rank items.
  const quest = a.reports.find((r) => r.title === "Quest rewards")!;
  assert.equal(quest.lines.length, 6, "training quest left out");
  const monster = a.reports.find((r) => r.title.startsWith("Monster"))!;
  assert.equal(monster.lines.length, 6, "monster 3's list (no quest) left out");
  close();
});

test("written output reads back with the shuffled data, and nothing else changes", async () => {
  const input = fixtureFile();
  const output = path.join(tempDir(), "out.iso");
  writeFileSync(output, readFileSync(input));
  const image = new PatchableImage(output);
  const game = await loadGame(image.source, image.iso, { eboot: {} });
  const result = randomize(game, ALL);
  const summary = writeEdits(image, game, result.edits);
  image.close();
  assert.equal(summary.eboot, "in place");

  const before = await load(input);
  const after = await load(output);

  // Quest rewards: Low Rank items stay in Low Rank quests, training untouched.
  const itemsBefore = questItems(before.game);
  const itemsAfter = questItems(after.game);
  const low = (m: Map<number, number[]>) => sorted([...m.get(1001)!, ...m.get(10101)!]);
  assert.deepEqual(low(itemsAfter), low(itemsBefore));
  assert.deepEqual(sorted(itemsAfter.get(2001)!), sorted(itemsBefore.get(2001)!));
  assert.deepEqual(itemsAfter.get(20001), [999]);

  // Monster lists: same lengths and chances; Low Rank items stay Low Rank.
  const listsBefore = collectRewardLists(before.game.gameSub.ovl);
  const listsAfter = collectRewardLists(after.game.gameSub.ovl);
  assert.deepEqual(
    listsAfter.map((l) => l.entries.map((e) => e.chance)),
    listsBefore.map((l) => l.entries.map((e) => e.chance)),
  );
  const lowLists = (ls: typeof listsBefore) =>
    sorted([0, 1, 4].flatMap((i) => ls[i]!.entries.map((e) => e.itemId)));
  assert.deepEqual(lowLists(listsAfter), lowLists(listsBefore));
  assert.deepEqual(listsAfter[3]!.entries, listsBefore[3]!.entries);
  assert.ok(
    readRewardList(after.game.gameSub.ovl, 0x09c19000 + listsAfter[2]!.offset, false),
    "lists still parse",
  );

  // Recipes: item 300 has no source and stays; the rest are rewards of the same rank.
  const recipeItems = (eboot: Buffer) =>
    FIXTURE_RECIPES.map((r) => {
      const at = 1274568 + r.index * 26;
      return r.materials.map((_, k) => eboot.readUInt16LE(at + 4 + k * 4));
    });
  const recipesAfter = recipeItems(after.game.eboot!);
  assert.equal(recipesAfter[2]![2], 300);
  for (const recipe of recipesAfter)
    assert.equal(new Set(recipe).size, recipe.length, "no repeats");
  assert.deepEqual(sorted(recipesAfter.flat()), sorted(recipeItems(before.game.eboot!).flat()));

  // DATA.BIN: only the edited files' bytes differ.
  const dataBinBytes = (g: GameData, src: string) => {
    const { source, iso } = openDiscImage(src);
    const e = iso.stat("/PSP_GAME/USRDIR/DATA.BIN");
    const buf = source.read(e.lba * 2048, e.size);
    source.close();
    return { buf, bin: g.dataBin };
  };
  const b = dataBinBytes(before.game, input);
  const a = dataBinBytes(after.game, output);
  // (A shuffle can leave a small pool as it was, so edited files may also match.)
  const editable = new Set([...QUEST_INDICES.slice(0, 3), GAME_SUB_INDEX]);
  const changed: number[] = [];
  for (let i = 0; i < b.bin.fileCount; i++) {
    const range = [b.bin.offsetOf(i), b.bin.offsetOf(i) + b.bin.lengthOf(i)] as const;
    if (!b.buf.subarray(...range).equals(a.buf.subarray(...range))) changed.push(i);
  }
  assert.ok(changed.length > 0);
  for (const i of changed) assert.ok(editable.has(i), `DATA.BIN file ${i} changed`);
  assert.equal(summary.quests + summary.files, changed.length);
  assert.equal(a.buf.length, b.buf.length);

  const { iso } = openDiscImage(output);
  assert.equal(iso.readFile(EBOOT_PATH).length, EBOOT_SIZE);
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
      "quest-rewards,monster-rewards",
    ]);
    const spoiler = readFileSync(path.join(dir, "random.spoiler.txt"), "utf-8");
    assert.match(spoiler, /Seed:\s+cli/);
    assert.match(spoiler, /== Quest rewards ==/);
    await assert.rejects(
      main(["randomize", "--iso", input, "--out", output, "--seed", "cli"]),
      /already exists/,
    );
  } finally {
    console.log = log;
  }
});
