import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DATA_GAMES, GAMES, gameConfig, isGameCode, weaponTypesOf } from "../src/index.js";

const DATA = fileURLToPath(new URL("../../../data", import.meta.url));

test("every game with a config has its data, and its config matches it", () => {
  assert.deepEqual(DATA_GAMES, ["mhfu"]);
  for (const code of DATA_GAMES) {
    const game = gameConfig(code);
    assert.equal(game.code, code);
    const dir = path.join(DATA, code);
    const files = (sub: string) =>
      readdirSync(path.join(dir, sub))
        .map((f) => f.replace(/\.json$/, ""))
        .sort();
    assert.deepEqual(files("weapons"), weaponTypesOf(game).sort());
    assert.deepEqual(files("armor"), [...game.armorSlots].sort());
    assert.deepEqual(files("monsters"), [...game.monsterCategories].sort());
    assert.equal(existsSync(path.join(dir, "decorations.json")), game.sections.decorations);
    assert.equal(existsSync(path.join(dir, "veggie-trades.json")), game.sections.veggieElder);
    assert.equal(existsSync(path.join(dir, "farm.json")), game.sections.pokkeFarm);
    assert.equal(existsSync(path.join(dir, "gathering.json")), game.sections.maps);
  }
});

test("game codes", () => {
  assert.ok(isGameCode("mhf1") && isGameCode("mhf2") && isGameCode("mhfu"));
  assert.ok(!isGameCode("mh3"));
  assert.throws(() => gameConfig("mhf1"), /no game "mhf1"/);
  assert.equal(GAMES.mhfu.weaponClasses.length, 11);
});
