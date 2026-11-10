import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "../../mhfu-extract/src/container/image.js";
import { parseQuest } from "../../mhfu-extract/src/quests/parser.js";
import { loadGame, type GameData, type LoadedQuest } from "../src/game/load.js";
import { readQuestText, writeQuestText } from "../src/game/quest-text.js";
import { readSpawns } from "../src/game/spawns.js";
import { randomize } from "../src/randomize.js";
import type { OptionKey, Settings } from "../src/settings.js";
import { learnNames, learnSlotNames, renameIn, splitNames } from "../src/shuffles/quest-text.js";
import { formatSpoiler } from "../src/spoiler.js";
import { buildFixtureDisc, buildQuestPayload, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

type Changes = Partial<Record<OptionKey, boolean | number | string>>;
const only = (seed: string, changes: Changes): Settings => settingsWith(seed, [], changes);

const FILE = path.join(tempDir(), "disc.iso");
writeFileSync(FILE, buildFixtureDisc());

async function load(): Promise<{ game: GameData; close: () => void }> {
  const { source, iso } = openDiscImage(FILE);
  const game = await loadGame(source, iso, { eboot: null });
  return { game, close: () => source.close() };
}

const byId = (game: GameData, id: number): LoadedQuest =>
  game.quests.find((q) => q.parsed.header.questId === id)!;

/** Goal text by slot, read back from a payload. */
function goals(payload: Buffer): (string | null)[] {
  const header = parseQuest(payload).header;
  const text = readQuestText(payload, header);
  return [0, 1, 2, 3, 4, 5, 6].map((slot) => {
    const block = text.blocks.find((b) => b.slots.includes(slot));
    return block ? block.texts[1]! : null;
  });
}

test("monster names and their articles are learned per language from the quests' text", async () => {
  const { game, close } = await load();
  const { slots } = learnNames(game.quests);
  const english = slots[1]!;
  assert.deepEqual(
    [...english.names].sort((a, b) => a[0] - b[0]),
    [
      [1, "Rathian"],
      [2, "Fatalis"],
      [37, "Pink Rathian"],
    ],
  );
  assert.deepEqual([...english.articles.values()], ["the", "the", "the"]);
  const german = slots[2]!;
  assert.equal(german.names.get(37), "Rosa Rathian");
  assert.equal(german.articles.get(1), "die");
  assert.equal(german.articles.get(37), "den");
  assert.equal(slots[3]!.names.size, 0, "an empty slot learns nothing");
  assert.equal(english.widths[1], 23, "the goal's longest line");
  close();
});

test("a name is learned even when goals write it in another case", () => {
  const sample = (species: number[], goal: string, monsters: string) => ({
    species: new Set(species),
    texts: ["", goal, "", "", monsters, ""],
  });
  const slot = learnSlotNames([
    sample([80], "Chassez la reine Vespoid", "Reine Vespoid\nVespoid"),
    sample([80], "Capturez la reine Vespoid", "Reine Vespoid\nVespoid"),
    sample([], "Tuez 10 Vespoid", "Vespoid"),
    sample([1], "Chassez la Rathian", "Rathian\nVespoid"),
  ]);
  assert.equal(slot.names.get(80), "Reine Vespoid");
  assert.equal(slot.articles.get(80), "la");
});

test("renaming reads the longest name first and checks articles and line width", () => {
  const slot = {
    names: new Map([
      [1, "Rathian"],
      [37, "Pink Rathian"],
      [2, "Fatalis"],
    ]),
    articles: new Map<number, string | null>([
      [1, "the"],
      [37, "the"],
      [2, "le"],
    ]),
    widths: [],
  };
  const swap = new Map([
    [1, 37],
    [37, 1],
  ]);
  assert.deepEqual(renameIn("Hunt the Rathian and\nthe Pink Rathian", slot, swap, 30), {
    text: "Hunt the Pink Rathian and\nthe Rathian",
  });
  assert.deepEqual(renameIn("Hunt 2 Rathians", slot, swap, 30), { text: "Hunt 2 Pink Rathians" });
  assert.deepEqual(renameIn("Hunt the Rathian", slot, swap, 16), { problem: "too wide" });
  assert.ok("problem" in renameIn("Hunt the Rathian", slot, new Map([[1, 2]]), 30));
  assert.deepEqual(renameIn("Ratatouille", slot, swap, 30), { text: "Ratatouille" });
  // "pink Rathian" reads as Rathian, but it names Pink Rathian: leave it whole.
  assert.deepEqual(renameIn("Hunt the pink Rathian", slot, new Map([[37, 1]]), 30), {
    problem: "names Pink Rathian in another form",
  });
  assert.deepEqual(splitNames("Rathian\nPink Rathian, Velociprey、Conga"), [
    "Rathian",
    "Pink Rathian",
    "Velociprey",
    "Conga",
  ]);
});

test("text is written in place when it fits, and repacked into shared strings when it doesn't", () => {
  const payload = buildQuestPayload({
    questId: 1,
    rank: 1,
    stars: 1,
    monsters: [1],
    rewards: [],
    text: [
      ["T", "Hunt the Rathian", "F", "D", "Rathian", "C"],
      ["T", "Hunt the Rathian", "F", "D", "Rathian", "C"],
      null,
      null,
      null,
      null,
      1,
    ],
  });
  const header = parseQuest(payload).header;
  const text = readQuestText(payload, header);
  assert.equal(text.unmovable, null);
  assert.equal(text.runs.length, 1);
  const goal0 = text.blocks[0]!.pointers[1]!;
  const goal1 = text.blocks[1]!.pointers[1]!;

  const inPlace = Buffer.from(payload);
  assert.ok(writeQuestText(inPlace, text, new Map([[goal1, "Hunt Kelbi"]])));
  assert.deepEqual(goals(inPlace).slice(0, 2), ["Hunt the Rathian", "Hunt Kelbi"]);
  assert.equal(inPlace.length, payload.length);

  const grown = Buffer.from(payload);
  const longer = "Hunt the Pink Rathian";
  assert.ok(
    writeQuestText(
      grown,
      text,
      new Map([
        [goal0, longer],
        [goal1, longer],
      ]),
    ),
  );
  assert.deepEqual(goals(grown), [longer, longer, null, null, null, null, longer]);
  const after = readQuestText(grown, header);
  assert.equal(after.blocks[0]!.pointers[1], after.blocks[1]!.pointers[1], "shared once");
  assert.equal(after.blocks[1]!.texts[4], "Rathian", "other strings keep their text");

  const tooLong = Buffer.from(payload);
  assert.equal(writeQuestText(tooLong, text, new Map([[goal1, "x".repeat(200)]])), false);
  assert.ok(tooLong.equals(payload), "nothing changes when it doesn't fit");
});

test("swaps rename the monster in quest text where it's safe, and list the rest", async () => {
  const { game, close } = await load();
  let renamed = 0;
  for (let seed = 0; seed < 30; seed++) {
    const settings = only(`t${seed}`, { "questMonsters.species": true });
    const result = randomize(game, settings);
    const spoiler = formatSpoiler(game, settings, result);
    for (const id of [1001, 2001]) {
      const quest = byId(game, id);
      const after = result.edits.quests.get(quest.index)?.payload ?? quest.file.payload;
      assert.equal(after.length, quest.file.payload.length);
      const species = readSpawns(after, quest.parsed.header).large[0]!.monsterId;
      const g = goals(after);
      // German keeps its text: Rosa Rathian takes "den", Rathian "die".
      assert.equal(g[2], "Jage die Rathian");
      if (species === 1) {
        assert.equal(g[1], "Hunt the Rathian");
        continue;
      }
      if (id === 1001) {
        assert.deepEqual([g[0], g[1], g[6]], Array(3).fill("Hunt the Pink Rathian"));
        const parsed = parseQuest(after);
        assert.equal(parsed.strings?.monsters, "Pink Rathian\nVelociprey");
        assert.equal(parsed.strings?.details, "The Pink Rathian has\nbeen seen nearby.");
        assert.equal(parsed.strings?.title, "The Queen of the Land");
        renamed++;
      } else {
        // 2001's only room is its monster list, shared by English and German
        // while they match: the goal goes first and takes it.
        assert.equal(g[1], "Hunt the Pink Rathian");
        assert.equal(parseQuest(after).strings?.monsters, "Rathian\nVelociprey");
        assert.match(spoiler, /Text kept \(Japanese\/English\/Korean\): monsters: no room/);
      }
      assert.match(spoiler, /Text kept \(German\): goal: Pink Rathian takes another article/);
    }
  }
  assert.ok(renamed > 0);
  close();
});

test("with renaming off, swaps leave the text alone", async () => {
  const { game, close } = await load();
  for (let seed = 0; seed < 10; seed++) {
    const result = randomize(
      game,
      only(`t${seed}`, { "questMonsters.species": true, "questMonsters.text": false }),
    );
    const quest = byId(game, 1001);
    const after = result.edits.quests.get(quest.index)?.payload ?? quest.file.payload;
    assert.equal(goals(after)[1], "Hunt the Rathian");
  }
  close();
});
