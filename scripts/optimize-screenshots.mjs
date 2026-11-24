#!/usr/bin/env node
// Optimizes the in-game reference captures and checks their size.
//
//   pnpm screenshots:optimize              every PNG in docs/screenshots
//   pnpm screenshots:optimize --dry-run    check them, change nothing
//   pnpm screenshots:optimize <path>...    files or directories instead
//
// Captures must be PNG at 960x544: the PSP screen at twice its native
// resolution. oxipng is lossless, so the pixels stay as captured; it only
// rewrites the file smaller. Install it first (for example, with
// `brew install oxipng`).
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
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
const unknown = args.find(
  (arg) => arg.startsWith("-") && !["--dry-run", "--help", "-h"].includes(arg),
);

if (help) {
  console.log(`Usage: pnpm screenshots:optimize [--dry-run] [path...]`);
  process.exit(0);
}

if (unknown) {
  console.error(`Unknown option: ${unknown}`);
  process.exit(1);
}

const targets = inputs.length > 0 ? inputs : [DEFAULT_DIR];

/** Whether a name ends in .png, in any case. */
const isPng = (name) => name.toLowerCase().endsWith(".png");

/** Every .png under the given files and directories. */
function findPngs(target) {
  const stat = statSync(target, { throwIfNoEntry: false });
  if (!stat) throw new Error(`No such file or directory: ${target}`);
  if (stat.isFile()) return isPng(target) ? [target] : [];
  return readdirSync(target, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const child = path.join(target, entry.name);
      return entry.isDirectory() ? findPngs(child) : isPng(entry.name) ? [child] : [];
    });
}

/** The width and height in a PNG's IHDR chunk, or null if it isn't a PNG. */
function pngSize(file) {
  const bytes = Buffer.alloc(24);
  const fd = openSync(file, "r");
  let read;
  try {
    read = readSync(fd, bytes, 0, bytes.length, 0);
  } finally {
    closeSync(fd);
  }
  const signature = "89504e470d0a1a0a";
  if (read < bytes.length || bytes.subarray(0, 8).toString("hex") !== signature) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

let oxipng = true;
try {
  execFileSync("oxipng", ["--version"], { stdio: "ignore" });
} catch {
  oxipng = false;
}

let files;
try {
  files = targets.flatMap(findPngs);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
if (files.length === 0) {
  console.error("No PNG files found.");
  process.exit(1);
}
if (!oxipng && !dryRun) {
  console.error(
    "oxipng is not installed. Install it first (for example, with `brew install oxipng`).",
  );
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
    execFileSync("oxipng", ["-o", "max", "--strip", "safe", "--quiet", file], { stdio: "inherit" });
    optimized += 1;
  } catch {
    console.error(`${shown}: oxipng failed`);
    failures += 1;
  }
}

const noun = files.length === 1 ? "PNG" : "PNGs";
if (dryRun) {
  if (failures > 0) console.error(`Checked ${files.length} ${noun}; ${failures} failed.`);
  else console.log(`Checked ${files.length} ${noun} at ${WIDTH}x${HEIGHT}.`);
} else if (failures > 0) {
  console.error(`${optimized} of ${files.length} ${noun} optimized; ${failures} failed.`);
} else {
  console.log(`Optimized ${files.length} ${noun}.`);
}

if (failures > 0) process.exit(1);
