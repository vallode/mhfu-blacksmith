import path from "path";
import { gameDataDir } from "game-data";
import { MHFU_GAME } from "game-data/games";

/**
 * The monorepo root. The site's commands (`next build`, `pnpm test`, the
 * scripts) run from apps/blacksmith, so it's two levels up.
 */
export const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

/** The game data in `data/`, shared with packages/mhfu-extract. */
export const DATA_DIR = path.join(REPO_ROOT, "data");

/** The game the site shows: MHFU, the only one with data so far. */
export const GAME = MHFU_GAME.code;

/** That game's data: `data/mhfu/` (game-data's `gameDataDir`). */
export const GAME_DATA_DIR = gameDataDir(DATA_DIR, GAME);
