#!/usr/bin/env node
// Links this worktree's packages/mhfu-extract/.cache to the main checkout's
// cache, so `unpack`, `extract`, `diff` and `export-site` find the unpacked
// disc and extracted output without copying a few GB. The cache is gitignored.
//
//   pnpm link:cache                 link this worktree to the main checkout
//   pnpm link:cache <cache-dir>     link to another .cache directory
//   pnpm link:cache --dry-run       only print what would happen
//
// MHFU_CACHE is used as <cache-dir> when no argument is given. Inside the
// main checkout there is nothing to link; its .cache is already the source.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const explicit = args.find((arg) => !arg.startsWith("--"));

function git(...argv) {
  return execFileSync("git", argv, { encoding: "utf8" }).trim();
}

const worktreeRoot = path.resolve(git("rev-parse", "--show-toplevel"));
const commonDir = path.resolve(worktreeRoot, git("rev-parse", "--git-common-dir"));
const mainRoot = path.basename(commonDir) === ".git" ? path.dirname(commonDir) : worktreeRoot;

const source = path.resolve(
  explicit ?? process.env.MHFU_CACHE ?? path.join(mainRoot, "packages/mhfu-extract/.cache"),
);
const target = path.join(worktreeRoot, "packages/mhfu-extract/.cache");

if (source === target) {
  console.log(`No link needed: this checkout's cache is already ${target}.`);
} else if (!existsSync(source)) {
  console.error(
    `No cache at ${source}.\n` +
      `Unpack a disc there first, or pass the main checkout's .cache:\n` +
      `  pnpm link:cache "${path.join(mainRoot, "packages/mhfu-extract/.cache")}"`,
  );
  process.exitCode = 1;
} else if (existsSync(target) || isSymlink(target)) {
  const current = isSymlink(target) ? readlinkSync(target) : "(a real directory)";
  if (isSymlink(target) && path.resolve(path.dirname(target), current) === source) {
    console.log(`Already linked: ${target} -> ${source}`);
  } else {
    console.error(
      `${target} already exists (${current}); not replacing it.\n` +
        `Remove it yourself if it should point at ${source}.`,
    );
    process.exitCode = 1;
  }
} else if (dryRun) {
  console.log(`Would link ${target} -> ${source}`);
} else {
  mkdirSync(path.dirname(target), { recursive: true });
  symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
  console.log(`Linked ${target} -> ${source}`);
  console.log("unpack/extract now default to it; --unpacked and --extracted still win.");
}

function isSymlink(file) {
  try {
    return lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}
