/**
 * The gunner forge's texture: the texels of each source texture its parts
 * actually draw with, packed into the frame's 64x64 texture.
 *
 * `atlas.ts` packs one box per source model, the span of every part taken
 * from it. A gunner part's texture is scattered over most of its 64x64
 * texture, so two or three donors' boxes only fit at half size.
 *
 * Here each UV island (triangles joined by shared texture coordinates)
 * keeps the shape of the texels its triangles cover, plus a texel of
 * border for filtering. Islands that share texels merge, and the shapes
 * are fitted together like puzzle pieces: texel for texel when they fit,
 * else all scaled down by the same factor until they do. On the EU disc
 * that keeps a mashup's textures at about 0.75 of their size, against 0.5
 * for the boxes: the parts' texels together often outnumber the 64x64.
 */
import type { TmhImage } from "mhfu-extract/src/models/tmh.js";
import { applyMaterial, type Rgba } from "./atlas.js";
import type { PartChunk } from "./parts.js";

/** What one placed part draws with: its source texture, recolour and strips. */
export interface IslandSource {
  /** Parts with the same key share texels (same source texture and material). */
  key: string;
  image: TmhImage;
  material: string | null;
  chunks: readonly PartChunk[];
}

export interface IslandAtlas {
  /** Row-major RGBA8, `size` wide and `height` tall. */
  rgba: Buffer;
  size: number;
  height: number;
  /** The scale the islands were packed at (1 = texel for texel). */
  scale: number;
  /** A source texture coordinate of `key`'s parts, in the atlas. */
  place: (key: string, uv: readonly [number, number]) => [number, number];
}

/** Texels of border kept around each island, so filtering sees its own neighbours. */
const BORDER = 1;

/** An island: the texels of one source texture it draws with. */
interface Island {
  key: string;
  image: TmhImage;
  material: string | null;
  /** Source texel box, [x0, x1) by [y0, y1). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Source texels drawn (with border), row-major over the whole image. */
  mask: Uint8Array;
}

const uvKey = (uv: readonly [number, number]) => `${uv[0]},${uv[1]}`;

/** Marks the texels triangle `t` (texel units) touches: its edges and the centres inside it. */
function rasterize(mask: Uint8Array, width: number, height: number, t: [number, number][]) {
  const mark = (x: number, y: number) => {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx >= 0 && ty >= 0 && tx < width && ty < height) mask[ty * width + tx] = 1;
  };
  for (let e = 0; e < 3; e++) {
    const [ax, ay] = t[e]!;
    const [bx, by] = t[(e + 1) % 3]!;
    const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 4) + 1;
    for (let s = 0; s <= steps; s++)
      mark(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
  }
  const xs = t.map((p) => p[0]);
  const ys = t.map((p) => p[1]);
  const side = (a: [number, number], b: [number, number], x: number, y: number) =>
    (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  for (
    let y = Math.max(0, Math.floor(Math.min(...ys)));
    y <= Math.min(height - 1, Math.max(...ys));
    y++
  ) {
    for (
      let x = Math.max(0, Math.floor(Math.min(...xs)));
      x <= Math.min(width - 1, Math.max(...xs));
      x++
    ) {
      const w = [0, 1, 2].map((e) => side(t[e]!, t[(e + 1) % 3]!, x + 0.5, y + 0.5));
      if (w.every((v) => v >= 0) || w.every((v) => v <= 0)) mask[y * width + x] = 1;
    }
  }
}

/** `mask` grown by `BORDER` texels each way. */
function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -BORDER; dy <= BORDER; dy++) {
        for (let dx = -BORDER; dx <= BORDER; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) out[ny * width + nx] = 1;
        }
      }
    }
  }
  return out;
}

/** Sets the island's box to its mask's. */
function fitBox(island: Island) {
  const { width, height } = island.image;
  island.x0 = width;
  island.y0 = height;
  island.x1 = 0;
  island.y1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!island.mask[y * width + x]) continue;
      island.x0 = Math.min(island.x0, x);
      island.y0 = Math.min(island.y0, y);
      island.x1 = Math.max(island.x1, x + 1);
      island.y1 = Math.max(island.y1, y + 1);
    }
  }
}

/** Merges the islands for which `overlap` holds, transitively; returns each one's merged index. */
function mergeWhere(
  islands: Island[],
  overlap: (a: Island, b: Island) => boolean,
  union: (into: Island, from: Island) => void,
): { merged: Island[]; of: number[] } {
  const parent = islands.map((_, i) => i);
  const top = (i: number): number => (parent[i] === i ? i : (parent[i] = top(parent[i]!)));
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < islands.length; i++) {
      if (top(i) !== i) continue;
      for (let j = i + 1; j < islands.length; j++) {
        if (top(j) !== j || islands[i]!.key !== islands[j]!.key) continue;
        if (!overlap(islands[i]!, islands[j]!)) continue;
        union(islands[i]!, islands[j]!);
        parent[j] = i;
        changed = true;
      }
    }
  }
  const merged: Island[] = [];
  const index = new Map<number, number>();
  islands.forEach((island, i) => {
    if (top(i) === i) index.set(i, merged.push(island) - 1);
  });
  return { merged, of: islands.map((_, i) => index.get(top(i))!) };
}

const boxesOverlap = (a: Island, b: Island) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function masksOverlap(a: Island, b: Island): boolean {
  if (!boxesOverlap(a, b)) return false;
  const { width } = a.image;
  for (let y = Math.max(a.y0, b.y0); y < Math.min(a.y1, b.y1); y++) {
    for (let x = Math.max(a.x0, b.x0); x < Math.min(a.x1, b.x1); x++) {
      if (a.mask[y * width + x] && b.mask[y * width + x]) return true;
    }
  }
  return false;
}

/** Each key's islands (no two sharing a texel), and which island each texture coordinate is in. */
function findIslands(sources: readonly IslandSource[]): {
  islands: Island[];
  islandOf: Map<string, Map<string, number>>;
} {
  const byKey = new Map<string, IslandSource[]>();
  for (const s of sources) (byKey.get(s.key) ?? byKey.set(s.key, []).get(s.key)!).push(s);

  const raw: Island[] = [];
  const rawOf = new Map<string, Map<string, number>>();
  for (const [key, group] of byKey) {
    const { image, material } = group[0]!;
    const { width, height } = image;
    // Union-find over texture coordinates: a triangle joins its corners, a strip all of its.
    const parent = new Map<string, string>();
    const find = (a: string): string => {
      let root = a;
      while (parent.get(root) !== root) root = parent.get(root)!;
      for (let at = a; at !== root;) {
        const next = parent.get(at)!;
        parent.set(at, root);
        at = next;
      }
      return root;
    };
    const triangles: { keys: string[]; uv: [number, number][] }[] = [];
    for (const { chunks } of group) {
      for (const chunk of chunks) {
        for (const strip of chunk.strips) {
          const uvs = strip.indices.map((i) => chunk.vertices[i]!.uv);
          const keys = uvs.map(uvKey);
          for (const k of keys) if (!parent.has(k)) parent.set(k, k);
          const fan = strip.prim === 5;
          const list = strip.prim === 3;
          for (let i = 0; i + 2 < keys.length; i += list ? 3 : 1) {
            const corners = fan ? [0, i + 1, i + 2] : [i, i + 1, i + 2];
            triangles.push({
              keys: corners.map((c) => keys[c]!),
              uv: corners.map((c) => [uvs[c]![0] * width, uvs[c]![1] * height]),
            });
          }
          // A strip too short for a triangle still has its texels.
          if (keys.length < 3) {
            const uv = uvs.map((u): [number, number] => [u[0] * width, u[1] * height]);
            triangles.push({ keys, uv: [uv[0]!, uv.at(-1)!, uv.at(-1)!] });
          }
        }
      }
    }
    for (const t of triangles)
      for (const k of t.keys.slice(1)) parent.set(find(k), find(t.keys[0]!));

    const roots = new Map<string, number>();
    const masks: Uint8Array[] = [];
    for (const t of triangles) {
      const root = find(t.keys[0]!);
      let i = roots.get(root);
      if (i === undefined) roots.set(root, (i = masks.push(new Uint8Array(width * height)) - 1));
      rasterize(masks[i]!, width, height, t.uv);
    }
    const base = raw.length;
    for (const mask of masks) {
      const island: Island = {
        key,
        image,
        material,
        x0: 0,
        y0: 0,
        x1: 0,
        y1: 0,
        mask: dilate(mask, width, height),
      };
      fitBox(island);
      raw.push(island);
    }
    rawOf.set(key, new Map([...parent.keys()].map((k) => [k, base + roots.get(find(k))!])));
  }

  // Islands sharing texels (a texture drawn twice) become one, placed once.
  const { merged, of } = mergeWhere(raw, masksOverlap, (into, from) => {
    for (let k = 0; k < into.mask.length; k++) into.mask[k] ||= from.mask[k]!;
    fitBox(into);
  });
  const islandOf = new Map(
    [...rawOf].map(([key, m]) => [key, new Map([...m].map(([k, i]) => [k, of[i]!]))]),
  );
  return { islands: merged, islandOf };
}

/** An island at a scale: its box's size and the destination texels it fills. */
interface Shape {
  w: number;
  h: number;
  /** Row-major over the box: whether the texel is the island's. */
  mask: Uint8Array;
  /** Each row as two 32-bit words, bit x = texel x. */
  rows: [number, number][];
  area: number;
}

/**
 * `island` scaled by `scale`: a destination texel is the island's if any
 * source texel it stands for is, and stands for the source texel at its
 * centre.
 */
function shapeOf(island: Island, scale: number): Shape {
  const bw = island.x1 - island.x0;
  const bh = island.y1 - island.y0;
  const w = Math.max(1, Math.ceil(bw * scale - 1e-9));
  const h = Math.max(1, Math.ceil(bh * scale - 1e-9));
  const { width } = island.image;
  const mask = new Uint8Array(w * h);
  const rows: [number, number][] = [];
  let area = 0;
  for (let py = 0; py < h; py++) {
    const sy0 = Math.floor((py * bh) / h);
    const sy1 = Math.max(sy0 + 1, Math.ceil(((py + 1) * bh) / h));
    let lo = 0;
    let hi = 0;
    for (let px = 0; px < w; px++) {
      const sx0 = Math.floor((px * bw) / w);
      const sx1 = Math.max(sx0 + 1, Math.ceil(((px + 1) * bw) / w));
      let on = false;
      for (let sy = sy0; sy < sy1 && !on; sy++) {
        for (let sx = sx0; sx < sx1 && !on; sx++) {
          on = island.mask[(island.y0 + sy) * width + island.x0 + sx] === 1;
        }
      }
      if (!on) continue;
      mask[py * w + px] = 1;
      area++;
      if (px < 32) lo |= 1 << px;
      else hi |= 1 << (px - 32);
    }
    rows.push([lo >>> 0, hi >>> 0]);
  }
  return { w, h, mask, rows, area };
}

/** A row of up to 64 texels as two 32-bit words, shifted left by `x`. */
function shiftRow([lo, hi]: [number, number], x: number): [number, number] {
  if (x === 0) return [lo, hi];
  if (x < 32) return [(lo << x) >>> 0, ((hi << x) | (lo >>> (32 - x))) >>> 0];
  return [0, (lo << (x - 32)) >>> 0];
}

/**
 * Fits the shapes into `size` by `height` (`size` at most 64) in `order`, each at
 * the first spot it fits: the top-left corner of each one's box, or
 * null if one doesn't fit.
 */
function packShapes(
  shapes: readonly Shape[],
  size: number,
  order: readonly number[],
  height = size,
): { x: number; y: number }[] | null {
  const occupied = Array.from({ length: height }, () => [0, 0]);
  const spots: { x: number; y: number }[] = [];
  for (const i of order) {
    const { w, h, rows } = shapes[i]!;
    if (w > size || h > height) return null;
    let spot: { x: number; y: number } | null = null;
    for (let y = 0; y + h <= height && !spot; y++) {
      for (let x = 0; x + w <= size && !spot; x++) {
        let free = true;
        for (let r = 0; r < h && free; r++) {
          const [lo, hi] = shiftRow(rows[r]!, x);
          const at = occupied[y + r]!;
          free = (lo & at[0]!) === 0 && (hi & at[1]!) === 0;
        }
        if (free) spot = { x, y };
      }
    }
    if (!spot) return null;
    for (let r = 0; r < h; r++) {
      const [lo, hi] = shiftRow(rows[r]!, spot.x);
      const at = occupied[spot.y + r]!;
      at[0] = (at[0]! | lo) >>> 0;
      at[1] = (at[1]! | hi) >>> 0;
    }
    spots[i] = spot;
  }
  return spots;
}

/** Orders the shapes are tried in, biggest first by each measure. */
const ORDERS: ((s: Shape) => number)[] = [
  (s) => s.area,
  (s) => s.h * 64 + s.w,
  (s) => s.w * 64 + s.h,
  (s) => s.w * s.h,
];

/**
 * Packs the islands of `sources` into one `size` by `height` texture, their
 * shapes all scaled down by the same factor until they fit (full size,
 * texel for texel, when they do); null if they never do.
 */
export function packIslands(
  sources: readonly IslandSource[],
  size = 64,
  height = size,
  /** The smallest scale to try before giving up. */
  least = 0.2,
): IslandAtlas | null {
  const { islands, islandOf } = findIslands(sources);
  for (let scale = 1; scale >= least; scale *= 0.97) {
    const shapes = islands.map((island) => shapeOf(island, scale));
    // Not even the texels' count fits: skip the search.
    if (shapes.reduce((n, s) => n + s.area, 0) > size * height) continue;
    let spots: { x: number; y: number }[] | null = null;
    for (const by of ORDERS) {
      const order = shapes.map((_, i) => i).sort((a, b) => by(shapes[b]!) - by(shapes[a]!));
      spots ??= packShapes(shapes, size, order, height);
    }
    if (!spots) continue;
    const rgba = Buffer.alloc(size * height * 4);
    islands.forEach((island, i) => {
      const { x, y } = spots[i]!;
      const { w, h, mask } = shapes[i]!;
      const bw = island.x1 - island.x0;
      const bh = island.y1 - island.y0;
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          if (!mask[py * w + px]) continue;
          const sx = island.x0 + Math.min(bw - 1, Math.floor(((px + 0.5) * bw) / w));
          const sy = island.y0 + Math.min(bh - 1, Math.floor(((py + 0.5) * bh) / h));
          const s = (sy * island.image.width + sx) * 4;
          let color = [...island.image.rgba.subarray(s, s + 4)] as Rgba;
          if (island.material) color = applyMaterial(color, island.material);
          rgba.set(color, ((y + py) * size + x + px) * 4);
        }
      }
    });
    const place = (key: string, uv: readonly [number, number]): [number, number] => {
      const i = islandOf.get(key)?.get(uvKey(uv));
      if (i === undefined) throw new Error(`no island for ${key} at ${uv.join(",")}`);
      const island = islands[i]!;
      const { w, h } = shapes[i]!;
      return [
        (spots[i]!.x + ((uv[0] * island.image.width - island.x0) * w) / (island.x1 - island.x0)) /
          size,
        (spots[i]!.y + ((uv[1] * island.image.height - island.y0) * h) / (island.y1 - island.y0)) /
          height,
      ];
    };
    return { rgba, size, height, scale, place };
  }
  return null;
}
