/**
 * Monster link-preview cards (lib/monster-card.ts): every monster's card lays
 * out with satori and fits the card, its URL changes with its data, and its
 * alt text says what the card shows. Where monsters are first hunted
 * (firstQuestsByMonster) skips gathering quests.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import satori from "satori";
import { CARD, CARD_FONT, CARD_FONT_PATH } from "../src/lib/card-tree";
import {
  MONSTER_CARD_SPRITES,
  monsterCardAlt,
  monsterCardOverflow,
  monsterCardTree,
  monsterCardUrl,
  type MonsterCardSprites,
} from "../src/lib/monster-card";
import { getMonster, getMonsterCategories, getMonsters } from "../src/lib/monsters";
import { getFirstQuests } from "../src/lib/quests-data";

const font = fs.readFileSync(path.join(process.cwd(), "public", CARD_FONT_PATH));
// A 1×1 transparent PNG for every image: the layout is what's under test.
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const sprites = Object.fromEntries(
  MONSTER_CARD_SPRITES.map((name) => [name, pixel]),
) as MonsterCardSprites;

describe("monster card", () => {
  it("lays out every monster's card", async () => {
    for (const category of getMonsterCategories()) {
      for (const m of getMonsters(category)) {
        const svg = await satori(
          monsterCardTree(m, getFirstQuests(m.name), pixel, pixel, sprites) as never,
          {
            width: CARD.width,
            height: CARD.height,
            fonts: [{ name: CARD_FONT, data: font, weight: 400, style: "normal" }],
          },
        );
        assert.match(svg, /^<svg /, m.slug);
      }
    }
  });

  it("fits every monster's text on its card", () => {
    for (const category of getMonsterCategories()) {
      for (const m of getMonsters(category)) {
        assert.deepEqual(monsterCardOverflow(m, getFirstQuests(m.name)), [], m.slug);
      }
    }
  });

  it("notices text that wouldn't fit", () => {
    const rathalos = getMonster("flying-wyvern", "rathalos")!;
    const crowded = {
      ...rathalos,
      hitzones: { ...rathalos.hitzones, "back-tail-spikes": {}, a: {}, b: {} },
    };
    assert.deepEqual(monsterCardOverflow(crowded, {}), [
      "10 hitzone rows",
      'part "Back-Tail-Spikes"',
    ]);
  });

  it("gives a changed monster a new card URL", () => {
    const rathalos = getMonster("flying-wyvern", "rathalos")!;
    const first = getFirstQuests("Rathalos");
    const url = monsterCardUrl(rathalos, first);
    assert.match(url, /^\/embed\/cards\/monsters\/rathalos\.png\?v=\d+\.[0-9a-z]+$/);
    assert.equal(monsterCardUrl({ ...rathalos }, { ...first }), url);
    assert.notEqual(monsterCardUrl(rathalos, { ...first, village: 1 }), url);
    const changed = {
      ...rathalos,
      hitzones: { ...rathalos.hitzones, head: { ...rathalos.hitzones!.head, cut: "75" } },
    };
    assert.notEqual(monsterCardUrl(changed, first), url);
  });

  it("puts the card's facts in its alt text", () => {
    const rathalos = getMonster("flying-wyvern", "rathalos")!;
    const alt = monsterCardAlt(rathalos, getFirstQuests("Rathalos"));
    assert.match(
      alt,
      /^Rathalos, Flying Wyvern\. First hunted at Village 6★, Low Rank 2★, High Rank 7★, G Rank 2★\./,
    );
    assert.match(alt, /Base HP 3200\./);
    assert.match(alt, /Cut Head 80/);
    assert.match(alt, /Breaks: Head, Wing\./);
    // A break's condition is left off: Ukanlos's "chest - requires fire element".
    const ukanlos = monsterCardAlt(getMonster("flying-wyvern", "ukanlos")!, {});
    assert.match(ukanlos, /Breaks: [^.]*\bChest\b/);
    assert.doesNotMatch(ukanlos, /First hunted/);
  });

  it("finds where monsters are first hunted", () => {
    assert.deepEqual(getFirstQuests("Rathalos"), {
      village: 6,
      "low-rank": 2,
      "high-rank": 7,
      "g-rank": 10,
    });
    // Village ★1 "Sinking Feeling" is a delivery Tigrex only passes through.
    assert.equal(getFirstQuests("Tigrex").village, 5);
    // G Rank only: stored as ★11, the game's G★3.
    assert.deepEqual(getFirstQuests("Ukanlos"), { "g-rank": 11 });
    assert.match(
      monsterCardAlt(getMonster("flying-wyvern", "ukanlos")!, getFirstQuests("Ukanlos")),
      /First hunted at G Rank 3★\./,
    );
    // Basarios is in G Rank only on its gathering tours.
    assert.equal(getFirstQuests("Basarios")["g-rank"], undefined);
    assert.deepEqual(getFirstQuests("Kelbi"), {});
  });
});
