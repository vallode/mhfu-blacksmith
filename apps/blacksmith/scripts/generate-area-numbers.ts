/**
 * Works out the number the game's map art prints for each of a map's areas.
 * data/gathering.json numbers areas by their place in the map's stage list,
 * which isn't the number on the art (the Jungle's 6th stage is its area 9),
 * so this reads the numerals off each texture (white glyphs in
 * public/images/area-maps/) and pairs every area with its nearest numeral,
 * minimising the total distance. Writes src/lib/area-numbers.json:
 * texture -> number by stage index (0, the Base Camp, has none).
 * Run after `generate-data`: pnpm tsx scripts/generate-area-numbers.ts
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { readData } from "game-data";
import { DATA_DIR } from "../src/lib/paths";
import type { GatheringFile } from "../src/lib/item-places";

/** Pixels: what an area with no numeral of its own costs, against its nearest one. */
const UNNUMBERED = 45;

const MAPS = path.join(__dirname, "..", "public", "images", "area-maps");

/** The glyphs' pixels, 10 rows by their width, as the textures draw them. */
const GLYPHS: Record<string, string[]> = {
  "0": [
    ".#####.",
    "#######",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "#######",
    ".#####.",
  ],
  "1": ["####", "####", "..##", "..##", "..##", "..##", "..##", "..##", "..##", "..##"],
  "2": [
    "########.",
    "#########",
    ".......##",
    ".......##",
    "#########",
    "########.",
    "##.......",
    "##.......",
    "#########",
    "#########",
  ],
  "3": [
    "########.",
    "#########",
    ".......##",
    ".......##",
    "..#######",
    "..#######",
    ".......##",
    ".......##",
    "#########",
    "########.",
  ],
  "4": [
    "##.....##",
    "##.....##",
    "##.....##",
    "##.....##",
    "#########",
    "#########",
    ".......##",
    ".......##",
    ".......##",
    ".......##",
  ],
  "5": [
    "#########",
    "#########",
    "##.......",
    "##.......",
    "########.",
    "#########",
    ".......##",
    ".......##",
    "#########",
    "########.",
  ],
  "6": [
    ".########",
    "#########",
    "##.......",
    "##.......",
    "########.",
    "#########",
    "##.....##",
    "##.....##",
    "#########",
    ".#######.",
  ],
  "7": [
    "#########",
    "#########",
    ".......##",
    ".......##",
    ".......##",
    ".......##",
    ".......##",
    ".......##",
    ".......##",
    ".......##",
  ],
  "8": [
    ".#######.",
    "#########",
    "##.....##",
    "##.....##",
    "#########",
    "#########",
    "##.....##",
    "##.....##",
    "#########",
    ".#######.",
  ],
  "9": [
    ".#######.",
    "#########",
    "##.....##",
    "##.....##",
    "#########",
    ".########",
    ".......##",
    ".......##",
    "#########",
    "########.",
  ],
};

interface Glyph {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  rows: string[];
}

/** The nearest glyph, comparing on a 9x10 grid. */
function classify(g: Glyph): string {
  const width = g.x1 - g.x0 + 1;
  const sample = (rows: string[], x: number, y: number, w: number) =>
    rows[y]![Math.min(w - 1, Math.floor(((x + 0.5) * w) / 9))] === "#";
  let best = "";
  let bestDistance = Infinity;
  for (const [digit, proto] of Object.entries(GLYPHS)) {
    let distance = 0;
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 9; x++)
        if (sample(g.rows, x, y, width) !== sample(proto, x, y, proto[0]!.length)) distance++;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = digit;
    }
  }
  return best;
}

/** The numbers printed on a texture, with their centres. */
async function readLabels(texture: string) {
  const { data, info } = await sharp(path.join(MAPS, `${texture}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const white = (i: number) =>
    data[i * 4]! >= 250 &&
    data[i * 4 + 1]! >= 250 &&
    data[i * 4 + 2]! >= 250 &&
    data[i * 4 + 3]! >= 250;
  const seen = new Uint8Array(W * H);
  const glyphs: (Glyph & { digit: string })[] = [];
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !white(s)) continue;
    const stack = [s];
    seen[s] = 1;
    const px: number[] = [];
    while (stack.length) {
      const p = stack.pop()!;
      px.push(p);
      const x = p % W;
      const y = Math.floor(p / W);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (!seen[q] && white(q)) {
            seen[q] = 1;
            stack.push(q);
          }
        }
    }
    const xs = px.map((p) => p % W);
    const ys = px.map((p) => Math.floor(p / W));
    const g = {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
      rows: [] as string[],
    };
    if (g.y1 - g.y0 < 8 || g.y1 - g.y0 > 11 || px.length < 10) continue;
    const set = new Set(px);
    for (let y = g.y0; y <= g.y1; y++) {
      let row = "";
      for (let x = g.x0; x <= g.x1; x++) row += set.has(y * W + x) ? "#" : ".";
      g.rows.push(row);
    }
    glyphs.push({ ...g, digit: classify(g) });
  }
  // Glyphs side by side on one row make a number.
  glyphs.sort((a, b) => a.x0 - b.x0);
  const used = new Set<number>();
  const labels: { number: number; x: number; y: number }[] = [];
  glyphs.forEach((g, i) => {
    if (used.has(i)) return;
    let text = g.digit;
    let last = g;
    glyphs.forEach((h, j) => {
      if (j <= i || used.has(j)) return;
      if (Math.abs(h.y0 - last.y0) <= 1 && h.x0 - last.x1 <= 4 && h.x0 > last.x1) {
        text += h.digit;
        used.add(j);
        last = h;
      }
    });
    labels.push({
      number: Number(text),
      x: (g.x0 + last.x1) / 2,
      y: (g.y0 + g.y1) / 2,
    });
  });
  return labels;
}

/** The assignment of areas to labels with the least total distance (n is small). */
function assign(cost: number[][]): number[] {
  const n = cost.length;
  const m = cost[0]!.length;
  // dp over subsets of labels
  const best = new Map<number, { total: number; picks: number[] }>();
  best.set(0, { total: 0, picks: [] });
  for (let i = 0; i < n; i++) {
    const next = new Map<number, { total: number; picks: number[] }>();
    for (const [mask, { total, picks }] of best) {
      for (let j = 0; j < m; j++) {
        if (mask & (1 << j)) continue;
        const key = mask | (1 << j);
        const t = total + cost[i]![j]!;
        const old = next.get(key);
        if (!old || t < old.total) next.set(key, { total: t, picks: [...picks, j] });
      }
    }
    best.clear();
    for (const [k, v] of next) best.set(k, v);
  }
  return [...best.values()].sort((a, b) => a.total - b.total)[0]!.picks;
}

async function main() {
  const { layouts } = readData<GatheringFile>(DATA_DIR, "gathering.json");
  const out: Record<string, number[]> = {};
  const centroids = new Map<string, Map<number, [number, number][]>>();
  for (const layout of layouts) {
    if (!layout.texture) continue;
    const areas = centroids.get(layout.texture) ?? new Map<number, [number, number][]>();
    centroids.set(layout.texture, areas);
    for (const { area, nodes } of layout.areas)
      for (const node of nodes)
        for (const p of node.positions ?? []) {
          const list = areas.get(area) ?? [];
          areas.set(area, list);
          list.push(p as [number, number]);
        }
  }
  for (const [texture, areas] of centroids) {
    const labels = await readLabels(texture);
    const indices = [...areas.keys()].filter((a) => a > 0).sort((a, b) => a - b);
    const center = (a: number) => {
      const pts = areas.get(a)!;
      return [
        pts.reduce((s, p) => s + p[0], 0) / pts.length,
        pts.reduce((s, p) => s + p[1], 0) / pts.length,
      ] as const;
    };
    if (indices.length === 0) continue;
    if (labels.length === 0) {
      console.warn(`${texture}: no numbers on the art; kept as is`);
      continue;
    }
    const cost = indices.map((a) => {
      const [cx, cy] = center(a);
      const near = labels.map((l) => Math.hypot(l.x - cx, l.y - cy));
      // An area the art doesn't number matches a stand-in at a fixed distance.
      return [
        ...near,
        ...Array.from({ length: Math.max(0, indices.length - labels.length) }, () => UNNUMBERED),
      ];
    });
    const picks = assign(cost);
    const numbers: number[] = [];
    indices.forEach((a, i) => {
      const label = labels[picks[i]!];
      if (label) numbers[a] = label.number;
    });
    // Areas without a numeral take the numbers the art doesn't print.
    for (const a of indices) {
      if (numbers[a] !== undefined) continue;
      let n = 1;
      while (numbers.includes(n)) n++;
      numbers[a] = n;
    }
    out[texture] = Array.from(numbers, (n) => n ?? 0);
    const note = labels.length > indices.length ? ` (${labels.length} numbers)` : "";
    console.log(`${texture}: ${indices.map((a, i) => `${a}→${numbers[a]}`).join(" ")}${note}`);
  }
  fs.writeFileSync(
    path.join(__dirname, "..", "src", "lib", "area-numbers.json"),
    JSON.stringify(out, null, 1) + "\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
