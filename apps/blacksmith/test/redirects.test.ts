/**
 * The redirects from the URLs before languages and games (src/lib/redirects.ts,
 * written to _redirects by scripts/generate-redirects.ts).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getArmorParams, getArmorPieces } from "../src/lib/armor";
import { WEAPON_TYPES } from "../src/lib/constants";
import { getDecorations } from "../src/lib/decorations";
import { getItemSummaries } from "../src/lib/items-data";
import { getMonsterCategories, getMonsters } from "../src/lib/monsters";
import { QUEST_HUB_SLUGS } from "../src/lib/quests";
import { getQuestSummaries } from "../src/lib/quests-data";
import {
  formatRedirects,
  legacyRedirects,
  MAX_DYNAMIC_RULES,
  MAX_STATIC_RULES,
  resolveRedirect,
} from "../src/lib/redirects";
import { DEFAULT_SITE, inSite, SECTIONS, sitePaths, type Section } from "../src/lib/site";
import { getWeapons } from "../src/lib/weapons";

const BUNDLES = ["items.json", "weapon-bow.json", "data-manifest.json"];
const rules = legacyRedirects(BUNDLES);
const paths = sitePaths(DEFAULT_SITE);
const go = (path: string) => resolveRedirect(rules, path);

/** Every page path from before, as in-site paths: which were the whole URLs. */
function oldPages(): string[] {
  const out = ["/", ...(Object.keys(SECTIONS) as Section[]).map((s) => inSite.section(s))];
  for (const type of WEAPON_TYPES) {
    out.push(inSite.weapons(type));
    for (const w of getWeapons(type)) out.push(inSite.weapons(type, w.slug));
  }
  for (const { slot, rank } of getArmorParams()) {
    out.push(inSite.armor(slot, rank));
    for (const p of getArmorPieces(slot, rank)) out.push(inSite.armor(slot, rank, p.slug));
  }
  for (const category of getMonsterCategories()) {
    out.push(inSite.monsters(category));
    for (const m of getMonsters(category)) out.push(inSite.monsters(category, m.slug));
  }
  for (const d of getDecorations()) out.push(inSite.decorations(d.slug));
  for (const i of getItemSummaries()) out.push(inSite.items(i.slug));
  for (const hub of QUEST_HUB_SLUGS) out.push(inSite.quests(hub));
  for (const q of getQuestSummaries()) out.push(inSite.quests(q.hub, q.id));
  return out;
}

describe("legacy redirects", () => {
  it("send every old page, its RSC payload and its oEmbed file to the new one", () => {
    const pages = oldPages();
    assert.ok(pages.length > 5000, `${pages.length} pages`);
    for (const page of pages) {
      const target = page === "/" ? paths.home() : paths.at(page);
      assert.deepEqual(go(page), { to: target, status: page === "/" ? 302 : 301 }, page);
      if (page !== "/") {
        assert.deepEqual(go(`${page}index.txt`)?.to, `${target}index.txt`, page);
        // Without the trailing slash, as typed.
        if (page.split("/").length === 3) assert.equal(go(page.slice(0, -1))?.to, target, page);
      }
    }
    assert.equal(go("/index.txt")?.to, "/en/mhfu/index.txt");
    assert.equal(
      go("/embed/oembed/blacksmith/great-sword/buster-sword.json")?.to,
      "/embed/oembed/en/mhfu/blacksmith/great-sword/buster-sword.json",
    );
  });

  it("send share links, the offline page and moved files to theirs", () => {
    assert.deepEqual(go("/sets/AQID/kirins-set/"), {
      to: "/en/sets/AQID/kirins-set/",
      status: 301,
    });
    assert.equal(go("/set-builder/card.png")?.to, "/en/mhfu/set-builder/card.png");
    assert.equal(go("/set-builder/oembed.json")?.to, "/en/mhfu/set-builder/oembed.json");
    assert.equal(go("/offline/")?.to, "/en/offline/");
    assert.equal(go("/data/items.json")?.to, "/data/mhfu/items.json");
    assert.equal(go("/search-data.json")?.to, "/data/mhfu/search-en.json");
    assert.equal(go("/embed/set-data.json")?.to, "/embed/mhfu/set-data.json");
    // What every game shares stays where it was.
    assert.equal(go("/data/image-manifest.json"), null);
    assert.equal(go("/images/arrow.png"), null);
  });

  it("never match a new URL, so nothing loops", () => {
    for (const r of rules) {
      const to = r.to.replace(":splat", "x/");
      assert.equal(go(to), null, `${r.from} → ${to}`);
    }
    for (const path of [paths.weapons("bow"), "/en/sets/AQID/", "/en/offline/", "/404.html"])
      assert.equal(go(path), null, path);
  });

  it("fit Cloudflare's limits, as a _redirects file", () => {
    const text = formatRedirects(
      legacyRedirects(Array.from({ length: 60 }, (_, i) => `b${i}.json`)),
    );
    const lines = text.split("\n").filter((l) => l && !l.startsWith("#"));
    const dynamic = lines.filter((l) => l.split(" ")[0]!.includes("*"));
    assert.ok(dynamic.length <= MAX_DYNAMIC_RULES, `${dynamic.length} dynamic`);
    assert.ok(lines.length - dynamic.length <= MAX_STATIC_RULES);
    assert.ok(text.includes("/blacksmith/* /en/mhfu/blacksmith/:splat 301\n"));
    assert.ok(text.includes("/ /en/mhfu/ 302\n"));
  });
});
