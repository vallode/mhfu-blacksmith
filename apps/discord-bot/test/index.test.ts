/**
 * The search index: links match the site's pages, and every hand-written
 * name in the bot is one data/ has.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMMANDS } from "../src/commands.js";
import { normalize, score } from "../src/match.js";
import { MONSTER_NICKNAMES } from "../src/nicknames.js";
import { weakElements } from "../scripts/index-data.js";
import { index } from "./helpers.js";

describe("the index", () => {
  it("has every kind of entry", () => {
    assert.ok(index.monsters.length > 70);
    assert.ok(index.items.length > 1000);
    assert.ok(index.weapons.length > 1000);
    assert.ok(index.skills.length > 100);
    assert.ok(index.armor.length > 1500);
  });

  it("gives each armor piece its own page", () => {
    const hrefs = index.armor.map((a) => `${a.slot}/${a.rank}/${a.slug}`);
    assert.equal(new Set(hrefs).size, hrefs.length);
  });

  it("names only monsters the data has in its nicknames", () => {
    const names = new Set(index.monsters.map((m) => m.name));
    for (const name of Object.keys(MONSTER_NICKNAMES)) assert.ok(names.has(name), name);
  });

  it("finds the elements a monster takes best", () => {
    const zones = { head: { fir: "10", wtr: "5", thn: "30", ice: "28", drg: "0" } };
    assert.deepEqual(weakElements(zones), ["Thunder", "Ice"]);
    assert.deepEqual(
      weakElements({ head: { fir: "5", wtr: "5", thn: "5", ice: "5", drg: "5" } }),
      [],
    );
  });
});

describe("matching", () => {
  it("ignores case, punctuation and spacing", () => {
    assert.equal(normalize("Yian Kut-Ku"), "yian kut ku");
    assert.ok(score("kutku", "Yian Kut-Ku") > 0);
    assert.ok(score("rathalos", "Rathalos") > score("rath", "Rathalos"));
    assert.equal(score("zzz", "Rathalos"), 0);
  });
});

describe("the commands", () => {
  it("fit Discord's rules for names and descriptions", () => {
    for (const c of COMMANDS) {
      assert.match(c.name, /^[a-z]{1,32}$/);
      assert.ok(c.description.length <= 100, c.name);
      for (const o of c.options) assert.ok(o.description.length <= 100, `${c.name} ${o.name}`);
    }
  });
});
