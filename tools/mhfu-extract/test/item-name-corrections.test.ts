import assert from "node:assert/strict";
import { test } from "node:test";
import { correctedItemName } from "../src/overlay/item-name-corrections.js";

/**
 * These pin real entries from the checked-in `item-name-corrections.json`
 * (see that file's `.ts` wrapper module doc comment for the full
 * methodology and the category-collision finding driving the two-bucket
 * `global`/`armor` shape).
 */
test("correctedItemName applies a global correction in every context", () => {
  assert.equal(correctedItemName("High Qualty Pelt", "armor"), "High Quality Pelt");
  assert.equal(correctedItemName("High Qualty Pelt", "weapon"), "High Quality Pelt");
  assert.equal(correctedItemName("High Qualty Pelt", "decoration"), "High Quality Pelt");
});

/**
 * "Firestone" is a confirmed real case of the committed `data/` corpus
 * itself being internally inconsistent: weapons/decorations recipes
 * legitimately commit "Firestone" (30 weapon + 3 decoration occurrences),
 * while every armor recipe commits "Fire Stone" instead (55 occurrences,
 * zero armor occurrences of "Firestone"). Applying this correction outside
 * the armor context would regress already-correct weapon/decoration data.
 */
test("correctedItemName applies an armor-scoped correction only for armor context", () => {
  assert.equal(correctedItemName("Firestone", "armor"), "Fire Stone");
  assert.equal(correctedItemName("Firestone", "weapon"), "Firestone");
  assert.equal(correctedItemName("Firestone", "decoration"), "Firestone");
});

test("correctedItemName returns the name unchanged when no correction applies", () => {
  assert.equal(correctedItemName("Iron Ore", "armor"), "Iron Ore");
  assert.equal(correctedItemName("Nonexistent Material", "weapon"), "Nonexistent Material");
});
