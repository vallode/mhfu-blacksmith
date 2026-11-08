import { ImageResponse } from "next/og";
import fs from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";
import type { ReactNode } from "react";

/**
 * Share cards (og:image / twitter:image), drawn at build time with next/og.
 *
 * satori can't read CSS variables or Tailwind, so the palette below repeats
 * the values from the @theme block in src/app/globals.css. Keep them in sync.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

export const OG_COLORS = {
  hr: "#6e905f",
  line: "#2a3423",
  gold: "#f2d250",
  stat: "#ffff50",
  positive: "#52f152",
  negative: "#f9455c",
  parchment: "#c3be9f",
  muted: "#c0c0c0",
  rarity: {
    4: "#52f152",
    5: "#fd9dc8",
    6: "#83c3fc",
    7: "#ff9661",
    8: "#fd6960",
    9: "#ffc762",
    10: "#bb84fb",
  } as Record<number, string>,
  gem: {
    blue: "#80c2fc",
    cyan: "#97e0ef",
    gray: "#a0a0a0",
    green: "#86bf8d",
    orange: "#ff9661",
    pink: "#ea9aa4",
    red: "#fd6960",
    slate: "#afa0c5",
    white: "#ffffff",
    yellow: "#ffc762",
  } as Record<string, string>,
  elements: {
    fire: "#fd6960",
    water: "#83c3fc",
    thunder: "#ffeb2b",
    ice: "#97e0ef",
    dragon: "#bb84fb",
  } as Record<string, string>,
};

/** The tint the site's icons get: rarity 4+ is coloured, a gem colour wins. */
export function tintFor(rarity?: number | null, gem?: string | null): string | undefined {
  if (gem && OG_COLORS.gem[gem]) return OG_COLORS.gem[gem];
  if (rarity && OG_COLORS.rarity[rarity]) return OG_COLORS.rarity[rarity];
  return undefined;
}

const publicDir = path.join(process.cwd(), "public");
const assetsDir = path.join(process.cwd(), "src", "assets");

let fontData: Buffer | undefined;
function font(): Buffer {
  fontData ??= fs.readFileSync(
    path.join(process.cwd(), "src", "assets", "fonts", "biz-udgothic-latin-400-normal.ttf"),
  );
  return fontData;
}

interface Decoded {
  width: number;
  height: number;
  /** RGBA, row by row. */
  rgba: Uint8Array;
}

/** Decodes a non-interlaced PNG (the sprites in public/images are all 1–8 bit). */
function decodePng(png: Buffer): Decoded {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const depth = png[24];
  const colorType = png[25];
  if (png[28] !== 0) throw new Error("Interlaced PNGs are not supported");

  const idat: Buffer[] = [];
  let palette: Uint8Array = Buffer.alloc(0);
  let trns: Uint8Array = Buffer.alloc(0);
  for (let pos = 8; pos < png.length;) {
    const len = png.readUInt32BE(pos);
    const type = png.toString("latin1", pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === "IDAT") idat.push(data);
    else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    pos += 12 + len;
  }

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType as 0 | 2 | 3 | 4 | 6];
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((width * channels * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0;
      const b = y > 0 ? px[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[dst + x] = v & 255;
    }
  }

  // One sample of channel `ch` at pixel x of row y, scaled to 0–255 (palette index for type 3).
  const sample = (x: number, y: number, ch: number): number => {
    if (depth === 8) return px[y * stride + x * channels + ch];
    if (depth === 16) return px[y * stride + (x * channels + ch) * 2];
    const bit = (x * channels + ch) * depth;
    const v = (px[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return colorType === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 3) {
        const i = sample(x, y, 0);
        rgba.set([palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2], trns[i] ?? 255], o);
      } else if (colorType === 0 || colorType === 4) {
        const g = sample(x, y, 0);
        rgba.set([g, g, g, colorType === 4 ? sample(x, y, 1) : 255], o);
      } else {
        const a = colorType === 6 ? sample(x, y, 3) : 255;
        rgba.set([sample(x, y, 0), sample(x, y, 1), sample(x, y, 2), a], o);
      }
    }
  }
  return { width, height, rgba };
}

const toUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** Runs of same-coloured cells, row by row, as SVG <rect>s (one unit per cell). */
function cellRects(
  cols: number,
  rows: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): string {
  const hex = (p: number[]) =>
    p
      .slice(0, 3)
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
  let out = "";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols;) {
      const p = pixel(x, y);
      if (p[3] < 128) {
        x++;
        continue;
      }
      const color = hex(p);
      let run = 1;
      while (x + run < cols) {
        const n = pixel(x + run, y);
        if (n[3] < 128 || hex(n) !== color) break;
        run++;
      }
      out += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="#${color}"/>`;
      x += run;
    }
  }
  return out;
}

const pixelAt =
  (d: Decoded) =>
  (x: number, y: number): [number, number, number, number] => {
    const o = (y * d.width + x) * 4;
    return [d.rgba[o], d.rgba[o + 1], d.rgba[o + 2], d.rgba[o + 3]];
  };

/**
 * The game's 9-slice card frame (`card-frame` in globals.css), drawn over the
 * page's pixel-art background. `slice` is border-image-slice (top, right,
 * bottom, left) and `scale` how many card pixels one frame pixel covers.
 */
const FRAME = { file: "card-frame.png", slice: [21, 22, 20, 22], scale: 2 } as const;

const MARGIN = 24;

/** Content insets: inside the frame's border, plus a little padding. */
const CONTENT = {
  top: MARGIN + FRAME.slice[0] * FRAME.scale + 20,
  right: MARGIN + FRAME.slice[1] * FRAME.scale + 26,
  bottom: MARGIN + FRAME.slice[2] * FRAME.scale + 20,
  left: MARGIN + FRAME.slice[3] * FRAME.scale + 26,
} as const;

let backdrop: string | undefined;
function backdropUri(): string {
  if (backdrop) return backdrop;
  const { width: W, height: H } = OG_SIZE;

  // Page background: bg.png at 3x, cropped to the middle.
  const bg = decodePng(fs.readFileSync(path.join(publicDir, "images", "bg.png")));
  const bgScale = 3;
  const cols = Math.ceil(W / bgScale);
  const rows = Math.ceil(H / bgScale);
  const ox = Math.floor((bg.width - cols) / 2);
  const oy = Math.floor((bg.height - rows) / 2);
  const bgPixel = pixelAt(bg);
  const page = cellRects(cols, rows, (x, y) => bgPixel(x + ox, y + oy));

  // Card frame: corners as drawn, edges and fill repeated (`slice ... fill`).
  const { file, slice, scale } = FRAME;
  const [T, R, B, L] = slice;
  const fr = decodePng(fs.readFileSync(path.join(assetsDir, file)));
  const gw = Math.floor((W - MARGIN * 2) / scale);
  const gh = Math.floor((H - MARGIN * 2) / scale);
  const map = (c: number, g: number, lo: number, hi: number, s: number) =>
    c < lo ? c : c >= g - hi ? s - (g - c) : lo + ((c - lo) % (s - lo - hi));
  const frPixel = pixelAt(fr);
  const frame = cellRects(gw, gh, (x, y) =>
    frPixel(map(x, gw, L, R, fr.width), map(y, gh, T, B, fr.height)),
  );

  backdrop = toUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">` +
      `<g transform="scale(${bgScale})">${page}</g>` +
      `<g transform="translate(${MARGIN} ${MARGIN}) scale(${scale})">${frame}</g></svg>`,
  );
  return backdrop;
}

interface SpriteImage {
  uri: string;
  width: number;
  height: number;
}

const spriteCache = new Map<string, SpriteImage>();

/**
 * A pixel-art sprite from public/ with square pixels, optionally multiplied by
 * a colour (as the in-game icon masks are). satori draws <img> smoothed and
 * ignores raster images nested in SVG, so the sprite is rebuilt from <rect>s.
 */
function spriteUri(file: string, tint?: string): SpriteImage {
  const key = `${file}|${tint ?? ""}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;

  const d = decodePng(fs.readFileSync(path.join(publicDir, file)));
  const mul = tint ? [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16) / 255) : [1, 1, 1];
  const px = pixelAt(d);
  const rects = cellRects(d.width, d.height, (x, y) => {
    const p = px(x, y);
    return [Math.round(p[0] * mul[0]), Math.round(p[1] * mul[1]), Math.round(p[2] * mul[2]), p[3]];
  });
  const result: SpriteImage = {
    uri: toUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" shape-rendering="crispEdges">${rects}</svg>`,
    ),
    width: d.width,
    height: d.height,
  };
  spriteCache.set(key, result);
  return result;
}

function Sprite({ src, tint, box }: { src: string; tint?: string; box: number }): ReactNode {
  const { uri, width, height } = spriteUri(src, tint);
  // Whole-number scale keeps the pixels square.
  const scale = Math.max(1, Math.floor(box / Math.max(width, height)));
  return <img src={uri} width={width * scale} height={height * scale} alt="" />;
}

export interface SpriteSpec {
  /** Path under public/, e.g. "/images/great-sword.png". */
  src: string;
  /** Hex colour multiplied over the sprite. */
  tint?: string;
}

/** A "Label: value" line like the game's stat lists: yellow label, white value. */
export interface Chip {
  label: string;
  value?: string;
  color?: string;
}

export interface OgCard {
  /** Gold line above the title: type, rank, rarity. */
  kicker: string;
  title: string;
  /** Wrapped text under the title (monster description, skills). */
  body?: string;
  chips?: Chip[];
  sprite?: SpriteSpec;
  /** Largest sprite size in pixels; defaults to 240. */
  spriteBox?: number;
}

function titleSize(title: string): number {
  if (title.length <= 14) return 84;
  if (title.length <= 20) return 68;
  if (title.length <= 28) return 54;
  return 44;
}

function ChipRow({ chips }: { chips: Chip[] }): ReactNode {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: 34, rowGap: 6, fontSize: 32 }}>
      {chips.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 12 }}>
          <span style={{ color: c.value ? OG_COLORS.stat : (c.color ?? "#ffffff") }}>
            {c.label}
            {c.value ? ":" : ""}
          </span>
          {c.value ? <span style={{ color: c.color ?? "#ffffff" }}>{c.value}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function renderOgCard(card: OgCard): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        fontFamily: "BIZ UDGothic",
        letterSpacing: "0.14em",
        color: "#ffffff",
      }}
    >
      <img
        src={backdropUri()}
        width={OG_SIZE.width}
        height={OG_SIZE.height}
        alt=""
        style={{ position: "absolute", left: 0, top: 0 }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: CONTENT.left,
          right: CONTENT.right,
          top: CONTENT.top,
          bottom: CONTENT.bottom,
          gap: 48,
          alignItems: "center",
        }}
      >
        {card.sprite ? (
          <div style={{ display: "flex", flexShrink: 0 }}>
            <Sprite {...card.sprite} box={card.spriteBox ?? 240} />
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
            gap: 14,
          }}
        >
          <div style={{ display: "flex", fontSize: 30, color: OG_COLORS.gold }}>{card.kicker}</div>
          <div
            style={{
              display: "flex",
              fontSize: titleSize(card.title),
              lineHeight: 1.1,
              letterSpacing: "0.04em",
              textShadow: "3px 3px 0 #000",
            }}
          >
            {card.title}
          </div>
          {card.chips?.length ? <ChipRow chips={card.chips} /> : null}
          {card.body ? (
            <div
              style={{
                display: "flex",
                fontSize: 28,
                lineHeight: 1.35,
                color: OG_COLORS.muted,
                letterSpacing: "0.04em",
                lineClamp: 3,
              }}
            >
              {card.body}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [{ name: "BIZ UDGothic", data: font(), style: "normal", weight: 400 }],
    },
  );
}
