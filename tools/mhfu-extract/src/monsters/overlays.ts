/**
 * Loads the monster overlays from an `unpack`ed directory. `unpack` keeps
 * the vendored file names for both JP and EU (`filelist-eu.json` maps the EU
 * indexes), so they are always `data-bin/overlay/game_task.ovl` and
 * `game_sub.ovl`. Hitzones, tolerances and rewards are all in those two; the
 * per-monster `emXX.ovl` files aren't needed.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseOvl, type OvlFile } from "../container/ovl.js";

export interface MonsterOverlays {
  gameTask: OvlFile;
  gameSub: OvlFile;
}

export const OVERLAY_DIR = path.join("data-bin", "overlay");

export async function loadMonsterOverlays(unpackedDir: string): Promise<MonsterOverlays> {
  const dir = path.join(unpackedDir, OVERLAY_DIR);
  const load = async (name: string) => parseOvl(await readFile(path.join(dir, name)));
  return { gameTask: await load("game_task.ovl"), gameSub: await load("game_sub.ovl") };
}
