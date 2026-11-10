import path from "path";

/**
 * The monorepo root. The site's commands (`next build`, `pnpm test`, the
 * scripts) run from apps/blacksmith, so it's two levels up.
 */
export const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

/** The game data in `data/`, shared with packages/mhfu-extract. */
export const DATA_DIR = path.join(REPO_ROOT, "data");
