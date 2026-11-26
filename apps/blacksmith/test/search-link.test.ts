/**
 * Search links (lib/search-link.ts): a search survives the round trip
 * through an address, and what an address can't mean is left out.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  armorWords,
  hasArmorWord,
  hasSearchLinkParams,
  parseSearchLink,
  searchLinkPath,
  withoutSearchLink,
  type SearchLink,
} from "../src/lib/search-link";

const query = (path: string) => path.slice(path.indexOf("?"));

describe("armorWords", () => {
  it("names armor by the words that aren't the piece", () => {
    assert.deepEqual(armorWords("Crimson Fatalis Mail"), ["Crimson", "Fatalis"]);
    assert.deepEqual(armorWords("Wht Fatalis Cap X"), ["Wht", "Fatalis"]);
    assert.deepEqual(armorWords("RdGuildGuardTricorne"), ["Guild", "Guard", "Tricorne"]);
    assert.deepEqual(armorWords("Ceanataur Head+"), ["Ceanataur"]);
  });

  it("matches a word in any case", () => {
    assert.ok(hasArmorWord("White Fatalis Mail", ["fatalis"]));
    assert.ok(!hasArmorWord("Rathalos Mail", ["Fatalis"]));
    assert.ok(!hasArmorWord("Rathalos Mail", []));
  });
});

describe("search links", () => {
  it("round-trips a search", () => {
    const link: SearchLink = {
      skills: ["Evade +2", "Auto-Reload"],
      hunterType: "Gunner",
      rank: "g-rank",
      weaponSlots: 2,
      lock: ["/armorsmith/helmet/g-rank/kirin-crown-x/"],
      exclude: ["/armorsmith/plate/g-rank/fatalis-chest/"],
      never: ["Fatalis", "Kushala"],
    };
    const path = searchLinkPath(link);
    assert.ok(path.startsWith("/set-builder/?skill=Evade+%2B2&skill=Auto-Reload&type=gunner"));
    assert.ok(path.includes("lock=helmet%2Fg-rank%2Fkirin-crown-x"));
    assert.ok(path.endsWith("never=Fatalis&never=Kushala"));
    assert.deepEqual(parseSearchLink(query(path)), link);
  });

  it("leaves out what isn't said", () => {
    const link = { skills: ["Guard +2"], lock: [], exclude: [], never: [] };
    const path = searchLinkPath(link);
    assert.equal(path, "/set-builder/?skill=Guard+%2B2");
    assert.deepEqual(parseSearchLink(query(path)), link);
  });

  it("is no search without a skill", () => {
    assert.equal(parseSearchLink("?type=gunner&rank=g-rank"), null);
    assert.equal(parseSearchLink(""), null);
  });

  it("drops values it can't read", () => {
    assert.deepEqual(
      parseSearchLink(
        "?skill=Guard+%2B2&skill=Guard+%2B2&type=hunter&rank=z-rank&slots=9&lock=nope",
      ),
      { skills: ["Guard +2"], lock: [], exclude: [], never: [] },
    );
  });

  it("clears its parameters and keeps the rest", () => {
    assert.ok(hasSearchLinkParams("?rank=g-rank"));
    assert.ok(!hasSearchLinkParams("?s=abc"));
    assert.equal(withoutSearchLink("?skill=a&s=abc&type=gunner"), "?s=abc");
    assert.equal(withoutSearchLink("?skill=a"), "");
  });
});
