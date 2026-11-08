/**
 * Link-preview metadata (lib/seo.ts): the emoji sharpness bar, title casing,
 * the weapon description and author line, and the embed file paths, on small
 * hand-made inputs.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  embedIcon,
  oembedPath,
  sharpnessEmoji,
  titleCase,
  weaponAuthor,
  weaponDescription,
} from "../src/lib/seo";
import type { Weapon } from "../src/lib/types";

/** Count emoji by code point, so ⬛ and 🟥 each count once. */
const cells = (bar: string) => [...bar].length;

describe("sharpnessEmoji", () => {
  test("draws one square per 3 points and fills the rest of 15 with black", () => {
    // Thunderblade Vajra: 7 red, 5 orange, 9 yellow, 11 green, 3 blue (35 of 45).
    assert.equal(sharpnessEmoji([7, 5, 9, 11, 3]), "🟥🟥🟧🟧🟨🟨🟨🟩🟩🟩🟩🟦⬛⬛⬛");
  });

  test("a full bar has no black end", () => {
    const bar = sharpnessEmoji([10, 5, 10, 10, 5, 3, 2]);
    assert.equal(cells(bar), 15);
    assert.ok(!bar.includes("⬛"));
  });

  test("keeps a square for each colour, however short", () => {
    const bar = sharpnessEmoji([20, 1, 1]);
    assert.ok(bar.includes("🟧"));
    assert.ok(bar.includes("🟨"));
    assert.equal(cells(bar), 15);
  });

  test("skips empty colours", () => {
    assert.equal(sharpnessEmoji([3, 0, 3]), "🟥🟨" + "⬛".repeat(13));
  });
});

describe("titleCase", () => {
  test("keeps joining words lower case", () => {
    assert.equal(titleCase("sword-and-shield"), "Sword and Shield");
    assert.equal(titleCase("great-sword"), "Great Sword");
  });
});

describe("weaponDescription", () => {
  const weapon: Weapon = {
    name: "Test Blade",
    slug: "test-blade",
    type: "sword-and-shield",
    rarity: 9,
    attack: 308,
    affinity: "-10%",
    slots: 2,
    sharpness: [7, 5, 9, 11, 3],
    elements: [{ name: "Thunder", attack: 300 }],
    create_cost: 90000,
    create_mats: [
      { name: "Lightning Sac", amount: 4 },
      { name: "Kirin Hide+", amount: 3 },
    ],
    improve_from: "Odyssey Blade",
  } as Weapon;

  test("lists the stats and sharpness, without the recipe", () => {
    assert.equal(
      weaponDescription(weapon),
      [
        "Attack 308 · ⚡ Thunder 300 · Affinity −10% · Slots ○○—",
        "🟥🟥🟧🟧🟨🟨🟨🟩🟩🟩🟩🟦⬛⬛⬛ Sharpness",
      ].join("\n"),
    );
  });

  test("puts the rarity and type in the author line, linking to the tree", () => {
    assert.deepEqual(weaponAuthor(weapon), {
      name: "Rarity 9 Sword and Shield",
      path: "/blacksmith/sword-and-shield/",
    });
  });
});

describe("embed files", () => {
  test("picks the icon tint like the site: gem colour, then rarity 4+, else plain", () => {
    assert.equal(embedIcon("decoration", 5, "red").url, "/embed/icons/decoration-red.png");
    assert.equal(embedIcon("long-sword", 10).url, "/embed/icons/long-sword-rarity-10.png");
    assert.equal(embedIcon("great-sword", 2).url, "/embed/icons/great-sword-plain.png");
  });

  test("puts a page's oEmbed file under /embed/oembed/", () => {
    assert.equal(
      oembedPath("/blacksmith/long-sword/grtdemnhalberdraksha/"),
      "/embed/oembed/blacksmith/long-sword/grtdemnhalberdraksha.json",
    );
  });
});
