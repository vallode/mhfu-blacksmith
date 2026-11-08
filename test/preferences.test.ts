/**
 * Reading stored preferences (lib/preferences.ts): unknown, missing or
 * wrongly typed values fall back to the defaults.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
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
});
