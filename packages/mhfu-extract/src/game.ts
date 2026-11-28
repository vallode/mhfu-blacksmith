/**
 * The game this pipeline reads: MHFU (MHP2G, the `mhp2g` profile in
 * `src/games/`). `--data` is the repository's `data/` directory, whatever
 * the game; the pipeline reads and writes this game's part of it,
 * `data/mhfu/` (game-data's `gameDataDir`).
 */
import type { DataGameCode } from "game-data/games";

export const GAME = "mhfu" satisfies DataGameCode;
