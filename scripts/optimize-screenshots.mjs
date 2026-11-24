#!/usr/bin/env node
// Optimizes the in-game reference captures and checks their size.
//
//   pnpm screenshots:optimize              every PNG in docs/screenshots
//   pnpm screenshots:optimize --dry-run    check them, change nothing
//   pnpm screenshots:optimize <path>...    files or directories instead
//
// Captures must be PNG at 960x544: the PSP screen at twice its native
// resolution. oxipng is lossless, so the pixels stay as captured; it only
// rewrites the file smaller. Install it with `brew install oxipng`.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_DIR = path.join(ROOT, "docs/screenshots");
const WIDTH = 960;
const HEIGHT = 544;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const help = args.includes("--help") || args.includes("-h");
const inputs = args.filter((arg) => !arg.startsWith("-"));

if (help) {
  console.log(`Usage: pnpm screenshots:optimize [--dry-run] [path...]`);
  process.exit(0);
}

const targets = inputs.length > 0 ? inputs : [DEFAULT_DIR];

/** Every .png under the given files and directories. */
function findPngs(target) {
  const stat = statSync(target, { throwIfNoEntry: false });
  if (!stat) throw new Error(`No such file or directory: ${target}`);
  if (stat.isFile()) return target.endsWith(".png") ? [target] : [];
  return readdirSync(target, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const child = path.join(target, entry.name);
      return entry.isDirectory() ? findPngs(child) : entry.name.endsWith(".png") ? [child] : [];
    });
}

/** The width and height in a PNG's IHDR chunk, or null if it isn't a PNG. */
function pngSize(file) {
  const bytes = readFileSync(file);
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

let oxipng = true;
try {
  execFileSync("oxipng", ["--version"], { stdio: "ignore" });
} catch {
  oxipng = false;
}

const files = targets.flatMap(findPngs);
if (files.length === 0) {
  console.error("No PNG files found.");
  process.exit(1);
}
if (!oxipng && !dryRun) {
  console.error("oxipng is not installed. Install it with `brew install oxipng`.");
  process.exit(1);
}

let failures = 0;
let optimized = 0;

for (const file of files) {
  const relative = path.relative(process.cwd(), file);
  const shown = relative.startsWith("..") ? file : relative;
  const size = pngSize(file);
  if (!size) {
    console.error(`${shown}: not a PNG`);
    failures += 1;
    continue;
  }
  if (size.width !== WIDTH || size.height !== HEIGHT) {
    console.error(`${shown}: ${size.width}x${size.height}, expected ${WIDTH}x${HEIGHT}`);
    failures += 1;
    continue;
  }
  if (dryRun) continue;
  try {
    execFileSync("oxipng", ["-o", "max", "--strip", "all", "--quiet", file], { stdio: "inherit" });
    optimized += 1;
  } catch {
    console.error(`${shown}: oxipng failed`);
    failures += 1;
  }
}

if (dryRun) {
  console.log(`Checked ${files.length} PNG${files.length === 1 ? "" : "s"} at ${WIDTH}x${HEIGHT}.`);
} else {
  console.log(`Optimized ${optimized} of ${files.length} PNG${files.length === 1 ? "" : "s"}.`);
}

if (failures > 0) process.exit(1);
