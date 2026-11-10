/**
 * Renders social-card.png, the 1200×630 picture link previews (Discord,
 * Bluesky, Slack, …) show for the app; index.html points og:image at it and
 * build.mjs copies it into dist/. It's drawn by the built page itself, its
 * background, font, design tokens and teal frame, with the card's markup in
 * place of the app's, so it follows the site's look. Rerun it after changing
 * that look or the wording below, and commit the PNG. Needs Playwright's
 * Chromium.
 *
 *   pnpm social-card
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(web, "dist");
const out = path.join(web, "social-card.png");
execFileSync(process.execPath, [path.join(web, "build.mjs")], { stdio: "inherit" });

/** The steps' sprites and tints (STEPS in app.ts), in order. */
const SPRITES: [string, string?][] = [
  ["binoculars"],
  ["seed", "gem-green"],
  ["star"],
  ["claw", "gem-red"],
  ["ore", "gem-blue"],
  ["herb", "gem-green"],
  ["part", "gem-orange"],
  ["hammer"],
  ["coin", "gem-yellow"],
  ["ticket", "parchment"],
  ["max"],
];

const CARD = `
<div class="card">
  <h1 class="masthead-title card-title">Randomfu</h1>
  <hr class="divider card-divider" />
  <div class="frame card-frame">
    <div class="card-sprites">
      ${SPRITES.map(
        ([icon, tint]) =>
          `<span class="icon" style="--icon: url(images/${icon}.png)` +
          (tint ? `; --tint: var(--color-${tint})` : "") +
          `"></span>`,
      ).join("")}
    </div>
    <p class="card-text">Shuffle rewards, monsters, quests and shops</p>
    <p class="card-note">Runs in your browser, on your own disc.</p>
  </div>
</div>`;

const STYLE = `
body { padding: 0; overflow: hidden; }
body::before { background-color: #1b2016; }
.card {
  position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center;
  background: rgb(0 0 0 / 0.3);
}
.card-title { margin-top: 86px; font-size: 96px; letter-spacing: 0.35em; }
.card-divider { margin: 36px calc(50% - 50vw) 0; }
.card-frame {
  width: 1040px; max-width: none; margin-top: 36px; padding: 30px 40px 28px;
  display: flex; flex-direction: column; align-items: center; gap: 18px;
}
.card-sprites { display: flex; gap: 20px; }
.card-sprites .icon { width: 60px; height: 60px; }
.card-text, .card-note { margin: 0; text-align: center; text-shadow: 0.2rem 0.2rem 0 black; }
.card-text { font-size: 30px; color: white; }
.card-note { font-size: 24px; color: var(--color-parchment); }
`;

const types: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".png": "image/png",
  ".woff2": "font/woff2",
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
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  // Only the page's look is wanted, not the app.
  await page.route("**/*.js", (route: { abort(): Promise<void> }) => route.abort());
  await page.goto(url);
  await page.evaluate(
    ({ card, style }: { card: string; style: string }) => {
      document.body.innerHTML = card;
      const sheet = document.createElement("style");
      sheet.textContent = style;
      document.head.append(sheet);
    },
    { card: CARD, style: STYLE },
  );
  // The sprites are CSS backgrounds, so wait for the network rather than the <img>s.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
} finally {
  await browser.close();
  server.close();
}
