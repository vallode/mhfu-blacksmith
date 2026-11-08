/**
 * Locates and reads every monster table in the overlays: `game_task.ovl`'s
 * chunks (hitzones, tolerances, base HP) and quest stat multipliers, and
 * `game_sub.ovl`'s reward tables.
 */
import { locateMonsterChunks, readMonsterChunks } from "./hitzones.js";
import { locateMultiplierTables, type MultiplierTables } from "./multipliers.js";
import type { MonsterOverlays } from "./overlays.js";
import {
  locateRewardTables,
  readCapBreakTables,
  readCarveTables,
  type RewardTableLocation,
} from "./rewards.js";
import type { MonsterTables } from "../emit/monsters.js";

export interface MonsterTablesWithLocations extends MonsterTables {
  /** Quest stat multipliers; null if the master list isn't found (selection still open, #35). */
  multipliers: MultiplierTables | null;
  locations: {
    /** File offset of `MonChunk[90]` and its shift from JP. */
    chunks: { offset: number; shift: number };
    rewards: RewardTableLocation;
  };
}

export class MonsterTableError extends Error {}

export function readMonsterTables(overlays: MonsterOverlays): MonsterTablesWithLocations {
  const chunksAt = locateMonsterChunks(overlays.gameTask);
  if (!chunksAt) throw new MonsterTableError("game_task.ovl: monster chunk array not found");
  const rewards = locateRewardTables(overlays.gameSub);
  if (!rewards)
    throw new MonsterTableError("game_sub.ovl: carve and cap/break pointer tables not found");
  return {
    chunks: readMonsterChunks(overlays.gameTask, chunksAt.offset),
    carves: readCarveTables(overlays.gameSub, rewards.carves),
    capBreak: readCapBreakTables(overlays.gameSub, rewards.capBreak),
    multipliers: locateMultiplierTables(overlays.gameTask),
    locations: { chunks: chunksAt, rewards },
  };
}
