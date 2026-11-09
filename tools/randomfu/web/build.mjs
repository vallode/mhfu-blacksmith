/**
 * Builds the randomfu web app into web/dist: index.html (with the settings
 * page's styles inlined), app.js and worker.js. Node-only modules the shared
 * code imports are swapped for the browser versions in web/shims.
 *
 *   node web/build.mjs
 */
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(web);
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

const page = readFileSync(path.join(root, "src", "gui", "page.html"), "utf8");
const style = page.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if (!style) throw new Error("Couldn't find the settings page's styles");
const html = readFileSync(path.join(web, "index.html"), "utf8").replace("/*STYLE*/", style.trim());
writeFileSync(path.join(dist, "index.html"), html);
copyFileSync(path.join(root, "LICENSE"), path.join(dist, "LICENSE.txt"));
console.log(`Built ${path.relative(process.cwd(), dist)}`);
