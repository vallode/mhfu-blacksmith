/**
 * End-to-end check of the web app in a real browser: builds dist/,
 * serves it, uploads the test fixture disc, randomizes with every
 * shuffle on, downloads the ISO and compares it byte for byte with the CLI's
 * output for the same settings. Needs Playwright's Chromium.
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
import { buildFixtureDisc, tempDir } from "randomfu/test/fixtures.js";

const web = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(web, "dist");
execFileSync(process.execPath, [path.join(web, "build.mjs")], { stdio: "inherit" });

const dir = tempDir();
// The disc's EBOOT is encrypted, as on a real disc, so the app decrypts it itself.
const isoPath = path.join(dir, "MHFU test disc.iso");
writeFileSync(isoPath, buildFixtureDisc({ ebootTag: 0xc0cb167c })); // a real disc's tag

// Everything on, as the Chaos preset, but keeping recipe logic so the run is checked.
const chaos = PRESETS.find((p) => p.name === "Chaos")!;
const settings = applySettings(defaultSettings("WEB-E2E"), {
  ...chaos.changes,
  "logic.tiers": "star",
  // Not in a preset until they're tried on a real disc.
  "questMonsters.species": true,
  "questMonsters.difficulty": true,
  "questMonsters.smallCounts": true,
  "monsterStats.hp": true,
  "monsterStats.size": true,
  "monsterStats.status": true,
  "weaknesses.elements": true,
  "weaknesses.parts": true,
});
const settingsString = encodeSettings(settings);

// The CLI's output for the same disc and settings: it decrypts the EBOOT in-process too.
const cliOut = path.join(dir, "cli.iso");
await runRandomizer({ iso: isoPath, out: cliOut, settings, force: true }, () => {});

const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".map": "application/json",
};
const server = http.createServer((req, res) => {
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
  await page.goto(url);
  await page.waitForSelector("[data-key='shops.pool']", { state: "attached" });
  const title = () => page.textContent("#step-title");

  // Step 1: the disc. Next waits for one.
  assert.equal(await title(), "Your game");
  await page.click("#next");
  assert.match((await page.textContent("#nav-status"))!, /Pick your disc image first/);
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
  assert.equal(await title(), "Seed");
  assert.ok(await page.isVisible("#skip"), "the options can be skipped without shared settings");
  await page.click("#load summary");
  await page.fill("#paste", settingsString);
  await page.click("#apply-paste");
  assert.match((await page.textContent("#share-status"))!, /Loaded the settings string/);

  // Through every option step to the review.
  for (const name of [
    "Logic",
    "Rewards",
    "Gathering",
    "Quests",
    "Monsters",
    "Smithy",
    "Shops",
    "Review",
  ]) {
    await page.click("#next");
    assert.equal(await title(), name);
  }
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
  const fromCli = readFileSync(cliOut);
  assert.equal(fromWeb.length, fromCli.length);
  assert.ok(fromWeb.equals(fromCli), "the web app's ISO is byte for byte the CLI's");
  assert.ok(!fromWeb.equals(readFileSync(isoPath)));
  const spoiler = (await page.textContent("#spoiler"))!;
  assert.match(spoiler, /Settings: RF/);

  assert.deepEqual(errors, []);
  console.log("Web app end to end: the downloaded ISO matches the CLI's byte for byte.");
} finally {
  await browser.close();
  server.close();
}
