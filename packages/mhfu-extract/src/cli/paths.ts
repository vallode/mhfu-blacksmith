/**
 * Where the extraction pipeline reads and writes by default.
 *
 * The unpacked disc and the extracted output take a few GB, so they live in
 * `packages/mhfu-extract/.cache/`, which `.gitignore` excludes and which a
 * fresh worktree does not get. `MHFU_CACHE` points every default below at
 * another checkout's cache; `pnpm link:cache` symlinks one instead.
 * `MHFU_DISC` supplies a default for `unpack --iso`.
 *
 * See README's "Where the disc and cache live".
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `packages/mhfu-extract`. */
const PACKAGE_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** The repository root. */
const REPO_ROOT = resolve(PACKAGE_ROOT, "../..");

export interface CachePaths {
  /** `MHFU_CACHE`, or this package's `.cache`. */
  root: string;
  /** The `unpack` output (`data-bin/`, `eboot.bin`, `manifest.json`). */
  unpacked: string;
  /** The `extract` output (`quests/`, `raw/`, `EXTRACTION.json`). */
  extracted: string;
  /** The downloadable quests `extract --dlc` takes. */
  dlc: string;
}

export function cachePaths(env: NodeJS.ProcessEnv = process.env): CachePaths {
  const root = resolve(env.MHFU_CACHE?.trim() || resolve(PACKAGE_ROOT, ".cache"));
  const unpacked = resolve(root, "mhfu");
  return {
    root,
    unpacked,
    extracted: resolve(unpacked, "extracted"),
    dlc: resolve(root, "dlc/ULES01213.ini"),
  };
}

/** `data/` at the repository root. */
export function defaultDataDir(): string {
  return resolve(REPO_ROOT, "data");
}

/** `apps/blacksmith/public/`, where the site's generated assets go. */
export function sitePublicDir(): string {
  return resolve(REPO_ROOT, "apps/blacksmith/public");
}

/** A disc image for `unpack --iso`, from `MHFU_DISC` (or `MHFU_ISO`). */
export function defaultDisc(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.MHFU_DISC?.trim() || env.MHFU_ISO?.trim() || undefined;
}
