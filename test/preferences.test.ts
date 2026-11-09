/**
 * Reading stored preferences (lib/preferences.ts): unknown, missing or
 * wrongly typed values fall back to the defaults.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { STAGES } from "../src/lib/min-rank";
import { DEFAULT_PREFERENCES, parsePreferences } from "../src/lib/preferences";

describe("parsePreferences", () => {
  test("nothing stored gives the defaults", () => {
    assert.deepEqual(parsePreferences(null), DEFAULT_PREFERENCES);
  });

  test("broken JSON gives the defaults", () => {
    assert.deepEqual(parsePreferences("{not json"), DEFAULT_PREFERENCES);
    assert.deepEqual(parsePreferences("null"), DEFAULT_PREFERENCES);
    assert.deepEqual(parsePreferences('"text"'), DEFAULT_PREFERENCES);
  });

  test("stored choices override the defaults", () => {
    const prefs = parsePreferences(
      JSON.stringify({ showRawValues: false, checkZenny: false, defaultTreeFilter: "craftable" }),
    );
    assert.deepEqual(prefs, {
      ...DEFAULT_PREFERENCES,
      showRawValues: false,
      checkZenny: false,
      defaultTreeFilter: "craftable",
    });
  });

  test("wrongly typed and unknown values are dropped", () => {
    const prefs = parsePreferences(
      JSON.stringify({
        markOwned: "no",
        defaultTreeFilter: "everything",
        showRawAttack: false, // an old key
      }),
    );
    assert.deepEqual(prefs, DEFAULT_PREFERENCES);
  });

  test("language is a known locale or auto", () => {
    assert.equal(parsePreferences(JSON.stringify({ language: "es" })).language, "es");
    assert.equal(parsePreferences(JSON.stringify({ language: "auto" })).language, "auto");
    assert.equal(parsePreferences(JSON.stringify({ language: "xx" })).language, "auto");
    assert.equal(parsePreferences(JSON.stringify({ language: 3 })).language, "auto");
  });

  test("quest progress is one of the offered stages", () => {
    const prefs = parsePreferences(
      JSON.stringify({ questProgress: { rank: "high-rank", stars: 7 } }),
    );
    // The stage itself, so the selector finds it among its choices.
    assert.equal(
      prefs.questProgress,
      STAGES.find((s) => s.rank === "high-rank" && s.stars === 7),
    );
    assert.equal(parsePreferences("{}").questProgress, null);
  });

  test("an unknown quest progress falls back to showing everything", () => {
    for (const bad of [{ rank: "low-rank", stars: 99 }, { rank: "x", stars: 1 }, "g-rank", 3, []]) {
      assert.equal(parsePreferences(JSON.stringify({ questProgress: bad })).questProgress, null);
    }
  });
});
