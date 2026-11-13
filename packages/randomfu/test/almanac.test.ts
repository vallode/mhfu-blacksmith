import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { Edits } from "../src/edits.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { tierOrder, type Tier } from "../src/game/tiers.js";
import {
  almanacIntro,
  almanacStrings,
  collectItemSources,
  earliest,
  itemLine,
  shownSources,
  sourceLabels,
  trimSources,
  type AlmanacItem,
  type ItemSource,
} from "../src/hints/almanac.js";
import { checkPage, textBytes, width } from "../src/hints/bookshelf.js";
import { largeAppearances, mapLabel, recipeMaterials, tierShort } from "../src/hints/sources.js";
import { randomize } from "../src/randomize.js";
import { collectQuestRewardSlots } from "../src/shuffles/quest-rewards.js";
import { buildFixtureDisc, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

/** Text without its colour codes. */
const plain = (text: string) => text.replace(/~C\d\d/g, "");

const low = (stars: number): Tier => ({ band: "low", stars });
const high = (stars: number): Tier => ({ band: "high", stars });
const map = (place: string, tier: Tier): ItemSource => ({ type: "map", place, tier });
const shop = (place: string): ItemSource => ({ type: "shop", place, tier: null });
const carve = (place: string, how: string, tier: Tier): ItemSource => ({
  type: "monster",
  place,
  how,
  tier,
});
const reward = (tier: Tier): ItemSource => ({ type: "reward", place: "Reward", tier });
const item = (name: string, sources: ItemSource[], itemId = 1): AlmanacItem => ({
  itemId,
  name,
  sources: earliest(sources),
});

async function withFixture(run: (game: GameData) => void, eboot = false): Promise<void> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  try {
    run(await loadGame(source, iso, { eboot: eboot ? {} : null }));
  } finally {
    source.close();
  }
}

test("tiers read as the game shows them, G Rank from 1", () => {
  assert.equal(tierShort(low(3)), "LR★3");
  assert.equal(tierShort(high(7)), "HR★7");
  assert.equal(tierShort({ band: "g", stars: 9 }), "G★1");
  assert.equal(tierShort({ band: "g", stars: 11 }), "G★3");
  assert.equal(mapLabel(2), "Forest");
  assert.equal(mapLabel(21), "Snowy Mtns");
  assert.equal(mapLabel(3), "Desert");
});

test("each source once at its earliest tier, shops first, then by tier", () => {
  const sources = earliest([
    reward(low(3)),
    map("Jungle", low(2)),
    map("Desert", low(1)),
    map("Desert", low(4)),
    shop("Peddler"),
    carve("Rathalos", "break", high(6)),
    carve("Rathalos", "break", low(2)),
    carve("Rathalos", "carve", low(2)),
  ]);
  assert.deepEqual(
    sources.map((s) => [s.type, s.place, s.how, s.tier && tierShort(s.tier)]),
    [
      ["shop", "Peddler", undefined, null],
      ["map", "Desert", undefined, "LR★1"],
      ["map", "Jungle", undefined, "LR★2"],
      ["monster", "Rathalos", "carve", "LR★2"],
      ["monster", "Rathalos", "break", "LR★2"],
      ["reward", "Reward", undefined, "LR★3"],
    ],
  );
});

test("labels group a tier's maps and a monster's ways, capped with a +", () => {
  const sources = earliest([
    shop("Guild shop"),
    shop("Peddler"),
    map("Desert", low(1)),
    map("Jungle", low(1)),
    map("Forest", low(1)),
    map("Swamp", low(1)),
    carve("Rathalos", "carve", low(2)),
    carve("Rathalos", "break", low(2)),
    carve("Rathalos", "tail", low(2)),
    carve("Rathian", "carve", low(2)),
    reward(low(2)),
    reward(low(5)), // rewards are one source: the earliest
  ]);
  assert.deepEqual(sourceLabels(sources), [
    "Guild shop",
    "Peddler",
    "Desert/Forest+ LR★1",
    "Rathalos carve/tail+ LR★2",
    "Rathian carve LR★2",
    "Reward LR★2",
  ]);
});

test("an item's line fits, and a first label too wide is cut short", () => {
  const potion = item("Potion", [shop("Guild shop"), shop("Peddler"), shop("Village shop")]);
  assert.equal(plain(itemLine(potion)), "Potion: Guild shop, Peddler, Village shop");
  assert.equal(plain(itemLine(potion, 1)), "Potion: Guild shop");
  assert.equal(shownSources(potion), 3);
  assert.equal(plain(itemLine(item("Nothing", []))), "Nothing: -");

  const long = item("A Very Long Item Name Indeed", [
    carve("Shogun Ceanataur", "capture", high(7)),
    carve("Shogun Ceanataur", "break", high(7)),
  ]);
  const line = plain(itemLine(long));
  assert.ok(width(line) <= 46, line);
  assert.match(line, /^A Very Long Item Name\.: Shogun Ceanataur/);
});

test("trimming drops the latest labels from the longest lines first", () => {
  const items = [
    item("Ore", [map("Swamp", low(1)), reward(low(2)), shop("Peddler")], 1),
    item("Honey", [map("Jungle", low(1)), reward(low(1))], 2),
    item("Potion", [shop("Peddler")], 3),
  ];
  assert.deepEqual(
    [...trimSources(items, 0)],
    [
      [1, 3],
      [2, 2],
      [3, 1],
    ],
  );
  const caps = trimSources(items, 1);
  assert.deepEqual(
    [...caps],
    [
      [1, 2],
      [2, 2],
      [3, 1],
    ],
  );
  assert.equal(plain(itemLine(items[0]!, caps.get(1))), "Ore: Peddler, Swamp LR★1");
  // Never below one label a line.
  assert.deepEqual([...trimSources(items, 10_000).values()], [1, 1, 1]);
});

test("almanac strings: the intro, eight items a page, titles by letter", () => {
  const names = "ABCDEFGHIJKLMNOPQRST".split("").map((c) => `${c} item`);
  const items = names.map((n, i) => item(n, [map("Desert", low(1))], i + 1));
  const articles = [
    { title: 10, pages: 3 },
    { title: 20, pages: 3 },
  ];
  const { texts, titles, listed, left } = almanacStrings("SEED", items, articles);
  assert.equal(texts.length, 2 + 3 + 3);
  assert.deepEqual(titles, ["RandomFU Almanac A-J", "RandomFU Almanac K-T"]);
  assert.equal(texts[1], almanacIntro("SEED"));
  assert.match(plain(texts[1]!), /◆ RandomFU Almanac ◆/);
  assert.deepEqual(
    plain(texts[2]!)
      .split("\n")
      .map((l) => l[0]),
    ["A", "B", "C", "D", "E", "F", "G", "H"],
  );
  assert.deepEqual(plain(texts[3]!).split("\n"), ["I item: Desert LR★1", "J item: Desert LR★1"]);
  assert.equal(texts[5]!.split("\n").length, 8);
  assert.equal(texts[7], " ", "a spare page is blank");
  texts.forEach(checkPage);
  assert.deepEqual(
    listed.map((l) => l.length),
    [10, 10],
  );
  assert.deepEqual(left, []);

  const tight = almanacStrings("SEED", items, [{ title: 10, pages: 2 }]);
  assert.equal(tight.left.length, 12);

  const caps = new Map(items.map((i) => [i.itemId, 0]));
  assert.ok(
    textBytes(almanacStrings("SEED", items, articles, caps).texts) < textBytes(texts),
    "caps shorten the lines",
  );
});

test("item sources are read from the files as edited", async () => {
  await withFixture((game) => {
    const quests = game.quests.map((q) => q.parsed);
    const edits = new Edits(game);
    const before = collectItemSources(game, quests, edits);
    assert.deepEqual(
      new Set(before.flatMap((i) => i.sources.map((s) => s.type))),
      new Set(["shop", "map", "monster", "reward"]),
    );
    for (const i of before) {
      const order = i.sources.map((s) => (s.tier ? tierOrder(s.tier) : -1));
      assert.deepEqual(
        order,
        [...order].sort((a, b) => a - b),
        i.name,
      );
    }
    assert.deepEqual(
      before.map((i) => i.name),
      [...before.map((i) => i.name)].sort((a, b) => a.localeCompare(b)),
    );

    // Put a Mega Potion (item 8) in a quest's rewards: the Almanac sees it there.
    const slot = collectQuestRewardSlots(game.quests)[0]!;
    edits.quest(slot.quest).writeUInt16LE(8, slot.offset + 2);
    const after = collectItemSources(game, quests, edits);
    const mega = after.find((i) => i.itemId === 8);
    assert.ok(mega);
    assert.ok(
      mega.sources.some((s) => s.type === "reward" && tierOrder(s.tier!) <= tierOrder(slot.tier)),
    );
  });
});

test("only recipe materials, as the EBOOT now has them", async () => {
  await withFixture((game) => {
    const edits = new Edits(game);
    const materials = recipeMaterials(game, edits);
    assert.ok(materials && materials.size > 0);
    const quests = game.quests.map((q) => q.parsed);
    const listed = collectItemSources(game, quests, edits, materials);
    assert.ok(listed.length > 0);
    assert.ok(listed.every((i) => materials.has(i.itemId)));
    assert.ok(listed.length < collectItemSources(game, quests, edits).length);
  }, true);
  await withFixture((game) => assert.equal(recipeMaterials(game, new Edits(game)), null));
});

test("large monsters' earliest tier per rank, earliest rank first", async () => {
  await withFixture((game) => {
    const quests = game.quests.map((q) => q.parsed);
    const seen = largeAppearances(quests);
    assert.ok(seen.size > 0);
    for (const tiers of seen.values()) {
      const order = tiers.map(tierOrder);
      assert.deepEqual(
        order,
        [...order].sort((a, b) => a - b),
      );
      assert.equal(new Set(tiers.map((t) => t.band)).size, tiers.length, "one tier per rank");
    }
  });
});

test("randomize leaves a non-EU disc's bookshelf alone and says why", async () => {
  await withFixture((game) => {
    const result = randomize(
      game,
      settingsWith("BOOK", [], { "hints.almanac": true, "hints.bookshelf": true }),
    );
    for (const title of ["Bookshelf item almanac", "Bookshelf monster guide"]) {
      const report = result.reports.find((r) => r.title === title);
      assert.ok(report, title);
      assert.match(report.notes[0]!, /Not written: .*EU disc/);
    }
    assert.equal(result.edits.files.size, 0);
  }, true);
});
