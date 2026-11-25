/**
 * Writes the bot's search index to src/generated/index.json, which the
 * Worker bundles (src/worker.ts). Generated, so it isn't committed: the
 * typecheck, tests and deploy build run this first.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex } from "./index-data.js";

const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/generated/index.json",
);
const json = JSON.stringify(buildIndex());
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, json);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${(json.length / 1024).toFixed(0)} KB)`);
