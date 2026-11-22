import assert from "node:assert/strict";
import { test } from "node:test";
import { pageName } from "../analytics/client.js";
import { browser, cutBytes, device, os, toDataPoint } from "../analytics/collect.js";
import { BLOBS, DOUBLES, column } from "../analytics/events.js";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const facts = { host: "randomfu.vallode.com", country: "PL", userAgent: CHROME_MAC };
const blob = (point: { blobs: string[] }, name: (typeof BLOBS)[number]) =>
  point.blobs[BLOBS.indexOf(name)];
const double = (point: { doubles: number[] }, name: (typeof DOUBLES)[number]) =>
  point.doubles[DOUBLES.indexOf(name)];

test("an event becomes a data point in the shared layout", () => {
  const point = toDataPoint(
    { event: "run_done", session: "abc123", page: "build", ms: 4200, dryRun: false, region: "eu" },
    facts,
  )!;
  assert.equal(point.blobs.length, BLOBS.length);
  assert.equal(point.doubles.length, DOUBLES.length);
  assert.deepEqual(point.indexes, ["abc123"]);
  assert.equal(blob(point, "event"), "run_done");
  assert.equal(blob(point, "region"), "eu");
  assert.equal(blob(point, "host"), "randomfu.vallode.com");
  assert.equal(blob(point, "country"), "PL");
  assert.equal(blob(point, "browser"), "Chrome");
  assert.equal(blob(point, "os"), "macOS");
  assert.equal(blob(point, "discId"), "");
  assert.equal(double(point, "ms"), 4200);
  assert.equal(double(point, "dryRun"), 0);
});

test("the page can't set the Worker's own columns", () => {
  const point = toDataPoint({ event: "pageview", country: "XX", host: "evil" }, facts)!;
  assert.equal(blob(point, "country"), "PL");
  assert.equal(blob(point, "host"), "randomfu.vallode.com");
});

test("unknown events, bad bodies and bots aren't stored", () => {
  assert.equal(toDataPoint({ event: "nope" }, facts), null);
  assert.equal(toDataPoint(null, facts), null);
  assert.equal(toDataPoint([{ event: "pageview" }], facts), null);
  assert.equal(toDataPoint("pageview", facts), null);
  for (const userAgent of ["", "Googlebot/2.1", "curl/8.0", "HeadlessChrome/130"]) {
    assert.equal(toDataPoint({ event: "pageview" }, { ...facts, userAgent }), null, userAgent);
  }
});

test("long strings are cut and odd numbers dropped", () => {
  const point = toDataPoint(
    { event: "run_error", error: "x".repeat(5000), detail: "y".repeat(500), ms: NaN, ok: true },
    facts,
  )!;
  assert.equal(blob(point, "error")!.length, 300);
  assert.equal(blob(point, "detail")!.length, 120);
  assert.equal(double(point, "ms"), 0);
  assert.equal(double(point, "ok"), 1);
});

test("the User-Agent gives device, browser and OS", () => {
  assert.equal(device(CHROME_MAC), "desktop");
  assert.equal(device(SAFARI_IPHONE), "mobile");
  assert.equal(
    device("Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/130 Safari/537.36"),
    "tablet",
  );
  assert.equal(browser(SAFARI_IPHONE), "Safari");
  assert.equal(os(SAFARI_IPHONE), "iOS");
  assert.equal(browser("Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36 Edg/130"), "Edge");
  assert.equal(
    browser("Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0"),
    "Firefox",
  );
});

test("page names and SQL columns", () => {
  assert.equal(pageName("/"), "about");
  assert.equal(pageName("/index.html"), "about");
  assert.equal(pageName("/faq"), "faq");
  assert.equal(pageName("/build.html"), "build");
  assert.equal(column("event"), "blob1");
  assert.equal(column("testing"), "blob20");
  assert.equal(column("ms"), "double1");
  assert.ok(BLOBS.length <= 20 && DOUBLES.length <= 20, "Analytics Engine's limits");
});

test("a cut list keeps whole items and the longest settings strings fit", () => {
  const keys = Array.from({ length: 200 }, (_, i) => `section${i}.option`).join(",");
  const point = toDataPoint(
    { event: "run_done", changedKeys: keys, settings: "R".repeat(2800) },
    facts,
  )!;
  const kept = blob(point, "changedKeys")!;
  assert.ok(kept.length <= 3000 && kept.length > 2900);
  assert.ok(
    kept.split(",").every((k) => /^section\d+\.option$/.test(k)),
    "no item cut in half",
  );
  assert.equal(blob(point, "settings")!.length, 2800);
});

test("columns are cut by UTF-8 bytes, never mid-character", () => {
  assert.equal(cutBytes("abc", 10), "abc");
  assert.equal(cutBytes("モンハン", 7), "モン");
  const point = toDataPoint({ event: "run_error", error: "エ".repeat(200) }, facts)!;
  assert.equal(new TextEncoder().encode(blob(point, "error")).length, 300);
});
