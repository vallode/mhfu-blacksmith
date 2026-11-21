/**
 * The forged weapon's one texture: the regions its parts use from each
 * source model's texture, packed into the frame model's 64x64 8-bit
 * texture, optionally recoloured with a material, and quantized to its
 * 256-colour palette.
 */
import {
  encodeDirectColor,
  locateIndexedImage,
  swizzle,
  type TmhImage,
} from "mhfu-extract/src/models/tmh.js";

export type Rgba = [number, number, number, number];

/**
 * Materials as luminance ramps, dark to light (as Starbound's weapon
 * colour swaps and Tinkers' Construct's part materials do): a pixel takes
 * the ramp's colour at its brightness, mixed with its own.
 */
export const MATERIALS: Readonly<Record<string, readonly [number, number, number][]>> = {
  gold: [
    [60, 35, 5],
    [170, 120, 30],
    [255, 220, 120],
  ],
  obsidian: [
    [10, 5, 20],
    [60, 40, 90],
    [170, 150, 220],
  ],
  bone: [
    [70, 60, 40],
    [190, 175, 140],
    [250, 245, 225],
  ],
  ruby: [
    [50, 0, 10],
    [170, 20, 40],
    [255, 140, 150],
  ],
  jade: [
    [0, 40, 25],
    [40, 150, 90],
    [190, 255, 210],
  ],
  frost: [
    [20, 40, 80],
    [110, 170, 230],
    [235, 250, 255],
  ],
  rust: [
    [40, 20, 10],
    [130, 65, 30],
    [210, 150, 90],
  ],
  steel: [
    [30, 32, 38],
    [120, 125, 135],
    [230, 235, 245],
  ],
};

/** How much of the ramp's colour a recoloured pixel takes. */
const MATERIAL_STRENGTH = 0.75;

export function applyMaterial(rgba: Rgba, material: string): Rgba {
  const ramp = MATERIALS[material];
  if (!ramp) return rgba;
  const lum = (0.299 * rgba[0] + 0.587 * rgba[1] + 0.114 * rgba[2]) / 255;
  const at = lum * (ramp.length - 1);
  const i = Math.min(Math.floor(at), ramp.length - 2);
  const f = at - i;
  const target = [0, 1, 2].map((k) => ramp[i]![k]! * (1 - f) + ramp[i + 1]![k]! * f);
  return [
    ...[0, 1, 2].map((k) =>
      Math.round(rgba[k]! * (1 - MATERIAL_STRENGTH) + target[k]! * MATERIAL_STRENGTH),
    ),
    rgba[3],
  ] as Rgba;
}

/** A region of one source texture the forged weapon uses. */
export interface AtlasRegion {
  image: TmhImage;
  uvMin: [number, number];
  uvMax: [number, number];
  material: string | null;
  /** Its texels' share of the source's size (1 when omitted): its parts' scale, for parts drawn smaller. */
  density?: number;
}

export interface Atlas {
  /** Row-major RGBA8, `size` square. */
  rgba: Buffer;
  size: number;
  /** For each region, in order: a source texture coordinate's place in the atlas. */
  place: ((uv: [number, number]) => [number, number])[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Shelf-packs `sizes` into a `size` square, tallest first; null if they don't fit. */
function shelfPack(sizes: readonly [number, number][], size: number): Rect[] | null {
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b]![1] - sizes[a]![1]);
  const rects: Rect[] = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const i of order) {
    const [w, h] = sizes[i]!;
    if (w > size) return null;
    if (x + w > size) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    if (y + h > size) return null;
    rects[i] = { x, y, w, h };
    x += w;
    shelf = Math.max(shelf, h);
  }
  return rects;
}

/**
 * Packs the regions into one `size` square texture, each scaled down by
 * the same factor until they fit. Pixels are sampled nearest.
 */
export function packAtlas(regions: readonly AtlasRegion[], size = 64): Atlas | null {
  for (let scale = 1; scale >= 0.2; scale *= 0.9) {
    const sizes = regions.map((r): [number, number] => [
      Math.max(
        2,
        Math.min(
          size,
          Math.ceil((r.uvMax[0] - r.uvMin[0]) * r.image.width * scale * (r.density ?? 1)),
        ),
      ),
      Math.max(
        2,
        Math.min(
          size,
          Math.ceil((r.uvMax[1] - r.uvMin[1]) * r.image.height * scale * (r.density ?? 1)),
        ),
      ),
    ]);
    const rects = shelfPack(sizes, size);
    if (!rects) continue;
    const rgba = Buffer.alloc(size * size * 4);
    regions.forEach((region, i) => {
      const { x, y, w, h } = rects[i]!;
      const { image } = region;
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const u = region.uvMin[0] + ((px + 0.5) / w) * (region.uvMax[0] - region.uvMin[0]);
          const v = region.uvMin[1] + ((py + 0.5) / h) * (region.uvMax[1] - region.uvMin[1]);
          const sx = Math.min(image.width - 1, Math.max(0, Math.floor(u * image.width)));
          const sy = Math.min(image.height - 1, Math.max(0, Math.floor(v * image.height)));
          const s = (sy * image.width + sx) * 4;
          let color = [...image.rgba.subarray(s, s + 4)] as Rgba;
          if (region.material) color = applyMaterial(color, region.material);
          rgba.set(color, ((y + py) * size + x + px) * 4);
        }
      }
    });
    const place = regions.map((region, i) => {
      const { x, y, w, h } = rects[i]!;
      const du = region.uvMax[0] - region.uvMin[0] || 1;
      const dv = region.uvMax[1] - region.uvMin[1] || 1;
      // Inset half a texel so filtering doesn't reach the neighbouring region.
      return ([u, v]: [number, number]): [number, number] => [
        (x + 0.5 + ((u - region.uvMin[0]) / du) * (w - 1)) / size,
        (y + 0.5 + ((v - region.uvMin[1]) / dv) * (h - 1)) / size,
      ];
    });
    return { rgba, size, place };
  }
  return null;
}

/**
 * Up to `max` colours standing for `colors` (weighted by use), and which
 * of them each input colour becomes: median cut, splitting the box with the
 * widest channel at its weighted median.
 */
export function reduceColors(
  colors: readonly { rgba: Rgba; count: number }[],
  max: number,
): { palette: Rgba[]; index: number[] } {
  if (colors.length <= max) {
    return { palette: colors.map((c) => c.rgba), index: colors.map((_, i) => i) };
  }
  let boxes: number[][] = [colors.map((_, i) => i)];
  const widest = (box: number[]): { channel: number; range: number } => {
    let best = { channel: 0, range: -1 };
    for (let channel = 0; channel < 4; channel++) {
      const values = box.map((i) => colors[i]!.rgba[channel]!);
      const range = Math.max(...values) - Math.min(...values);
      if (range > best.range) best = { channel, range };
    }
    return best;
  };
  while (boxes.length < max) {
    const splittable = boxes
      .map((box, i) => ({ i, ...widest(box) }))
      .filter((b) => boxes[b.i]!.length > 1 && b.range > 0);
    if (splittable.length === 0) break;
    const { i, channel } = splittable.reduce((a, b) => (b.range > a.range ? b : a));
    const box = [...boxes[i]!].sort(
      (a, b) => colors[a]!.rgba[channel]! - colors[b]!.rgba[channel]!,
    );
    const total = box.reduce((sum, c) => sum + colors[c]!.count, 0);
    let cut = 1;
    for (let seen = colors[box[0]!]!.count; cut < box.length - 1 && seen * 2 < total; cut++) {
      seen += colors[box[cut]!]!.count;
    }
    boxes = [...boxes.slice(0, i), box.slice(0, cut), box.slice(cut), ...boxes.slice(i + 1)];
  }
  const index: number[] = [];
  const palette = boxes.map((box, b) => {
    const total = box.reduce((sum, c) => sum + colors[c]!.count, 0);
    for (const c of box) index[c] = b;
    return [0, 1, 2, 3].map((k) =>
      Math.round(box.reduce((sum, c) => sum + colors[c]!.rgba[k]! * colors[c]!.count, 0) / total),
    ) as Rgba;
  });
  return { palette, index };
}

/**
 * `tmh` (a single 8-bit palettized image of the atlas's size) with its
 * pixels and palette replaced by the atlas, or null if it isn't that layout.
 */
export function writeAtlas(tmh: Buffer, atlas: Atlas): Buffer | null {
  const at = locateIndexedImage(tmh);
  if (!at || at.width !== atlas.size || at.height !== atlas.size) return null;
  const keys = new Map<number, number>();
  const colors: { rgba: Rgba; count: number }[] = [];
  const pixels: number[] = [];
  for (let p = 0; p < atlas.size * atlas.size; p++) {
    const rgba = [...atlas.rgba.subarray(p * 4, p * 4 + 4)] as Rgba;
    const key = encodeDirectColor(rgba, at.paletteFormat);
    let color = keys.get(key);
    if (color === undefined) {
      color = colors.length;
      keys.set(key, color);
      colors.push({ rgba, count: 0 });
    }
    colors[color]!.count++;
    pixels.push(color);
  }
  const { palette, index } = reduceColors(colors, 256);
  const out = Buffer.from(tmh);
  const entryBytes = at.paletteFormat === 3 ? 4 : 2;
  out.fill(0, at.palette, at.palette + 256 * entryBytes);
  palette.forEach((rgba, i) => {
    const value = encodeDirectColor(rgba, at.paletteFormat);
    if (entryBytes === 4) out.writeUInt32LE(value, at.palette + i * 4);
    else out.writeUInt16LE(value, at.palette + i * 2);
  });
  const indexed = Buffer.from(pixels.map((color) => index[color]!));
  (at.swizzled ? swizzle(indexed, atlas.size, atlas.size) : indexed).copy(out, at.pixels);
  return out;
}
