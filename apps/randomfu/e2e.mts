/**
 * End-to-end check of the web app in a real browser: builds dist/,
 * serves it, follows the about page and the FAQ to the builder, uploads the test fixture disc, randomizes with every
 * shuffle on, downloads the ISO and compares it byte for byte with the same
 * run of the randomizer in Node, so the browser build (shims, worker, Blob
 * assembly) changes nothing, and checks the analytics events the walk
 * sends would all be stored. Needs Playwright's Chromium.
 *
 *   pnpm test:e2e
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRandomizer } from "randomfu/src/run.js";
import { applySettings, defaultSettings, encodeSettings, PRESETS } from "randomfu/src/settings.js";
import { assemble, buildFixtureDisc, memorySource, tempDir } from "whetstone/test/fixtures.js";
import { toDataPoint } from "./analytics/collect.js";
import { EVENT_PATH } from "./analytics/events.js";

const web = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(web, "dist");
execFileSync(process.execPath, ["--import", "tsx", path.join(web, "build.mjs")], {
  stdio: "inherit",
});

const dir = tempDir();
// The disc's EBOOT is encrypted, as on a real disc, so the app decrypts it itself.
const isoPath = path.join(dir, "MHFU test disc.iso");
const disc = buildFixtureDisc({ ebootTag: 0xc0cb167c }); // a real disc's tag
writeFileSync(isoPath, disc);

// Everything on, as the Chaos preset, but keeping recipe logic so the run is checked.
const chaos = PRESETS.find((p) => p.name === "Chaos")!;
const settings = applySettings(defaultSettings("WEB-E2E"), {
  ...chaos.changes,
  "recipes.scope": "star",
  // Not in a preset until they're tried on a real disc.
  "questMonsters.difficulty": true,
  "questMonsters.smallCounts": true,
  "monsterStats.hp": true,
  "monsterStats.size": true,
  "monsterStats.status": true,
  "weaknesses.elements": true,
  "weaknesses.parts": true,
  "weapons.attack": true,
  "weapons.affinity": true,
  "weapons.element": true,
});
const settingsString = encodeSettings(settings);

// The same run in Node, over the disc in memory.
const { segments } = await runRandomizer(memorySource(disc), settings, {}, () => {});
const fromNode = assemble(segments!, disc);

const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".map": "application/json",
};
/** The analytics events the pages send, as the Worker would get them. */
const events: Record<string, unknown>[] = [];
const server = http.createServer((req, res) => {
  if (req.url === EVENT_PATH && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        events.push(JSON.parse(body) as Record<string, unknown>);
      } catch (error) {
        errors.push(`an analytics event isn't JSON (${(error as Error).message}): ${body}`);
      }
      res.writeHead(204).end();
    });
    return;
  }
  const file = path.join(
    dist,
    path.normalize(new URL(req.url ?? "/", "http://x").pathname).replace(/^\/$/, "/index.html"),
  );
  try {
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;

const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const errors: string[] = [];
try {
  const page = await browser.newPage({ acceptDownloads: true });
  page.on("pageerror", (e: Error) => errors.push(e.message));
  page.on("console", (m: { type(): string; text(): string }) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // The about page and the FAQ lead to the builder.
  for (const start of ["", "faq.html"]) {
    await page.goto(url + start);
    await page.click(".page-actions a.primary");
    await page.waitForURL(`${url}build.html`);
  }
  await page.waitForSelector("[data-key='shops.scope']", { state: "attached" });
  const title = () => page.textContent("#step-title");

  // Step 1: the disc. Next waits for one.
  assert.equal(await title(), "Your game");
  await page.click("#next");
  assert.match((await page.textContent("#nav-status"))!, /Choose your disc image first/);
  await page.setInputFiles("#iso", isoPath);
  await page.waitForFunction(() =>
    /supported/.test(document.getElementById("check-status")!.textContent ?? ""),
  );
  assert.match((await page.textContent("#check-status"))!, /ULJM05500 \(JP\) is supported/);
  assert.equal(await page.textContent("#iso-mark"), "✓");
  assert.match(
    (await page.getAttribute("#check-status", "class"))!,
    /visually-hidden/,
    "a supported disc's sentence is only for screen readers",
  );
  await page.click("#next");

  // Step 2: seed and presets; load the shared settings.
  assert.equal(await title(), "Seed & preset");
  assert.ok(await page.isVisible("#download"), "the options can be skipped for a download");
  assert.ok(await page.isVisible("#customize"), "the options can be customized");
  await page.fill("#paste", settingsString);
  await page.click("#apply-paste");
  assert.match((await page.textContent("#share-status"))!, /Loaded the settings string/);

  // Through every option step to the review, in the order the step menu lists them.
  const menu = await page.$$eval("#steps .step-label", (labels: Element[]) =>
    labels.map((l: Element) => l.textContent ?? ""),
  );
  const optionSteps = menu.slice(menu.indexOf("Seed & preset") + 1, menu.indexOf("Review"));
  const seen: string[] = [];
  while (seen.length < 20) {
    await page.click("#next");
    const name = (await title())!;
    if (name === "Review") break;
    seen.push(name);
  }
  assert.equal(await title(), "Review", `stuck after ${seen.join(", ")}`);
  assert.deepEqual(seen, optionSteps, "Next goes through every option step in order");
  assert.deepEqual(seen.slice(0, 4), ["Rewards", "Gathering", "Quests", "Monsters"]);
  assert.equal(
    await page.inputValue("#share"),
    settingsString,
    "the page reproduces the settings string",
  );

  await page.click("#dry-run");
  await page.waitForSelector("#spoiler-wrap:not([hidden])");
  assert.equal(await title(), "Randomize");
  assert.match((await page.textContent("#run-status"))!, /Preview ready/);

  await page.click("#run-now");
  await page.waitForFunction(
    () => /^Done/.test(document.getElementById("run-status")!.textContent ?? ""),
    null,
    { timeout: 60_000 },
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#downloads a:first-child"),
  ]);
  assert.equal(download.suggestedFilename(), "MHFU test disc (RandomFU WEB-E2E).iso");
  const webOut = path.join(dir, "web.iso");
  await download.saveAs(webOut);

  const fromWeb = readFileSync(webOut);
  assert.equal(fromWeb.length, fromNode.length);
  assert.ok(fromWeb.equals(fromNode), "the web app's ISO is byte for byte the Node run's");
  assert.ok(!fromWeb.equals(disc));
  const spoiler = (await page.textContent("#spoiler"))!;
  assert.match(spoiler, /Settings: RF/);

  // The walk's analytics: every page view, the funnel, the disc and the runs.
  const sent = (event: string, match: Record<string, unknown> = {}) =>
    events.some((e) => e.event === event && Object.entries(match).every(([k, v]) => e[k] === v));
  const expected: [string, Record<string, unknown>][] = [
    ["pageview", { page: "about" }],
    ["pageview", { page: "faq" }],
    ["pageview", { page: "build" }],
    ["step", { detail: "game", stepIndex: 0 }],
    ["step", { detail: "rewards" }],
    ["step", { detail: "review" }],
    ["disc", { region: "jp", discId: "ULJM05500", ok: true }],
    ["settings_load", { detail: "string", ok: true }],
    ["run_start", { dryRun: true, detail: "review", settings: settingsString }],
    ["run_done", { dryRun: true }],
    ["run_done", { dryRun: false, detail: "preview" }],
    ["download", { detail: "iso" }],
  ];
  for (let tries = 0; tries < 20 && !expected.every(([e, m]) => sent(e, m)); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const [event, match] of expected) {
    assert.ok(sent(event, match), `sent ${event} ${JSON.stringify(match)}`);
  }
  const browserFacts = { host: "randomfu.test", country: "", userAgent: "Mozilla/5.0 Chrome/130" };
  for (const event of events) {
    assert.ok(toDataPoint(event, browserFacts), `the Worker keeps ${JSON.stringify(event)}`);
    assert.equal(typeof event.session, "string");
  }
  assert.equal(new Set(events.map((e) => e.session)).size, 1, "one tab, one session");

  assert.deepEqual(errors, []);
  console.log(
    `Web app end to end: the downloaded ISO matches the Node run's byte for byte; ${events.length} analytics events sent.`,
  );
} finally {
  await browser.close();
  server.close();
}
