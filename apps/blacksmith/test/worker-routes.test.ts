/**
 * The Worker's routing (src/cloudflare/routes.ts): which response each
 * request gets, and the request a share link's page is fetched with.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  builderPage,
  builderPath,
  cardPath,
  oembedFilePath,
  route,
  type Route,
} from "../src/cloudflare/routes";
import { sharePath } from "../src/lib/set-link";
import { encodeRaw, toBase64Url } from "../src/lib/set-codec";
import type { Site } from "../src/lib/site";

const at = (path: string, method = "GET"): Route =>
  route(new URL(path, "https://mhfu.example"), method);

const site: Site = { lang: "en", game: "mhfu" };
const BUILDER = builderPath(site);

describe("route", () => {
  it("serves a share link the set builder's page, with or without its slug", () => {
    const page = { kind: "page", code: "AQID", shareLink: true, site };
    assert.deepEqual(at(sharePath("en", "AQID", "Kirin's Set")), page);
    assert.deepEqual(at(sharePath("en", "AQID")), page);
    assert.deepEqual(at("/en/sets/AQID"), page);
    assert.deepEqual(at("/en/sets/AQID/edited-slug/", "HEAD"), page);
  });

  it("serves a share link its code's game's builder, or the default game's", () => {
    const code = (game: "mhf1" | "mhf2" | "mhfu") =>
      toBase64Url(encodeRaw({ armor: [1, 0, 0, 0, 0], weaponSlots: 0, decorations: [], game }));
    // MHFU codes carry no game: the same code as before games.
    assert.equal(
      code("mhfu"),
      toBase64Url(encodeRaw({ armor: [1, 0, 0, 0, 0], weaponSlots: 0, decorations: [] })),
    );
    assert.deepEqual(at(sharePath("en", code("mhfu"))), {
      kind: "page",
      code: code("mhfu"),
      shareLink: true,
      site,
    });
    // A game the site isn't built for (yet) gets the default game's builder, which says so.
    assert.deepEqual((at(sharePath("en", code("mhf2"))) as { site: Site }).site, site);
    assert.equal(builderPath(site), "/en/mhfu/set-builder/");
  });

  it("gives an older ?s= link the page in place", () => {
    assert.deepEqual(at(`${BUILDER}?s=AQID`), {
      kind: "page",
      code: "AQID",
      shareLink: false,
      site,
    });
  });

  it("serves the card and the oEmbed file by their query", () => {
    assert.equal(cardPath(site), "/en/mhfu/set-builder/card.png");
    assert.deepEqual(at(`${cardPath(site)}?s=AQID&v=1`), { kind: "card", code: "AQID", site });
    assert.deepEqual(at(`${oembedFilePath(site)}?s=AQID`), { kind: "oembed", code: "AQID", site });
  });

  it("leaves everything else to the static assets", () => {
    for (const path of [
      BUILDER,
      `${BUILDER}?s=`,
      cardPath(site),
      oembedFilePath(site),
      `${BUILDER}other.json?s=AQID`,
      "/en/sets/",
      "/en/sets/AQID/slug/more/",
      "/en/sets/AQ=D/",
      "/s/AQID/",
      // The URLs from before languages and games: _redirects answers them.
      "/sets/AQID/",
      "/set-builder/?s=AQID",
      "/set-builder/card.png?s=AQID",
      "/xx/mhfu/set-builder/?s=AQID",
    ]) {
      assert.deepEqual(at(path), { kind: "asset" }, path);
    }
    assert.deepEqual(at(sharePath("en", "AQID"), "POST"), { kind: "asset" });
    assert.deepEqual(at(`${BUILDER}?s=AQID`, "PUT"), { kind: "asset" });
  });
});

describe("builderPage", () => {
  const link = new Request(
    new URL(sharePath("en", "AQID", "Kirin's Set"), "https://mhfu.example"),
    {
      method: "HEAD",
      headers: {
        Accept: "text/html",
        "If-None-Match": '"abc"',
        "If-Modified-Since": "Fri, 13 Nov 2026 05:00:00 GMT",
      },
    },
  );
  const req = builderPage(link, site);

  it("asks for the set builder's page on the same origin, with the same method", () => {
    assert.equal(req.url, `https://mhfu.example${BUILDER}`);
    assert.equal(req.method, "HEAD");
  });

  it("keeps the browser's headers but not its validators for the link", () => {
    assert.equal(req.headers.get("Accept"), "text/html");
    assert.equal(req.headers.get("If-None-Match"), null);
    assert.equal(req.headers.get("If-Modified-Since"), null);
  });
});
