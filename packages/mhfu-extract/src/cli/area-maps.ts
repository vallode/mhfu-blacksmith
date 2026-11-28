/**
 * `area-maps` subcommand: writes the game's map textures as PNGs,
 * `area-maps/map<N>.png`, for the site's `public/images/`. It writes every
 * map the cockpit has, not only the ones with gathering points, so a quest
 * with no gathering points (an arena fight, the Tower) still gets a Map tab.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { encodePng } from "../models/png.js";
import { readTmh } from "../models/tmh.js";
import { mapTextureFile } from "../tables/map-layout.js";
import { readData } from "game-data";
import { GAME } from "../game.js";

export interface AreaMapsOptions {
  /** An `unpack` output directory. */
  unpacked: string;
  /** The directory holding `gathering.json`. */
  data: string;
  /** Output directory, normally the site's `apps/blacksmith/public/images/`. */
  out: string;
}

export async function runAreaMaps(options: AreaMapsOptions): Promise<number> {
  const { layouts } = readData<{ layouts: { texture?: string }[] }>(
    options.data,
    GAME,
    "gathering.json",
  );
  const textures = new Set(layouts.flatMap((layout) => layout.texture ?? []));
  // Maps with no gathering points aren't in gathering.json: write their
  // textures too, as their quests still show a map.
  for (const file of await readdir(path.join(options.unpacked, "data-bin", "cockpit"))) {
    const match = /^map\d+\.tmh$/.exec(file);
    if (match) textures.add(match[0].slice(0, -".tmh".length));
  }
  const out = path.join(options.out, "area-maps");
  await mkdir(out, { recursive: true });
  for (const texture of textures) {
    const image = readTmh(await readFile(path.join(options.unpacked, mapTextureFile(texture))))[0];
    if (!image) throw new Error(`${texture} has no image.`);
    await writeFile(
      path.join(out, `${texture}.png`),
      encodePng(image.width, image.height, image.rgba),
    );
  }
  return textures.size;
}
