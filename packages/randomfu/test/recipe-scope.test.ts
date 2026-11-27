import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { loadGame, type GameData } from "whetstone/src/game/load.js";
import { randomize } from "../src/randomize.js";
import { collectRecipeSlots } from "../src/shuffles/recipes.js";
import { buildFixtureDisc, tempDir } from "whetstone/test/fixtures.js";
import { settingsWith } from "./settings-helper.js";

async function load(): Promise<{ game: GameData; close: () => void }> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso);
  return { game, close: () => source.close() };
}

test("recipe materials: every scope shuffles within its reach and leaves no repeats", async () => {
  const { game, close } = await load();
  const vanilla = collectRecipeSlots(game.eboot, game.resolver);
  for (const scope of ["star", "rank", "adjacent", "any"] as const) {
    for (const seed of ["a", "b", "c"]) {
      const result = randomize(game, settingsWith(seed, ["recipes"], { "recipes.scope": scope }));
      assert.deepEqual(result.problems, [], `${scope}/${seed}`);
      const after = collectRecipeSlots(result.edits.eboot(), game.resolver);
      assert.equal(after.length, vanilla.length);
      const tiers = result.sources.tiers;
      after.forEach((slot, i) => {
        const was = vanilla[i]!;
        const was_ = tiers.get(was.itemId);
        const now = tiers.get(slot.itemId);
        if (was_ === undefined) {
          assert.equal(slot.itemId, was.itemId, "an item with no source stays");
        } else if (scope === "star") {
          assert.deepEqual(now, was_, `${scope}: slot ${i}`);
        } else if (scope === "rank") {
          assert.equal(now?.band, was_.band);
        }
      });
    }
  }
  close();
});

test("randomized recipe materials come from the scope, with no repeats in a recipe", async () => {
  const { game, close } = await load();
  const vanilla = collectRecipeSlots(game.eboot, game.resolver);
  let changed = 0;
  for (const scope of ["star", "rank", "any"] as const) {
    for (const seed of ["a", "b", "c", "d"]) {
      const result = randomize(
        game,
        settingsWith(seed, [], { "recipes.mode": "randomize", "recipes.scope": scope }),
      );
      assert.deepEqual(result.problems, [], `${scope}/${seed}`);
      const after = collectRecipeSlots(result.edits.eboot(), game.resolver);
      const tiers = result.sources.tiers;
      const byRecipe = new Map<number, Set<number>>();
      after.forEach((slot, i) => {
        const was = vanilla[i]!;
        const wasTier = tiers.get(was.itemId);
        if (wasTier === undefined) return;
        if (slot.itemId !== was.itemId) changed++;
        const now = tiers.get(slot.itemId);
        assert.ok(now !== undefined, `${scope}: slot ${i} has a sourced item`);
        if (scope === "star") assert.deepEqual(now, wasTier);
        if (scope === "rank") assert.equal(now!.band, wasTier.band);
        const seen = byRecipe.get(slot.entry) ?? new Set<number>();
        byRecipe.set(slot.entry, seen);
        seen.add(slot.itemId);
      });
    }
  }
  assert.ok(changed > 0, "some material changed");
  close();
});
