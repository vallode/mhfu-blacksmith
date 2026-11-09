/**
 * End-to-end check of the web app in a real browser: builds web/dist,
 * serves it, uploads the test fixture disc and EBOOT, randomizes with every
 * shuffle on, downloads the ISO and compares it byte for byte with the CLI's
 * output for the same settings. Needs Playwright's Chromium.
 *
 *   pnpm test:web
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Iso9660Reader } from "../../mhfu-extract/src/container/iso9660.js";
import { FileSource } from "../../mhfu-extract/src/container/source.js";
import { runRandomizer } from "../src/run.js";
import { applySettings, defaultSettings, encodeSettings, PRESETS } from "../src/settings.js";
import { buildFixtureDisc, tempDir } from "../test/fixtures.js";

const web = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(web, "dist");
execFileSync(process.execPath, [path.join(web, "build.mjs")], { stdio: "inherit" });

const dir = tempDir();
const isoPath = path.join(dir, "MHFU test disc.iso");
writeFileSync(isoPath, buildFixtureDisc());
const ebootPath = path.join(dir, "ULES01213_EBOOT.BIN");
const source = new FileSource(isoPath);
writeFileSync(ebootPath, new Iso9660Reader(source).readFile("/PSP_GAME/SYSDIR/EBOOT.BIN"));
source.close();

// Everything on, as the Chaos preset, but keeping recipe logic so the run is checked.
const chaos = PRESETS.find((p) => p.name === "Chaos")!;
const settings = applySettings(defaultSettings("WEB-E2E"), {
  ...chaos.changes,
  "logic.tiers": "star",
});
const settingsString = encodeSettings(settings);

// The CLI's output for the same settings.
const cliOut = path.join(dir, "cli.iso");
await runRandomizer(
  { iso: isoPath, out: cliOut, settings, eboot: ebootPath, force: true },
  () => {},
);

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
  await page.waitForSelector("[data-key='shops.pool']");

  await page.setInputFiles("#iso", isoPath);
  await page.setInputFiles("#eboot", ebootPath);
  await page.waitForFunction(() =>
    /supported/.test(document.getElementById("check-status")!.textContent ?? ""),
  );
  const check = await page.textContent("#check-status");
  assert.match(check!, /ULJM05500 \(JP\) is supported\. EBOOT: decrypted/);

  await page.fill("#paste", settingsString);
  await page.click("#apply-paste");
  assert.equal(
    await page.inputValue("#share"),
    settingsString,
    "the page reproduces the settings string",
  );

  await page.click("#dry-run");
  await page.waitForSelector("#spoiler-wrap:not([hidden])");
  assert.match((await page.textContent("#run-status"))!, /Preview ready/);

  await page.click("#run");
  await page.waitForFunction(
    () => /^Done/.test(document.getElementById("run-status")!.textContent ?? ""),
    null,
    {
      timeout: 60_000,
    },
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#downloads a:first-child button"),
  ]);
  assert.equal(download.suggestedFilename(), "MHFU test disc (randomfu WEB-E2E).iso");
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
