/**
 * Writes public/_redirects, so the export (out/) has it: the URLs from before
 * languages and games, to their pages now (src/lib/redirects.ts). Run after
 * generate-data.ts, whose bundles moved out of public/data into its game's
 * directory.
 */
import fs from "fs";
import path from "path";
import { formatRedirects, legacyRedirects } from "../src/lib/redirects";
import { DEFAULT_SITE, dataPath } from "../src/lib/site";

const publicDir = path.join(process.cwd(), "public");
const gameDir = path.join(publicDir, dataPath(DEFAULT_SITE.game, ""));
const files = fs
  .readdirSync(gameDir)
  .filter((f) => f.endsWith(".json") && !f.startsWith("search-"))
  .sort();
const rules = legacyRedirects(files);
fs.writeFileSync(path.join(publicDir, "_redirects"), formatRedirects(rules));
console.log(`generate-redirects: ${rules.length} rules → public/_redirects`);
