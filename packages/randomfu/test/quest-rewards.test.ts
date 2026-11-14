import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { isQuestItem } from "../src/game/quest-fields.js";
import { questTier, tierKey } from "../src/game/tiers.js";
import { randomize } from "../src/randomize.js";
import { collectQuestRewardSlots } from "../src/shuffles/quest-rewards.js";
import { buildFixtureDisc, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

async function fixtureGame(): Promise<GameData> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  return loadGame(source, iso, { eboot: null });
}

/** Each reward slot's item and amount after `randomize`. */
function rewardsAfter(game: GameData, result: ReturnType<typeof randomize>) {
  return collectQuestRewardSlots(game.quests).map((slot) => {
    const payload = result.edits.questNow(slot.quest);
    return {
      slot,
      itemId: payload.readUInt16LE(slot.offset + 2),
      amount: payload.readUInt16LE(slot.offset + 4),
      chance: payload.readUInt16LE(slot.offset),
    };
  });
}

test("quest rewards from the same rank: rank items only, usual amounts, chances kept", async () => {
  const game = await fixtureGame();
  const slots = collectQuestRewardSlots(game.quests);
  const amounts = new Map(slots.map((s) => [s.itemId, s.amount]));
  let changed = 0;
  for (const seed of ["a", "b", "c", "d"]) {
    const result = randomize(
      game,
      settingsWith(seed, ["quest-rewards"], {
        "questRewards.pool": "rank",
        "questRewards.keepItems": false,
      }),
    );
    const bands = result.sources.tiers;
    for (const { slot, itemId, amount, chance } of rewardsAfter(game, result)) {
      assert.equal(chance, slot.chance);
      assert.equal(bands.get(itemId)?.band, questTier(slot.quest.parsed)!.band);
      // A new item comes in the amount quests reward of it (each fixture item once), else 1.
      if (itemId !== slot.itemId) {
        changed++;
        assert.equal(amount, amounts.get(itemId) ?? 1);
        assert.ok(!isQuestItem(itemId), `${itemId} is quest-only`);
      }
    }
  }
  assert.ok(changed > 0);
});

test("keeping reward items: every item stays a reward at its tier", async () => {
  const game = await fixtureGame();
  for (const seed of ["a", "b", "c"]) {
    const result = randomize(
      game,
      settingsWith(seed, ["quest-rewards"], { "questRewards.pool": "any" }),
    );
    const after = rewardsAfter(game, result);
    for (const { slot, itemId } of after) {
      if (itemId !== slot.itemId) assert.ok(!isQuestItem(itemId), `${itemId} is quest-only`);
    }
    const byTier = new Map<string, Set<number>>();
    for (const { slot, itemId } of after) {
      const key = tierKey(slot.tier);
      byTier.set(key, (byTier.get(key) ?? new Set()).add(itemId));
    }
    for (const { slot } of after) assert.ok(byTier.get(tierKey(slot.tier))!.has(slot.itemId));
  }
});

test("the default reward pool is the old shuffle, seed for seed", async () => {
  const game = await fixtureGame();
  const plain = randomize(game, settingsWith("same", ["quest-rewards"]));
  const pooled = randomize(
    game,
    settingsWith("same", ["quest-rewards"], { "questRewards.keepItems": false }),
  );
  assert.deepEqual(
    rewardsAfter(game, pooled).map((r) => [r.itemId, r.amount]),
    rewardsAfter(game, plain).map((r) => [r.itemId, r.amount]),
  );
});
