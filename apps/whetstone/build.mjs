/**
 * Builds the Whetstone web app into dist/: its pages (index.html, the about
 * page; faq.html; and build.html, the builder), each with style.css inlined,
 * the builder's app.js and worker.js, and the few images and the font it
 * shares with the MHFU Blacksmith site. The masthead's wordmark
 * (whetstone.png) spells WHETSTONE from the game's title-screen alphabet, and
 * its logomark (whetstone-icon.png) is the game's Whetstone item sprite in the
 * item's yellow, with the letters' shadow; the favicons are the logomark too. Node-only modules the shared code
 * imports are swapped for the browser versions in shims/.
 *
 * The look comes from the site (apps/blacksmith): its design tokens (the
 * `@theme` block) and its in-game frames are read from its
 * src/app/globals.css, and its sprites and font are copied from its public/,
 * so the two stay in step.
 *
 * The Quality of life step's preview of the gathering-node map takes its
 * nodes from data/gathering.json and the marker look from Whetstone's patch
 * (node-map-preview.ts), and its map picture from the site's public/.
 *
 *   pnpm build
 *
 * It imports TypeScript (game-data, whetstone), so it runs under tsx:
 * `node --import tsx build.mjs`.
 */
import { build } from "esbuild";
import postcss from "postcss";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readData } from "game-data";
import {
  MAP_SIZE,
  MARKER_COLORS,
  MARKER_SIZE,
  ON_ART_ALPHA,
} from "whetstone/src/patches/node-map.js";
import { nodeMapPoints } from "./node-map-preview.ts";

const web = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(web, "..", "blacksmith");
const dist = path.join(web, "dist");
const shim = (name) => path.join(web, "shims", name);
const dataDir = path.resolve(web, "..", "..", "data");

// The Quality of life step's gathering-node map preview (NODE_MAP_PREVIEW in app.ts): the Great Forest.
const previewTexture = "map30";
const nodeMapPreview = {
  texture: previewTexture,
  size: MAP_SIZE,
  marker: MARKER_SIZE,
  onArtAlpha: ON_ART_ALPHA,
  colors: MARKER_COLORS,
  points: nodeMapPoints(readData(dataDir, "gathering.json"), previewTexture),
};

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
  logLevel: "warning",
  inject: [shim("buffer-global.ts")],
  // The shared code finds its vendored files relative to its own module; any path will do,
  // since the fs shim serves them by name.
  define: {
    "import.meta.url": JSON.stringify("file:///whetstone/bundle.js"),
    NODE_MAP_PREVIEW: JSON.stringify(nodeMapPreview),
  },
  alias: {
    "node:crypto": shim("crypto.ts"),
    "node:fs": shim("fs.ts"),
    "node:path": shim("path.ts"),
    "node:url": shim("url.ts"),
  },
  loader: { ".csv": "text", ".enum": "text" },
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

// ---------------------------------------------------------------- the pages

const style = readFileSync(path.join(web, "style.css"), "utf8");
const head = readFileSync(path.join(web, "head.html"), "utf8");
const masthead = readFileSync(path.join(web, "masthead.html"), "utf8");
/** A partial without the comment it opens with. */
const withoutComment = (partial) => partial.replace(/^<!--[\s\S]*?-->\s*/, "");

/**
 * The pages: the about page, the FAQ and the builder, each with head.html
 * and masthead.html in place of their <!--HEAD--> and <!--MASTHEAD-->, and
 * its own link in the masthead marked as the current page. They sit side by
 * side in dist/ so the builder's relative paths (images/, worker.js) hold.
 */
const pages = { "index.html": "./", "faq.html": "faq.html", "build.html": "build.html" };
for (const [page, href] of Object.entries(pages)) {
  const source = readFileSync(path.join(web, page), "utf8");
  for (const mark of ["<!--HEAD-->", "<!--MASTHEAD-->"]) {
    if (!source.includes(mark)) throw new Error(`${page} has no ${mark}`);
  }
  const link = `<a href="${href}">`;
  if (!masthead.includes(link)) throw new Error(`masthead.html has no link to ${page}`);
  const html = source
    .replace("<!--HEAD-->", withoutComment(head))
    .replace("<!--MASTHEAD-->", withoutComment(masthead))
    .replace(link, `<a href="${href}" aria-current="page">`)
    .replace("/*STYLE*/", `${rootRule}\n${style.trim()}`);
  writeFileSync(path.join(dist, page), html);
}

// Sprites, background and font from the site's public/ folder.
const assets = [
  "fonts/biz-udgothic-latin-400-normal.woff2",
  "fonts/biz-udgothic-OFL.txt",
  "images/bg.png",
  "images/arrow.png",
  "images/loading.gif",
  // The steps, the option sections' headings (steps.ts) and the about page's features.
  "images/binoculars.png",
  "images/star.png",
  "images/ticket.png",
  "images/max.png",
  "images/fluid.png",
  "images/dragon.png",
  "images/note.png",
  "images/deco.png",
  "images/sac.png",
  "images/ore.png",
  "images/herb.png",
  "images/great-sword.png",
  "images/scroll.png",
  "images/ko.png",
  "images/fire.png",
  "images/meat.png",
  "images/egg.png",
  "images/cycle.png",
  "images/heavenly.png",
  "images/crown-gold.png",
  "images/monsters/felyne.png",
  "images/monsters/rathalos.png",
  "images/monsters/flying-wyvern.png",
  "images/monsters/elder-dragon.png",
  // The gathering-node map preview's picture.
  `images/area-maps/${previewTexture}.png`,
];
for (const asset of assets) {
  mkdirSync(path.join(dist, path.dirname(asset)), { recursive: true });
  copyFileSync(path.join(site, "public", asset), path.join(dist, asset));
}
for (const image of [
  "whetstone.png",
  "whetstone-icon.png",
  "whetstone-favicon.png",
  "whetstone-apple-touch-icon.png",
]) {
  copyFileSync(path.join(web, image), path.join(dist, "images", image));
}
copyFileSync(path.join(web, "LICENSE"), path.join(dist, "LICENSE.txt"));
console.log(`Built ${path.relative(process.cwd(), dist)}`);
