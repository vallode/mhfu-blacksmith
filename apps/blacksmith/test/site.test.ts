/** The site's URLs (src/lib/site.ts). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SITE,
  inSite,
  languageAlternates,
  LANGS,
  parseSitePath,
  SITES,
  sitePath,
  sitePaths,
  siteOfPath,
  toInSitePath,
} from "../src/lib/site";

const paths = sitePaths(DEFAULT_SITE);

describe("site paths", () => {
  it("are /<lang>/<game>/<section>/<english-slug>/", () => {
    assert.equal(paths.home(), "/en/mhfu/");
    assert.equal(
      paths.weapons("great-sword", "buster-sword"),
      "/en/mhfu/blacksmith/great-sword/buster-sword/",
    );
    assert.equal(paths.weapons(), "/en/mhfu/blacksmith/");
    assert.equal(paths.armor("helmet", "g-rank", "x"), "/en/mhfu/armorsmith/helmet/g-rank/x/");
    assert.equal(paths.monsters("flying-wyvern"), "/en/mhfu/monsters/flying-wyvern/");
    assert.equal(paths.quests("village", 10101), "/en/mhfu/quests/village/10101/");
    assert.equal(paths.items("iron-ore"), "/en/mhfu/items/iron-ore/");
    assert.equal(paths.section("veggieElder"), "/en/mhfu/veggie-elder/");
    assert.equal(paths.setBuilder(), "/en/mhfu/set-builder/");
  });

  it("put in-site paths (the URLs from before) in the copy", () => {
    assert.equal(inSite.weapons("bow", "x"), "/blacksmith/bow/x/");
    assert.equal(paths.at(inSite.weapons("bow", "x")), paths.weapons("bow", "x"));
    assert.throws(() => paths.at("/en/mhfu/items/x/"), /not an in-site path/);
    assert.equal(toInSitePath("/en/mhfu/items/x/"), "/items/x/");
    assert.equal(toInSitePath("/en/mhfu/"), "/");
    assert.equal(toInSitePath("/en/offline/"), "/en/offline/");
  });

  it("read back the language and game", () => {
    assert.deepEqual(parseSitePath("/en/mhfu/blacksmith/bow/"), {
      site: DEFAULT_SITE,
      rest: ["blacksmith", "bow"],
    });
    assert.equal(parseSitePath("/blacksmith/bow/"), null);
    assert.equal(parseSitePath("/en/mhf1/blacksmith/"), null, "a game without data");
    assert.equal(parseSitePath("/xx/mhfu/"), null);
    assert.deepEqual(siteOfPath("/en/offline/"), DEFAULT_SITE);
    assert.deepEqual(siteOfPath("/"), DEFAULT_SITE);
  });

  it("build every language and game the site has", () => {
    assert.deepEqual(LANGS, ["en"]);
    assert.deepEqual(SITES, [DEFAULT_SITE]);
    assert.equal(sitePath(DEFAULT_SITE, "a", 1), "/en/mhfu/a/1/");
  });

  it("list the page in each language for hreflang", () => {
    assert.deepEqual(languageAlternates("/en/mhfu/items/x/"), { en: "/en/mhfu/items/x/" });
    assert.deepEqual(languageAlternates("/en/offline/"), {});
  });
});
