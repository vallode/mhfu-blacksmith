/**
 * Share links (lib/set-link.ts): the slug a name gives, and reading the code
 * back from any shape of link.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanName, MAX_NAME } from "../src/lib/set-codec";
import { codeFromPath, setSlug, shareLinkOf, sharePath } from "../src/lib/set-link";

describe("setSlug", () => {
  it("lowercases and joins words with dashes", () => {
    assert.equal(setSlug("Rathalos Gunner"), "rathalos-gunner");
    assert.equal(setSlug("  G-Rank   Blademaster!! "), "g-rank-blademaster");
  });

  it("drops apostrophes and accents", () => {
    assert.equal(setSlug("Kirin's Set"), "kirins-set");
    assert.equal(setSlug("Kirin’s Set"), "kirins-set");
    assert.equal(setSlug("Café Böse"), "cafe-bose");
  });

  it("is empty for a name with nothing to show", () => {
    assert.equal(setSlug("麒麟"), "");
    assert.equal(setSlug("!!!"), "");
  });

  it("cuts a long name at a word", () => {
    const slug = setSlug("word ".repeat(30));
    assert.ok(slug.length <= 60);
    assert.match(slug, /^(word-)*word$/);
    assert.equal(setSlug("x".repeat(70)).length, 60);
  });

  it("keeps a code's longest name whole", () => {
    const name = "Rathalos ".repeat(MAX_NAME).slice(0, MAX_NAME);
    assert.equal(setSlug(name), name.trim().toLowerCase().replace(/ /g, "-"));
  });
});

describe("sharePath", () => {
  it("ends with the name's slug", () => {
    assert.equal(sharePath("en", "AQID", "Rathalos Gunner"), "/en/sets/AQID/rathalos-gunner/");
  });

  it("slugs the name as a code carries it", () => {
    const long = "Rathalos Soul Gunner for Rajang and Kushala Daora hunts";
    assert.ok(long.length > MAX_NAME);
    const carried = cleanName(long);
    assert.equal(sharePath("en", "AQID", long), sharePath("en", "AQID", carried));
    assert.equal(sharePath("en", "AQID", long), `/en/sets/AQID/${setSlug(carried)}/`);
    assert.equal(
      sharePath("en", "AQID", "  Line one\nline two "),
      "/en/sets/AQID/line-one-line-two/",
    );
  });

  it("has no slug without a name, or one with nothing to show", () => {
    assert.equal(sharePath("en", "AQID"), "/en/sets/AQID/");
    assert.equal(sharePath("en", "AQID", null), "/en/sets/AQID/");
    assert.equal(sharePath("en", "AQID", "麒麟"), "/en/sets/AQID/");
  });
});

describe("codeFromPath", () => {
  it("reads the code with or without a slug or trailing slash", () => {
    for (const path of [
      "/en/sets/AQ-_z9/",
      "/en/sets/AQ-_z9",
      "/en/sets/AQ-_z9/rathalos-gunner/",
      "/en/sets/AQ-_z9/rathalos-gunner",
      "/en/sets/AQ-_z9/%E9%BA%92%E9%BA%9F/",
    ]) {
      assert.equal(codeFromPath(path), "AQ-_z9", path);
    }
  });

  it("reads the language", () => {
    assert.deepEqual(shareLinkOf("/en/sets/AQID/x/"), { lang: "en", code: "AQID" });
  });

  it("reads back what sharePath writes", () => {
    assert.equal(codeFromPath(sharePath("en", "AQID", "Kirin's Set")), "AQID");
    assert.equal(codeFromPath(sharePath("en", "AQID")), "AQID");
  });

  it("is null for anything else", () => {
    for (const path of [
      "/sets/",
      "/sets",
      "/set-builder/",
      "/sets/AQ=D/",
      "/en/sets/AQID/name/more/",
      "/x/sets/AQID/",
    ]) {
      assert.equal(codeFromPath(path), null, path);
    }
  });
});
