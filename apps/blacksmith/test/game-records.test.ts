/** The game data read by ID (src/lib/game-records.ts). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readData } from "game-data";
import { gameRecords } from "../src/lib/game-records";
import { DATA_DIR, GAME } from "../src/lib/paths";
import type { Lang } from "../src/lib/site";

const records = gameRecords();
const files = [
  ...["weapons", "armor", "monsters", "quests"].flatMap((dir) => records.list(dir)),
  "items.json",
  "decorations.json",
  "skills.json",
  "gathering.json",
  "shops.json",
  "farm.json",
  "combinations.json",
  "veggie-trades.json",
  "equipment-ids.json",
];

describe("game records", () => {
  it("in English, name every file as game-data's named view does", () => {
    for (const file of files) {
      assert.deepEqual(records.named(file), readData(DATA_DIR, GAME, file), file);
      assert.deepEqual(records.english(file), readData(DATA_DIR, GAME, file), file);
    }
  });

  it("name records through the language's table, and keep the English twins for slugs", () => {
    // ja.json has Japanese item names; nothing else, so everything else falls back to English.
    const ja = gameRecords({ lang: "ja" as Lang, game: GAME });
    const named = ja.named<{ items: { id: number; name: string }[] }>("items.json").items;
    const english = ja.english<{ items: { id: number; name: string }[] }>("items.json").items;
    assert.equal(named.length, english.length);
    const ironOre = named.findIndex((i) => english[named.indexOf(i)]!.name === "Iron Ore");
    assert.notEqual(named[ironOre]!.name, "Iron Ore");
    assert.equal(named[ironOre]!.name, ja.strings.name("item", named[ironOre]!.id));
    assert.equal(english[ironOre]!.name, "Iron Ore");
    // Same records, in the same order.
    assert.deepEqual(
      named.map((i) => i.id),
      english.map((i) => i.id),
    );
    // A weapon's name falls back to English when the language has none.
    const bow = ja.named<{ weapons: { name: string }[] }>("weapons/bow.json").weapons[0]!;
    assert.equal(
      bow.name,
      records.named<{ weapons: { name: string }[] }>("weapons/bow.json").weapons[0]!.name,
    );
  });
});
