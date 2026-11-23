/**
 * LAST_WEAPON_SCRIPT (lib/last-weapon.ts): on `/` and `/blacksmith/`, which
 * are built as the default weapon's page, it sends a visitor who last viewed
 * another weapon type to that type's page, and leaves everyone else be.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_WEAPON, LAST_WEAPON_KEY, LAST_WEAPON_SCRIPT } from "../src/lib/last-weapon";

/** Where the script sends the browser from `pathname` with `stored` saved, or null. */
function run(
  pathname: string,
  stored: string | null | Error,
  search = "",
  hash = "",
): string | null {
  let target: string | null = null;
  const location = { pathname, search, hash, replace: (url: string) => (target = url) };
  const localStorage = {
    getItem(key: string) {
      if (stored instanceof Error) throw stored;
      return key === LAST_WEAPON_KEY ? stored : null;
    },
  };
  new Function("location", "localStorage", LAST_WEAPON_SCRIPT)(location, localStorage);
  return target;
}

describe("LAST_WEAPON_SCRIPT", () => {
  test("opens the last weapon type viewed", () => {
    assert.equal(run("/", "long-sword"), "/blacksmith/long-sword/");
    assert.equal(run("/blacksmith/", "bow"), "/blacksmith/bow/");
  });

  test("keeps the query string and hash", () => {
    assert.equal(run("/", "bow", "?ref=x", "#top"), "/blacksmith/bow/?ref=x#top");
  });

  test("stays on the default type's page", () => {
    assert.equal(run("/", null), null);
    assert.equal(run("/", DEFAULT_WEAPON), null);
    assert.equal(run("/", "not-a-weapon"), null);
    assert.equal(run("/", new Error("storage blocked")), null);
  });

  test("does nothing on other pages", () => {
    assert.equal(run("/blacksmith/great-sword/", "long-sword"), null);
    assert.equal(run("/monsters/", "long-sword"), null);
  });
});
