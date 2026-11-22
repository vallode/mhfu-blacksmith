/**
 * Xbox button icons: the PSP's ○ × △ □ L R START SELECT icons, which the
 * game draws in its text (`~B00`-`~B09`, see `hints/style.ts`) and HUD, are
 * redrawn as an Xbox controller's B A Y X LB RB Menu View, the buttons
 * PPSSPP maps them to by default.
 *
 * - The icons are sprites 50-58 of the HUD sprite table (EU 0x089391A8,
 *   12-byte rows of u16 u, v, w, h, texture, set), all on texture 0x8001: a
 *   256x256, 8-bit swizzled sheet with an RGBA8888 palette, the second image
 *   of `system/resides.tmh` (JP file 18; EU files 30-34, one a language,
 *   differing only in their words). The faces are 16x16 from (0, 0), L and
 *   R 20x16 from (64, 0), START and SELECT 20x16 from (0, 16). The analog
 *   stick (56) and d-pad (59) are left as they are.
 * - The fourth image of `system/demo.tmh` (JP file 17; EU files 25-29)
 *   repeats the faces, L and R in the same art from (104, 144). What draws
 *   them isn't known; they're redrawn too so no PSP icon is left.
 * - Every palette entry of the HUD sheet is used, so the new art takes the
 *   sheet's own colours: the button bodies are the PSP icons' with their
 *   symbol painted out, and the letters take the nearest colour in the
 *   palette. Files keep their size.
 * - A sheet is drawn on only if its icons are the PSP art this was made from
 *   (`PSP_ART`), so another release's different art is left alone.
 */
import { createHash } from "node:crypto";
import { isTmh, locateIndexedImage, swizzle, unswizzle } from "mhfu-extract/src/models/tmh.js";
import type { Edits } from "../edits.js";
import type { GameData } from "../game/load.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";

type Icon = "circle" | "cross" | "triangle" | "square" | "l" | "r" | "start" | "select";

/** Each icon's place from its sheet's origin and its size: sprites 50-58's rows. */
export const ICON_CELLS: Record<Icon, readonly [x: number, y: number, w: number, h: number]> = {
  circle: [0, 0, 16, 16],
  cross: [16, 0, 16, 16],
  triangle: [32, 0, 16, 16],
  square: [48, 0, 16, 16],
  l: [64, 0, 20, 16],
  r: [84, 0, 20, 16],
  start: [0, 16, 20, 16],
  select: [20, 16, 20, 16],
};

export interface Sheet {
  name: string;
  origin: readonly [number, number];
  icons: readonly Icon[];
}

const FACES: readonly Icon[] = ["circle", "cross", "triangle", "square"];

export const SHEETS: readonly Sheet[] = [
  { name: "HUD", origin: [0, 0], icons: [...FACES, "l", "r", "start", "select"] },
  { name: "title", origin: [104, 144], icons: [...FACES, "l", "r"] },
];

/**
 * SHA-1 of each sheet's icons (`iconsHash`) on the EU and FUC (JP) discs: a
 * sheet is drawn on only if its icons are this art.
 */
export const PSP_ART: Record<string, readonly string[]> = {
  HUD: [
    "9859b19ec8a9375ba576411028e5419707a36b91", // EU
    "75c11ae154bd41fe1350e5d5969741fa72807aa3", // JP
  ],
  title: ["998b334e287d8341dd22ec7086451fa9d33e07b2"], // EU and JP
};

/** The Xbox letter on each face, and its colour as RGB. */
const FACE_LETTERS: Record<string, { letter: string; color: [number, number, number] }> = {
  cross: { letter: "A", color: [90, 200, 40] },
  circle: { letter: "B", color: [230, 40, 40] },
  square: { letter: "X", color: [40, 120, 240] },
  triangle: { letter: "Y", color: [250, 205, 20] },
};

/** 7x9 letters for the faces, 2-pixel strokes. */
const FACE_GLYPHS: Record<string, readonly string[]> = {
  A: [
    "..###..",
    ".##.##.",
    "##...##",
    "##...##",
    "#######",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
  ],
  B: [
    "######.",
    "##...##",
    "##...##",
    "##..##.",
    "#####..",
    "##..##.",
    "##...##",
    "##...##",
    "######.",
  ],
  X: [
    "##...##",
    "##...##",
    ".##.##.",
    ".##.##.",
    "..###..",
    ".##.##.",
    ".##.##.",
    "##...##",
    "##...##",
  ],
  Y: [
    "##...##",
    "##...##",
    ".##.##.",
    ".##.##.",
    "..###..",
    "..###..",
    "..###..",
    "..###..",
    "..###..",
  ],
};

/** 6x8 letters for the bumpers, as tall as the PSP's L and R. */
const BUMPER_GLYPHS: Record<string, readonly string[]> = {
  L: ["##....", "##....", "##....", "##....", "##....", "##....", "######", "######"],
  R: ["#####.", "##..##", "##..##", "#####.", "####..", "##.##.", "##..##", "##..##"],
  B: ["#####.", "##..##", "##..##", "#####.", "##..##", "##..##", "##..##", "#####."],
};

/** Menu (☰) on START and View (two windows) on SELECT, 10x7 from the cell's (5, 4). */
const PILL_GLYPHS: Record<"start" | "select", readonly string[]> = {
  start: [
    "..........",
    ".########.",
    "..........",
    ".########.",
    "..........",
    ".########.",
    "..........",
  ],
  select: [
    "...#######",
    "...#.....#",
    "#######..#",
    "#.....#..#",
    "#.....####",
    "#.....#...",
    "#######...",
  ],
};

/** An 8-bit image of a sheet, unswizzled, with its palette. */
export class SheetImage {
  constructor(
    readonly pixels: Buffer,
    readonly width: number,
    readonly palette: readonly (readonly [number, number, number, number])[],
  ) {}

  get(x: number, y: number): number {
    return this.pixels[y * this.width + x]!;
  }

  set(x: number, y: number, index: number): void {
    this.pixels[y * this.width + x] = index;
  }

  luma(index: number): number {
    const [r, g, b] = this.palette[index]!;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  /** The opaque palette entry nearest a colour. */
  nearest([r, g, b]: readonly [number, number, number]): number {
    let best = 0;
    let bestDistance = Infinity;
    this.palette.forEach(([pr, pg, pb, pa], i) => {
      const distance = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
      if (pa === 255 && distance < bestDistance) [best, bestDistance] = [i, distance];
    });
    return best;
  }

  /** A cell's pixels, row by row. */
  copy(x: number, y: number, w: number, h: number): number[][] {
    return Array.from({ length: h }, (_, row) =>
      Array.from({ length: w }, (_, col) => this.get(x + col, y + row)),
    );
  }

  paste(x: number, y: number, cell: readonly (readonly number[])[]): void {
    cell.forEach((row, dy) => row.forEach((index, dx) => this.set(x + dx, y + dy, index)));
  }
}

const at = (sheet: Sheet, icon: Icon) => {
  const [x, y, w, h] = ICON_CELLS[icon];
  return [sheet.origin[0] + x, sheet.origin[1] + y, w, h] as const;
};

/** SHA-1 of a sheet's icons in RGBA, icon by icon. */
export function iconsHash(image: SheetImage, sheet: Sheet): string {
  const hash = createHash("sha1");
  for (const icon of sheet.icons) {
    const [x, y, w, h] = at(sheet, icon);
    for (const row of image.copy(x, y, w, h))
      for (const index of row) hash.update(Uint8Array.from(image.palette[index]!));
  }
  return hash.digest("hex");
}

/** The colour most of a box's pixels are. */
function mostUsed(cell: readonly (readonly number[])[], box: Box): number {
  const counts = new Map<number, number>();
  forBox(box, (x, y) => counts.set(cell[y]![x]!, (counts.get(cell[y]![x]!) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1])[0]![0];
}

type Box = readonly [x0: number, y0: number, x1: number, y1: number];
const forBox = ([x0, y0, x1, y1]: Box, run: (x: number, y: number) => void) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) run(x, y);
};

/** Paints out a symbol: every pixel of the box far from the body's colour takes the body's. */
function paintOut(image: SheetImage, cell: number[][], box: Box): number {
  const body = mostUsed(cell, box);
  forBox(box, (x, y) => {
    if (Math.abs(image.luma(cell[y]![x]!) - image.luma(body)) > 40) cell[y]![x] = body;
  });
  return body;
}

function draw(cell: number[][], glyph: readonly string[], x: number, y: number, index: number) {
  glyph.forEach((row, dy) =>
    [...row].forEach((c, dx) => {
      if (c === "#") cell[y + dy]![x + dx] = index;
    }),
  );
}

/** The symbol's own colour: the box's lightest or darkest pixel. */
function symbolColour(image: SheetImage, cell: number[][], box: Box, light: boolean): number {
  let best = cell[box[1]]![box[0]]!;
  forBox(box, (x, y) => {
    const index = cell[y]![x]!;
    if (light ? image.luma(index) > image.luma(best) : image.luma(index) < image.luma(best))
      best = index;
  });
  return best;
}

/** Redraws a sheet's icons as the Xbox's. */
export function drawXbox(image: SheetImage, sheet: Sheet): void {
  // The faces: the × button with its × painted out, and a letter.
  const [cx, cy, cw, ch] = at(sheet, "cross");
  const face = image.copy(cx, cy, cw, ch);
  paintOut(image, face, [3, 4, 11, 12]);
  for (const icon of FACES) {
    const cell = face.map((row) => [...row]);
    const { letter, color } = FACE_LETTERS[icon]!;
    draw(cell, FACE_GLYPHS[letter]!, 4, 4, image.nearest(color));
    const [x, y] = at(sheet, icon);
    image.paste(x, y, cell);
  }

  // The bumpers: L's button with its L painted out, and LB or RB in L's colour.
  const [lx, ly, lw, lh] = at(sheet, "l");
  const bumper = image.copy(lx, ly, lw, lh);
  const ink = symbolColour(image, bumper, [3, 4, 16, 11], false);
  paintOut(image, bumper, [3, 4, 16, 11]);
  for (const [icon, letter] of [
    ["l", "L"],
    ["r", "R"],
  ] as const) {
    const cell = bumper.map((row) => [...row]);
    draw(cell, BUMPER_GLYPHS[letter]!, 3, 4, ink);
    draw(cell, BUMPER_GLYPHS.B!, 10, 4, ink);
    const [x, y] = at(sheet, icon);
    image.paste(x, y, cell);
  }

  if (!sheet.icons.includes("start")) return;
  // START and SELECT: START's button with its words' rows replaced by the
  // plain row above them, and Menu or View in the words' colour.
  const [sx, sy, sw, sh] = at(sheet, "start");
  const pill = image.copy(sx, sy, sw, sh);
  const words = symbolColour(image, pill, [1, 5, 18, 9], true);
  for (let y = 5; y <= 9; y++) pill[y] = [...pill[4]!];
  const body = mostUsed(pill, [1, 4, 18, 4]);
  for (const icon of ["start", "select"] as const) {
    const cell = pill.map((row) => [...row]);
    // View's front window hides the back one: its inside is the body's colour.
    if (icon === "select") forBox([6, 7, 10, 9], (x, y) => (cell[y]![x] = body));
    draw(cell, PILL_GLYPHS[icon], 5, 4, words);
    const [x, y] = at(sheet, icon);
    image.paste(x, y, cell);
  }
}

/** The sheet images a file holds: each 256x256 8-bit image with an RGBA palette. */
export function* sheetImages(file: Buffer) {
  if (!isTmh(file)) return;
  const count = file.readUInt32LE(8);
  for (let k = 0; k < count; k++) {
    const found = locateIndexedImage(file, k);
    if (!found?.swizzled || found.paletteFormat !== 3) continue;
    if (found.width !== 256 || found.height !== 256) continue;
    const size = found.width * found.height;
    const pixels = unswizzle(file.subarray(found.pixels, found.pixels + size), 256, 256);
    const palette = Array.from({ length: 256 }, (_, i) => {
      const o = found.palette + i * 4;
      return [file[o]!, file[o + 1]!, file[o + 2]!, file[o + 3]!] as const;
    });
    yield { image: new SheetImage(Buffer.from(pixels), 256, palette), pixelsAt: found.pixels };
  }
}

/**
 * The file with its PSP icons redrawn as the Xbox's, and the names of the
 * sheets drawn on, or null if it has none this knows.
 */
export function redrawIcons(file: Buffer): { file: Buffer; sheets: string[] } | null {
  const out = Buffer.from(file);
  const sheets: string[] = [];
  for (const { image, pixelsAt } of sheetImages(file)) {
    const sheet = SHEETS.find((s) => PSP_ART[s.name]!.includes(iconsHash(image, s)));
    if (!sheet) continue;
    drawXbox(image, sheet);
    swizzle(image.pixels, 256, 256).copy(out, pixelsAt);
    sheets.push(sheet.name);
  }
  return sheets.length > 0 ? { file: out, sheets } : null;
}

/** The icon sheets are among the first DATA.BIN files (JP 17 and 18, EU 25-34), so only those are searched. */
export const SCAN_FILES = 64;

const TITLE = "Xbox button icons";

/** Redraws the button icons on every sheet that has them. */
export function addButtonIcons(game: GameData, edits: Edits): ShuffleReport {
  const drawn: string[] = [];
  for (let index = 0; index < Math.min(SCAN_FILES, game.dataBin.fileCount); index++) {
    const result = redrawIcons(game.dataBin.read(index));
    if (!result) continue;
    result.file.copy(edits.dataFile(index));
    drawn.push(`${index} (${result.sheets.join(", ")})`);
  }
  if (drawn.length === 0)
    return {
      title: TITLE,
      notes: ["Not written: no texture has the PSP button icons this knows."],
      lines: [],
    };
  return {
    title: TITLE,
    notes: [
      "The PSP's button icons are drawn as an Xbox controller's, as PPSSPP maps one by default: A for ×, B for ○, X for □, Y for △, LB and RB for L and R, Menu and View for START and SELECT.",
      `Drawn on DATA.BIN files ${drawn.join(", ")}.`,
    ],
    lines: [],
    summary: `${TITLE}: ${drawn.length} textures`,
  };
}
