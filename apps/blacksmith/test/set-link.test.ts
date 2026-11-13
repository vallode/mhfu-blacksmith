/**
 * Share links (lib/set-link.ts): the slug a name gives, and reading the code
 * back from any shape of link.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_NAME } from "../src/lib/set-codec";
import { codeFromPath, setSlug, sharePath } from "../src/lib/set-link";

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
    assert.equal(sharePath("AQID", "Rathalos Gunner"), "/s/AQID/rathalos-gunner/");
  });

  it("has no slug without a name, or one with nothing to show", () => {
    assert.equal(sharePath("AQID"), "/s/AQID/");
    assert.equal(sharePath("AQID", null), "/s/AQID/");
    assert.equal(sharePath("AQID", "麒麟"), "/s/AQID/");
  });
});

describe("codeFromPath", () => {
  it("reads the code with or without a slug or trailing slash", () => {
    for (const path of [
      "/s/AQ-_z9/",
      "/s/AQ-_z9",
      "/s/AQ-_z9/rathalos-gunner/",
      "/s/AQ-_z9/rathalos-gunner",
      "/s/AQ-_z9/%E9%BA%92%E9%BA%9F/",
    ]) {
      assert.equal(codeFromPath(path), "AQ-_z9", path);
    }
  });

  it("reads back what sharePath writes", () => {
    assert.equal(codeFromPath(sharePath("AQID", "Kirin's Set")), "AQID");
    assert.equal(codeFromPath(sharePath("AQID")), "AQID");
  });

  it("is null for anything else", () => {
    for (const path of [
      "/s/",
      "/s",
      "/set-builder/",
      "/s/AQ=D/",
      "/s/AQID/name/more/",
      "/x/s/AQID/",
    ]) {
      assert.equal(codeFromPath(path), null, path);
    }
  });
});
