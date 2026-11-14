#!/usr/bin/env node
// Deletes the disc images (*.iso) left in Claude Code session scratchpads,
// close to 1 GB each. Discs written in the last two hours are kept, since a
// running session may still use them.
//
//   pnpm clean:discs              delete them
//   pnpm clean:discs --dry-run    only list them
//   pnpm clean:discs <dir>        look in <dir> instead of the scratchpads
import { readdirSync, rmSync, statSync } from "node:fs";
import { platform, userInfo } from "node:os";
import path from "node:path";

const KEEP_MS = 2 * 60 * 60 * 1000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const root =
  args.find((a) => !a.startsWith("--")) ??
  path.join(platform() === "darwin" ? "/private/tmp" : "/tmp", `claude-${userInfo().uid}`);

function* discs(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* discs(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".iso")) yield full;
  }
}

const now = Date.now();
let bytes = 0;
let count = 0;
let kept = 0;
for (const file of discs(root)) {
  const { size, mtimeMs } = statSync(file);
  if (now - mtimeMs < KEEP_MS) {
    kept++;
    continue;
  }
  console.log(`${dryRun ? "would delete" : "deleted"} ${file}`);
  if (!dryRun) rmSync(file, { force: true });
  bytes += size;
  count++;
}

const gb = (bytes / 1024 ** 3).toFixed(1);
console.log(
  `${dryRun ? "Would free" : "Freed"} ${gb} GB from ${count} disc(s) under ${root}` +
    (kept ? `; kept ${kept} written in the last two hours.` : "."),
);
