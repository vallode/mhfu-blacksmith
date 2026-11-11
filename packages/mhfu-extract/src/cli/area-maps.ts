/**
 * `area-maps` subcommand — writes each map's texture as a PNG,
 * `area-maps/map<N>.png`, for the site's `public/images/`.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { encodePng } from "../models/png.js";
import { readTmh } from "../models/tmh.js";

export interface AreaMapsOptions {
  /** An `unpack` output directory. */
  unpacked: string;
  /** Output directory, normally the site's `apps/blacksmith/public/images/`. */
  out: string;
}

/** `map11_1` and `map11_2` are partial pictures of map 11, used by nothing here. */
const AREA_MAP_FILE = /^map\d+\.tmh$/;

export async function runAreaMaps(options: AreaMapsOptions): Promise<number> {
  const dir = path.join(options.unpacked, "data-bin", "cockpit");
  const out = path.join(options.out, "area-maps");
  await mkdir(out, { recursive: true });
  let written = 0;
  for (const file of (await readdir(dir)).filter((name) => AREA_MAP_FILE.test(name))) {
    const image = readTmh(await readFile(path.join(dir, file)))[0];
    if (!image) throw new Error(`${file} has no image.`);
    const name = `${path.basename(file, ".tmh")}.png`;
    await writeFile(path.join(out, name), encodePng(image.width, image.height, image.rgba));
    written++;
  }
  return written;
}
