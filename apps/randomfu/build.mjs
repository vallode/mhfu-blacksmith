/**
 * Builds the randomfu web app into dist/: index.html (with style.css
 * inlined), app.js, worker.js and the few images and the font it shares with
 * the MHFU Blacksmith site. Node-only modules the shared code imports are
 * swapped for the browser versions in shims/.
 *
 * The look comes from the site (apps/blacksmith): its design tokens (the
 * `@theme` block) and its in-game frames are read from its
 * src/app/globals.css, and its sprites and font are copied from its public/,
 * so the two stay in step.
 *
 *   pnpm build
 */
import { build } from "esbuild";
import postcss from "postcss";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(web, "..", "blacksmith");
const dist = path.join(web, "dist");
const shim = (name) => path.join(web, "shims", name);
const unavailable = shim("unavailable.ts");

mkdirSync(dist, { recursive: true });
await build({
  entryPoints: { app: path.join(web, "app.ts"), worker: path.join(web, "worker.ts") },
  outdir: dist,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: true,
  legalComments: "linked",
  inject: [shim("buffer-global.ts")],
  // The shared code finds its vendored files relative to its own module; any path will do,
  // since the fs shim serves them by name.
  define: { "import.meta.url": JSON.stringify("file:///randomfu/bundle.js") },
  alias: {
    "node:crypto": shim("crypto.ts"),
    "node:fs": shim("fs.ts"),
    "node:path": shim("path.ts"),
    "node:url": shim("url.ts"),
    "node:fs/promises": unavailable,
    "node:child_process": unavailable,
    "node:os": unavailable,
    "node:util": unavailable,
    "node:zlib": unavailable,
  },
  loader: { ".csv": "text", ".enum": "text" },
  logLevel: "warning",
});

// ---------------------------------------------------------------- the site's look

// Parsed rather than pattern-matched, so the file's formatting doesn't matter.
const globals = postcss.parse(readFileSync(path.join(site, "src", "app", "globals.css"), "utf8"));

/** The site's design tokens: every custom property declared directly in its `@theme` block. */
function siteTokens() {
  let theme;
  globals.walkAtRules("theme", (rule) => {
    theme = rule;
  });
  if (!theme) throw new Error("Couldn't find the @theme block in globals.css");
  const tokens = (theme.nodes ?? [])
    .filter((node) => node.type === "decl" && node.prop.startsWith("--"))
    .map((decl) => `${decl.prop}: ${decl.value};`);
  if (!tokens.some((t) => t.startsWith("--color-stat:"))) {
    throw new Error("The @theme block in globals.css has no colour tokens");
  }
  return tokens;
}

/** The image of one of the site's `@utility` rules (its in-game frames and divider). */
function utilityImage(name) {
  let url;
  globals.walkAtRules("utility", (rule) => {
    if (rule.params.trim() !== name) return;
    rule.walkDecls((decl) => {
      url ??= decl.value.match(/url\(\s*["']?(data:image\/png;base64,[^"')]+)/)?.[1];
    });
  });
  if (!url) throw new Error(`Couldn't find the image of @utility ${name} in globals.css`);
  return url;
}

const images = {
  "--image-card-frame": utilityImage("card-frame"),
  "--image-card-frame-teal": utilityImage("card-frame-teal"),
  "--image-divider": utilityImage("divider-tile"),
};
const rootRule = [
  ":root {",
  ...siteTokens().map((t) => `  ${t}`),
  ...Object.entries(images).map(([name, url]) => `  ${name}: url("${url}");`),
  "}",
].join("\n");

const style = readFileSync(path.join(web, "style.css"), "utf8");
const html = readFileSync(path.join(web, "index.html"), "utf8").replace(
  "/*STYLE*/",
  `${rootRule}\n${style.trim()}`,
);
writeFileSync(path.join(dist, "index.html"), html);

// Sprites, background and font from the site's public/ folder.
const assets = [
  "fonts/biz-udgothic-latin-400-normal.woff2",
  "fonts/biz-udgothic-OFL.txt",
  "images/bg.png",
  "images/arrow.png",
  "images/loading.gif",
  "images/binoculars.png",
  "images/seed.png",
  "images/star.png",
  "images/claw.png",
  "images/ore.png",
  "images/part.png",
  "images/hammer.png",
  "images/coin.png",
  "images/deco.png",
  "images/ticket.png",
  "images/max.png",
  "images/favicons/felyne-favicon.png",
];
for (const asset of assets) {
  mkdirSync(path.join(dist, path.dirname(asset)), { recursive: true });
  copyFileSync(path.join(site, "public", asset), path.join(dist, asset));
}
copyFileSync(path.join(web, "LICENSE"), path.join(dist, "LICENSE.txt"));
console.log(`Built ${path.relative(process.cwd(), dist)}`);
