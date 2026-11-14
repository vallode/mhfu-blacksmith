/**
 * `area-maps` subcommand: writes the map textures `data/gathering.json` uses
 * as PNGs, `area-maps/map<N>.png`, for the site's `public/images/`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { encodePng } from "../models/png.js";
import { readTmh } from "../models/tmh.js";
import { mapTextureFile } from "../tables/map-layout.js";
import { readData } from "game-data";

export interface AreaMapsOptions {
  /** An `unpack` output directory. */
  unpacked: string;
  /** The directory holding `gathering.json`. */
  data: string;
  /** Output directory, normally the site's `apps/blacksmith/public/images/`. */
  out: string;
}

export async function runAreaMaps(options: AreaMapsOptions): Promise<number> {
  const { layouts } = readData<{ layouts: { texture?: string }[] }>(options.data, "gathering.json");
  const textures = new Set(layouts.flatMap((layout) => layout.texture ?? []));
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
