/**
 * `item-icons` subcommand — slices the item icons out of the UI atlas into
 * one PNG per shape, `item-<iconId>.png`, for the site's `public/images/`.
 * `tables/item-icons.ts` has the tables it reads.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BinaryReader } from "../binary/reader.js";
import { MHP2G_PROFILE } from "../games/mhp2g.js";
import { encodePng } from "../models/png.js";
import { readTmh, type TmhImage } from "../models/tmh.js";
import { ITEM_ICON_ATLAS, readItemIconRects, type IconRect } from "../tables/item-icons.js";
import { assertCurrentFileNames, type UnpackManifest } from "./unpack.js";

/** The shape whose "?" every shape no item uses shares. */
const UNUSED_SHAPE_SPRITE = 33;

export interface ItemIconsOptions {
  /** An `unpack` output directory, with `eboot.bin` and `data-bin/`. */
  unpacked: string;
  /** Output directory, normally the site's `apps/blacksmith/public/images/`. */
  out: string;
}

/** One rectangle of an image, as RGBA8. */
export function cropImage(image: TmhImage, rect: IconRect): Buffer {
  const out = Buffer.alloc(rect.width * rect.height * 4);
  for (let row = 0; row < rect.height; row++) {
    const start = ((rect.y + row) * image.width + rect.x) * 4;
    image.rgba.copy(out, row * rect.width * 4, start, start + rect.width * 4);
  }
  return out;
}

export async function runItemIcons(options: ItemIconsOptions): Promise<number> {
  const manifest = JSON.parse(
    await readFile(path.join(options.unpacked, "manifest.json"), "utf-8"),
  ) as UnpackManifest;
  assertCurrentFileNames(manifest, options.unpacked);
  const resolver = MHP2G_PROFILE.resolverForRegion(manifest.region);
  if (!resolver) throw new Error(`No table addresses for region "${manifest.region}".`);

  const reader = new BinaryReader(await readFile(path.join(options.unpacked, "eboot.bin")));
  const rects = readItemIconRects(reader, resolver);
  const atlasFile = path.join(options.unpacked, "data-bin", ITEM_ICON_ATLAS.file);
  const atlas = readTmh(await readFile(atlasFile))[ITEM_ICON_ATLAS.image];
  if (!atlas) throw new Error(`${ITEM_ICON_ATLAS.file} has no image ${ITEM_ICON_ATLAS.image}.`);

  await mkdir(options.out, { recursive: true });
  // Shapes no item uses point at shape 33's "?"; only that one gets a file.
  const fallback = rects[UNUSED_SHAPE_SPRITE]!;
  let written = 0;
  for (const [id, rect] of rects.entries()) {
    if (id !== UNUSED_SHAPE_SPRITE && rect.x === fallback.x && rect.y === fallback.y) continue;
    const png = encodePng(rect.width, rect.height, cropImage(atlas, rect));
    await writeFile(path.join(options.out, `item-${id}.png`), png);
    written++;
  }
  return written;
}
