import fs from "fs";
import path from "path";
import ReactDOM from "react-dom";

// Top-level files in public/images that are not icon sprites (backgrounds,
// screenshots, large art, spinners). Everything else in that directory is a
// small sprite used by <Icon>, either as an <img> or as a CSS mask/background
// on ::before/::after, which the browser would otherwise only discover (and
// fetch) after the element renders — that is what causes the icons to pop in.
const NOT_ICONS = new Set([
  "bg.png",
  "blacksmith.png",
  "blacksmith-scaled.png",
  "loading.gif",
  "mhfu__card.png",
  "not-found.png",
  "screenshot.png",
  "scroll.png",
  "scroll-short.png",
]);

function iconUrls(): string[] {
  const dir = path.join(process.cwd(), "public", "images");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".png") && !NOT_ICONS.has(e.name))
    .map((e) => `/images/${e.name}`)
    .sort();
}

/**
 * Emits <link rel="preload" as="image"> tags (hoisted into <head> by React)
 * for every icon sprite so they are fetched with the HTML instead of when the
 * first element using them is painted. Server component: runs at build time
 * for the static export, ships no client JS.
 */
export default function PreloadIcons() {
  for (const href of iconUrls()) {
    ReactDOM.preload(href, { as: "image" });
  }
  return null;
}
