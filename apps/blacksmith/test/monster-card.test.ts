/**
 * Monster link-preview cards (lib/monster-card.ts): every monster's card lays
 * out with satori and fits the card, its URL changes with its data, and its
 * alt text says what the card shows.
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
        const svg = await satori(monsterCardTree(m, pixel, pixel, sprites) as never, {
          width: CARD.width,
          height: CARD.height,
          fonts: [{ name: CARD_FONT, data: font, weight: 400, style: "normal" }],
        });
        assert.match(svg, /^<svg /, m.slug);
      }
    }
  });

  it("fits every monster's text on its card", () => {
    for (const category of getMonsterCategories()) {
      for (const m of getMonsters(category)) {
        assert.deepEqual(monsterCardOverflow(m), [], m.slug);
      }
    }
  });

  it("notices text that wouldn't fit", () => {
    const rathalos = getMonster("flying-wyvern", "rathalos")!;
    const crowded = {
      ...rathalos,
      hitzones: { ...rathalos.hitzones, "back-tail-spikes": {}, a: {}, b: {} },
    };
    assert.deepEqual(monsterCardOverflow(crowded), ["10 hitzone rows", 'part "Back-Tail-Spikes"']);
  });

  it("gives a changed monster a new card URL", () => {
    const rathalos = getMonster("flying-wyvern", "rathalos")!;
    const url = monsterCardUrl(rathalos);
    assert.match(url, /^\/embed\/cards\/monsters\/rathalos\.png\?v=\d+\.[0-9a-z]+$/);
    assert.equal(monsterCardUrl({ ...rathalos }), url);
    const changed = {
      ...rathalos,
      hitzones: { ...rathalos.hitzones, head: { ...rathalos.hitzones!.head, cut: "75" } },
    };
    assert.notEqual(monsterCardUrl(changed), url);
  });

  it("puts the card's facts in its alt text", () => {
    const rathalos = getMonster("flying-wyvern", "rathalos")!;
    const alt = monsterCardAlt(rathalos);
    assert.match(alt, /^Rathalos, Flying Wyvern\./);
    assert.match(alt, /Base HP 3200\./);
    assert.match(alt, /Cut Head 80/);
    assert.match(alt, /Breaks: Head, Wing\./);
    // A break's condition is left off: Ukanlos's "chest - requires fire element".
    assert.match(monsterCardAlt(getMonster("flying-wyvern", "ukanlos")!), /Breaks: [^.]*\bChest\b/);
  });
});
