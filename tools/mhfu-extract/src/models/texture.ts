/**
 * Texture encoding for .glb output: whichever is smaller of lossless WebP
 * (EXT_texture_webp) and a palette PNG (png.ts).
 *
 * Lossless WebP keeps every visible pixel exactly; libwebp may change the
 * colour stored under fully transparent pixels (sharp exposes no "exact"
 * switch), which only matters at the edge of alpha cut-outs.
 *
 * `quality` (lossy, 0-100) first re-quantizes the palette with libimagequant
 * to the fewest colours that reach that quality, without dithering so pixel
 * art stays crisp. (sharp passes libimagequant a bit depth, not a colour
 * count, so a quality target is the only fine-grained control it offers.)
 */
import sharp from "sharp";
import { encodePng } from "./png.js";
import type { TmhImage } from "./tmh.js";

export interface TextureOptions {
  /** Allow WebP output (EXT_texture_webp). Default true. */
  webp?: boolean;
  /** Lossy: libimagequant quality target (0-100) for re-quantizing the palette. Default: none (lossless). */
  quality?: number;
}

export interface EncodedTexture {
  data: Buffer;
  mimeType: "image/png" | "image/webp";
}

async function requantize(image: TmhImage, quality: number): Promise<Buffer> {
  const raw = { width: image.width, height: image.height, channels: 4 as const };
  const png = await sharp(image.rgba, { raw })
    .png({ palette: true, quality, dither: 0, effort: 10 })
    .toBuffer();
  return sharp(png).ensureAlpha().raw().toBuffer();
}

export async function encodeTexture(
  image: TmhImage,
  options: TextureOptions = {},
): Promise<EncodedTexture> {
  const rgba =
    options.quality !== undefined && options.quality < 100
      ? await requantize(image, options.quality)
      : image.rgba;
  const png = encodePng(image.width, image.height, rgba);
  if (options.webp === false) return { data: png, mimeType: "image/png" };
  const webp = await sharp(rgba, { raw: { width: image.width, height: image.height, channels: 4 } })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  return webp.length < png.length
    ? { data: webp, mimeType: "image/webp" }
    : { data: png, mimeType: "image/png" };
}
