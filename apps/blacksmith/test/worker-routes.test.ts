/**
 * The Worker's routing (src/cloudflare/routes.ts): which response each
 * request gets, and the request a share link's page is fetched with.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUILDER_PATH,
  builderPage,
  CARD_PATH,
  OEMBED_PATH,
  route,
  type Route,
} from "../src/cloudflare/routes";
import { sharePath } from "../src/lib/set-link";

const at = (path: string, method = "GET"): Route =>
  route(new URL(path, "https://mhfu.example"), method);

describe("route", () => {
  it("serves a share link the set builder's page, with or without its slug", () => {
    const page = { kind: "page", code: "AQID", shareLink: true };
    assert.deepEqual(at(sharePath("AQID", "Kirin's Set")), page);
    assert.deepEqual(at(sharePath("AQID")), page);
    assert.deepEqual(at("/sets/AQID"), page);
    assert.deepEqual(at("/sets/AQID/edited-slug/", "HEAD"), page);
  });

  it("gives an older ?s= link the page in place", () => {
    assert.deepEqual(at(`${BUILDER_PATH}?s=AQID`), {
      kind: "page",
      code: "AQID",
      shareLink: false,
    });
  });

  it("serves the card and the oEmbed file by their query", () => {
    assert.deepEqual(at(`${CARD_PATH}?s=AQID&v=1`), { kind: "card", code: "AQID" });
    assert.deepEqual(at(`${OEMBED_PATH}?s=AQID`), { kind: "oembed", code: "AQID" });
  });

  it("leaves everything else to the static assets", () => {
    for (const path of [
      BUILDER_PATH,
      `${BUILDER_PATH}?s=`,
      CARD_PATH,
      OEMBED_PATH,
      "/sets/",
      "/sets/AQID/slug/more/",
      "/sets/AQ=D/",
      "/s/AQID/",
    ]) {
      assert.deepEqual(at(path), { kind: "asset" }, path);
    }
    assert.deepEqual(at(sharePath("AQID"), "POST"), { kind: "asset" });
    assert.deepEqual(at(`${BUILDER_PATH}?s=AQID`, "PUT"), { kind: "asset" });
  });
});

describe("builderPage", () => {
  const link = new Request(new URL(sharePath("AQID", "Kirin's Set"), "https://mhfu.example"), {
    method: "HEAD",
    headers: {
      Accept: "text/html",
      "If-None-Match": '"abc"',
      "If-Modified-Since": "Fri, 13 Nov 2026 05:00:00 GMT",
    },
  });
  const req = builderPage(link);

  it("asks for the set builder's page on the same origin, with the same method", () => {
    assert.equal(req.url, `https://mhfu.example${BUILDER_PATH}`);
    assert.equal(req.method, "HEAD");
  });

  it("keeps the browser's headers but not its validators for the link", () => {
    assert.equal(req.headers.get("Accept"), "text/html");
    assert.equal(req.headers.get("If-None-Match"), null);
    assert.equal(req.headers.get("If-Modified-Since"), null);
  });
});
