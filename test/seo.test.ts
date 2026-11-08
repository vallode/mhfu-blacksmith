/**
 * Link-preview text (lib/seo.ts): the emoji sharpness bar, title casing and
 * the weapon description layout, on small hand-made inputs.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sharpnessEmoji, titleCase, weaponDescription } from "../src/lib/seo";
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

  test("puts stats first, then the recipe one material per line", () => {
    assert.equal(
      weaponDescription(weapon),
      [
        "Rarity 9 Sword and Shield",
        "Attack 308 · ⚡ Thunder 300 · Affinity −10% · Slots ○○—",
        "🟥🟥🟧🟧🟨🟨🟨🟩🟩🟩🟩🟦⬛⬛⬛ Sharpness",
        "",
        "Create · 90,000z",
        "Lightning Sac ×4",
        "Kirin Hide+ ×3",
        "Or upgrade from Odyssey Blade",
      ].join("\n"),
    );
  });

  test("shows the upgrade recipe when the weapon can't be made directly", () => {
    const upgraded = {
      ...weapon,
      create_mats: null,
      improve_cost: 16500,
      improve_mats: [{ name: "Firecell Stone", amount: 2 }],
    } as Weapon;
    assert.match(
      weaponDescription(upgraded),
      /\n\nUpgrade from Odyssey Blade · 16,500z\nFirecell Stone ×2$/,
    );
  });
});
