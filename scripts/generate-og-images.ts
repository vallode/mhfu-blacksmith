/**
 * Screenshots each weapon's preview page (src/app/og/blacksmith/[type]/[slug])
 * into public/og/blacksmith/<type>/<slug>.<ext>, the link-preview image the
 * weapon page uses when the file exists (see previewImage in src/lib/seo.ts).
 *
 * Needs the site running (`pnpm dev`) and a Playwright Chromium
 * (`npx playwright install chromium`, once). Then:
 *
 *   pnpm generate-og                          # every weapon
 *   pnpm generate-og long-sword/ dual-blades/firestorm   # only these (prefix match)
 *
 * Options: --base-url (default http://localhost:3000), --concurrency (4),
 * --format jpeg|png (jpeg), --quality (90, jpeg only).
 */
import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { chromium, type Page } from "playwright";
import { WEAPON_TYPES } from "../src/lib/constants";
import { getWeapons } from "../src/lib/weapons";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "base-url": { type: "string", default: "http://localhost:3000" },
    concurrency: { type: "string", default: "4" },
    format: { type: "string", default: "jpeg" },
    quality: { type: "string", default: "90" },
  },
});

const baseUrl = values["base-url"]!.replace(/\/$/, "");
const format = values.format === "png" ? "png" : "jpeg";
const ext = format === "png" ? "png" : "jpg";
const outDir = path.join(process.cwd(), "public", "og", "blacksmith");

const routes = WEAPON_TYPES.flatMap((type) =>
  getWeapons(type).map((w) => `${type}/${w.slug}`),
).filter((r) => positionals.length === 0 || positionals.some((p) => r.startsWith(p)));

async function render(page: Page, route: string) {
  const res = await page.goto(`${baseUrl}/og/blacksmith/${route}/`, { waitUntil: "load" });
  if (!res?.ok()) throw new Error(`${route}: HTTP ${res?.status()}`);
  // Hide the Next.js dev badge, and wait for the font and every sprite.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  });

  const file = path.join(outDir, `${route}.${ext}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({
    path: file,
    type: format,
    quality: format === "jpeg" ? Number(values.quality) : undefined,
    clip: { x: 0, y: 0, width: 1200, height: 600 },
  });
  // Drop an image left over from another format, so only one is picked up.
  for (const other of ["png", "jpg", "webp"]) {
    if (other !== ext) fs.rmSync(path.join(outDir, `${route}.${other}`), { force: true });
  }
}

async function main() {
  console.log(`Rendering ${routes.length} preview images from ${baseUrl}…`);
  const browser = await chromium.launch();
  const queue = [...routes];
  const failed: string[] = [];
  let done = 0;
  const started = Date.now();

  await Promise.all(
    Array.from({ length: Number(values.concurrency) }, async () => {
      const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });
      for (let route = queue.shift(); route; route = queue.shift()) {
        try {
          await render(page, route);
        } catch (err) {
          failed.push(route);
          console.error(String(err));
        }
        if (++done % 50 === 0 || done === routes.length) {
          const secs = Math.round((Date.now() - started) / 1000);
          console.log(`${done}/${routes.length} (${secs}s)`);
        }
      }
    }),
  );

  await browser.close();
  if (failed.length) {
    console.error(`${failed.length} failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main();
