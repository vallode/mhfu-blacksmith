import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { parseQuest } from "mhfu-extract/src/quests/parser.js";
import { loadGame, type GameData, type LoadedQuest } from "../src/game/load.js";
import { readQuestText, slotSize, writeQuestText } from "../src/game/quest-text.js";
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
  assert.deepEqual(
    [...english.before.values()].map((w) => [...w]),
    [["the"], ["the"], ["the"]],
  );
  const german = slots[2]!;
  assert.equal(german.names.get(37), "Rosa Rathian");
  assert.deepEqual([...german.before.get(1)!], ["die"]);
  assert.deepEqual([...german.before.get(37)!], ["den"]);
  assert.deepEqual([...german.articleWords].sort(), ["den", "die"]);
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
  assert.deepEqual([...slot.before.get(80)!], ["la"]);
});

test("a monster whose goals put different words before it can still be renamed", () => {
  // Like Velocidrome on the EU disc: "the" in one goal, "down" in another.
  const sample = (species: number[], goal: string, monsters: string) => ({
    species: new Set(species),
    texts: ["", goal, "", "", monsters, ""],
  });
  const slot = learnSlotNames([
    sample([27], "Hunt the Velocidrome", "Velocidrome\nVelociprey"),
    sample([27], "Track down Velocidrome", "Velocidrome\nVelociprey"),
    sample([28], "Hunt the Gendrome", "Gendrome\nGenprey"),
    sample([], "Slay 10 Velociprey", "Velociprey"),
  ]);
  assert.equal(slot.names.get(27), "Velocidrome");
  const swap = new Map([[27, 28]]);
  assert.deepEqual(renameIn("Hunt the Velocidrome", slot, swap, 30), {
    text: "Hunt the Gendrome",
  });
  assert.deepEqual(renameIn("Velocidrome\nVelociprey", slot, swap, 30), {
    text: "Gendrome\nVelociprey",
  });
  assert.deepEqual(renameIn("Track down Velocidrome", slot, swap, 30), {
    problem: "Gendrome takes another article",
  });
});

test("renaming reads the longest name first and checks articles and line width", () => {
  const slot = {
    names: new Map([
      [1, "Rathian"],
      [37, "Pink Rathian"],
      [2, "Fatalis"],
    ]),
    before: new Map([
      [1, new Set(["the"])],
      [37, new Set(["the"])],
      [2, new Set(["le"])],
    ]),
    articleWords: new Set(["the", "le"]),
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
  assert.deepEqual(renameIn("Rathian", slot, new Map([[1, 2]]), 30), { text: "Fatalis" });
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
        // German's monster list names the monster bare, with no article to agree with.
        const german = readQuestText(after, parsed.header).blocks.find((b) => b.slots.includes(2))!;
        assert.equal(german.texts[4], "Rosa Rathian\nVelociprey");
        renamed++;
      } else {
        // 2001's only room is its monster list, shared by English and German
        // while they match: the goal goes first and takes it.
        assert.equal(g[1], "Hunt the Pink Rathian");
        assert.equal(parseQuest(after).strings?.monsters, "Rathian\nVelociprey");
        assert.match(spoiler, /Text kept \(Japanese\/English\/Korean, German\): monsters: no room/);
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

/**
 * Text laid out like the EU disc: each language's strings start on 4-byte
 * boundaries with `slotSize` padding, then that language's pointer block.
 */
function alignedPayload(languages: string[][]): Buffer {
  const base = buildQuestPayload({ questId: 1, rank: 1, stars: 1, monsters: [1], rewards: [] });
  const parts: Buffer[] = [];
  let at = Math.ceil(base.length / 4) * 4;
  const start = at;
  const blocks: number[] = [];
  for (const strings of languages) {
    const pointers = strings.map((str) => {
      const bytes = Buffer.alloc(slotSize(Buffer.byteLength(str), 4));
      bytes.write(str, "utf8");
      parts.push(bytes);
      at += bytes.length;
      return at - bytes.length;
    });
    const block = Buffer.alloc(24);
    pointers.forEach((p, i) => block.writeUInt32LE(p, i * 4));
    parts.push(block);
    blocks.push(at);
    at += 24;
  }
  const table = Buffer.alloc(28);
  [0, 0, 1].forEach((b, slot) => table.writeUInt32LE(blocks[b]!, slot * 4));
  parts.push(table);
  const payload = Buffer.concat([base, Buffer.alloc(start - base.length), ...parts]);
  payload.writeUInt32LE(at, 96);
  return payload;
}

test("aligned text keeps its alignment and padding, and uses padding and other languages' room", () => {
  const en = ["Title", "Hunt the Rathian", "Fail", "Details", "Rathian", "Client"];
  const de = ["Titel", "Jage die Rathian", "Fehl", "Details", "Rathian", "Kunde"];
  const payload = alignedPayload([en, de]);
  const header = parseQuest(payload).header;
  const text = readQuestText(payload, header);
  assert.equal(text.align, 4);
  assert.equal(text.unmovable, null);
  assert.equal(text.runs.length, 2, "one run per language, its block between them");

  // "Hunt the Rathian" (16 bytes) has a 20-byte slot, and "Hunt the Rathians!" (18)
  // still fits it: the padding is room, though the string grew.
  const goal = text.blocks[0]!.pointers[1]!;
  const grown = Buffer.from(payload);
  assert.ok(writeQuestText(grown, text, new Map([[goal, "Hunt the Rathians!"]])));
  // "Hunt the Gold Rathian" needs a 24-byte slot: English has no room for it,
  // but German's "Details" and "Rathian" match English's, and sharing them
  // frees room in German's area that the English goal can use.
  const across = Buffer.from(payload);
  assert.ok(writeQuestText(across, text, new Map([[goal, "Hunt the Gold Rathian"]])));
  const moved = readQuestText(across, header);
  assert.equal(moved.blocks[0]!.texts[1], "Hunt the Gold Rathian");
  assert.deepEqual(
    moved.blocks.map((b) => b.texts),
    [["Title", "Hunt the Gold Rathian", "Fail", "Details", "Rathian", "Client"], de],
  );
  assert.equal(moved.blocks[0]!.pointers[3], moved.blocks[1]!.pointers[3], "Details shared");
  assert.ok(moved.blocks.flatMap((b) => b.pointers).every((p) => p % 4 === 0));
  assert.equal(
    writeQuestText(Buffer.from(payload), text, new Map([[goal, "x".repeat(200)]])),
    false,
    "more than both areas hold",
  );
  const after = readQuestText(grown, header);
  assert.equal(after.blocks[0]!.texts[1], "Hunt the Rathians!");
  assert.equal(after.blocks[0]!.texts[3], "Details");
  const pointers = after.blocks.flatMap((b) => b.pointers);
  assert.ok(
    pointers.every((p) => p % 4 === 0),
    "every string still starts on 4 bytes",
  );
  for (const block of after.blocks) {
    block.pointers.forEach((p, i) => {
      const length = Buffer.byteLength(block.texts[i]!);
      assert.ok(grown.subarray(p + length, p + slotSize(length, 4)).every((b) => b === 0));
    });
  }
});
