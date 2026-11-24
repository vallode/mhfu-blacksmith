/**
 * Other button icons: the PSP's ○ × △ □ L R START SELECT icons, which the
 * game draws in its text (`~B00`-`~B09`, see `hints/style.ts`) and HUD, are
 * redrawn as another controller's. Xbox: B A Y X LB RB Menu View, the buttons
 * PPSSPP maps them to by default. Nintendo: the same places, A B X Y L R + −.
 * PlayStation: ○ × △ □ as coloured shapes, L1 R1, ≡ and a touchpad. Keyboard:
 * keycaps for PPSSPP's default keys (X Z S A, Q W, Space, Enter).
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
import type { Region } from "mhfu-extract/src/container/sfo.js";
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

/** The button sets `mods.buttonIcons` can draw besides the PSP's own. */
export type ButtonSet = "xbox" | "nintendo" | "playstation" | "keyboard";

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
  Z: [
    "#######",
    "#######",
    "....##.",
    "...##..",
    "..##...",
    ".##....",
    "##.....",
    "#######",
    "#######",
  ],
  S: [
    ".#####.",
    "##...##",
    "##.....",
    ".####..",
    "..####.",
    ".....##",
    "##...##",
    "##...##",
    ".#####.",
  ],
};

/** 6x8 letters for the bumpers, as tall as the PSP's L and R. */
const BUMPER_GLYPHS: Record<string, readonly string[]> = {
  L: ["##....", "##....", "##....", "##....", "##....", "##....", "######", "######"],
  R: ["#####.", "##..##", "##..##", "#####.", "####..", "##.##.", "##..##", "##..##"],
  B: ["#####.", "##..##", "##..##", "#####.", "##..##", "##..##", "##..##", "#####."],
  Q: [".####.", "##..##", "##..##", "##..##", "##..##", "##.###", ".####.", "....##"],
  "1": [".##.", "###.", ".##.", ".##.", ".##.", ".##.", ".##.", "####"],
};

/** The keyboard's W, 8 wide. */
const WIDE_W: readonly string[] = [
  "##....##",
  "##....##",
  "##....##",
  "##.##.##",
  "##.##.##",
  "##.##.##",
  "########",
  "###..###",
];

/** 9x9 PlayStation face symbols, 2-pixel strokes. */
const SHAPES: Record<string, readonly string[]> = {
  circle: [
    "..#####..",
    ".##...##.",
    "##.....##",
    "##.....##",
    "##.....##",
    "##.....##",
    "##.....##",
    ".##...##.",
    "..#####..",
  ],
  cross: [
    "##.....##",
    ".##...##.",
    "..##.##..",
    "...###...",
    "...###...",
    "...###...",
    "..##.##..",
    ".##...##.",
    "##.....##",
  ],
  triangle: [
    "....#....",
    "...###...",
    "...#.#...",
    "..##.##..",
    "..#...#..",
    ".##...##.",
    ".#.....#.",
    "#########",
    "#########",
  ],
  square: [
    "#########",
    "##.....##",
    "##.....##",
    "##.....##",
    "##.....##",
    "##.....##",
    "##.....##",
    "##.....##",
    "#########",
  ],
};

/** Plus and minus (Nintendo), 10x7 like the other pill symbols. */
const PLUS_MINUS: Record<"start" | "select", readonly string[]> = {
  start: [
    "....##....",
    "....##....",
    "..######..",
    "..######..",
    "....##....",
    "....##....",
    "..........",
  ],
  select: [
    "..........",
    "..........",
    "..........",
    ".########.",
    ".########.",
    "..........",
    "..........",
  ],
};

/** Options (≡) and the touchpad (PlayStation). */
const PLAYSTATION_PILL: Record<"start" | "select", readonly string[]> = {
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
    "..........",
    ".########.",
    ".#......#.",
    ".#......#.",
    ".#......#.",
    ".########.",
    "..........",
  ],
};

/** Space (⎵) and Enter (↵), PPSSPP's default START and SELECT keys, on keycaps. */
const KEYBOARD_PILL: Record<"start" | "select", readonly string[]> = {
  start: [
    "..........",
    "..........",
    "#........#",
    "#........#",
    "##########",
    "..........",
    "..........",
  ],
  select: [
    "........##",
    "........##",
    "........##",
    ".#......##",
    "##########",
    ".#........",
    "..........",
  ],
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

type Rgb = readonly [number, number, number];

/** What a dark-button set puts on the PSP's painted-out buttons. */
interface Style {
  faces: Record<string, { glyph: readonly string[]; x: number; y: number; colour: Rgb | "light" }>;
  bumpers: Record<"l" | "r", readonly (readonly [glyph: readonly string[], x: number])[]>;
  pills: Record<"start" | "select", readonly string[]>;
}

const letter = (name: string) => ({
  glyph: FACE_GLYPHS[name]!,
  x: 4,
  y: 4,
  colour: "light" as const,
});

const STYLES: Record<"nintendo" | "playstation", Style> = {
  // The Xbox's places, a Switch's letters: B below, A right, Y left, X above.
  nintendo: {
    faces: { cross: letter("B"), circle: letter("A"), square: letter("Y"), triangle: letter("X") },
    bumpers: { l: [[BUMPER_GLYPHS.L!, 7]], r: [[BUMPER_GLYPHS.R!, 7]] },
    pills: PLUS_MINUS,
  },
  playstation: {
    faces: {
      cross: { glyph: SHAPES.cross!, x: 3, y: 3, colour: [90, 150, 255] },
      circle: { glyph: SHAPES.circle!, x: 3, y: 3, colour: [235, 70, 70] },
      square: { glyph: SHAPES.square!, x: 3, y: 3, colour: [235, 130, 210] },
      triangle: { glyph: SHAPES.triangle!, x: 3, y: 3, colour: [60, 205, 150] },
    },
    bumpers: {
      l: [
        [BUMPER_GLYPHS.L!, 4],
        [BUMPER_GLYPHS["1"]!, 11],
      ],
      r: [
        [BUMPER_GLYPHS.R!, 4],
        [BUMPER_GLYPHS["1"]!, 11],
      ],
    },
    pills: PLAYSTATION_PILL,
  },
};

/** Redraws a sheet's icons as a Nintendo or PlayStation controller's, on the PSP's painted-out buttons. */
function drawStyled(image: SheetImage, sheet: Sheet, style: Style): void {
  const hasPill = sheet.icons.includes("start");
  const [sx, sy, sw, sh] = at(sheet, "start");
  const pill = hasPill ? image.copy(sx, sy, sw, sh) : null;
  const [cx, cy, cw, ch] = at(sheet, "cross");
  const face = image.copy(cx, cy, cw, ch);
  // White is the palette's whitest entry, the same on every sheet.
  const light = image.nearest([255, 255, 255]);
  paintOut(image, face, [3, 4, 11, 12]);
  for (const icon of FACES) {
    const cell = face.map((row) => [...row]);
    const { glyph, x, y, colour } = style.faces[icon]!;
    draw(cell, glyph, x, y, colour === "light" ? light : image.nearest(colour));
    const [fx, fy] = at(sheet, icon);
    image.paste(fx, fy, cell);
  }

  const [lx, ly, lw, lh] = at(sheet, "l");
  const bumper = image.copy(lx, ly, lw, lh);
  const ink = symbolColour(image, bumper, [3, 4, 16, 11], false);
  paintOut(image, bumper, [3, 4, 16, 11]);
  for (const icon of ["l", "r"] as const) {
    const cell = bumper.map((row) => [...row]);
    for (const [glyph, x] of style.bumpers[icon]) draw(cell, glyph, x, 4, ink);
    const [x, y] = at(sheet, icon);
    image.paste(x, y, cell);
  }

  if (!pill) return;
  for (let y = 5; y <= 9; y++) pill[y] = [...pill[4]!];
  for (const icon of ["start", "select"] as const) {
    const cell = pill.map((row) => [...row]);
    draw(cell, style.pills[icon], 5, 4, light);
    const [x, y] = at(sheet, icon);
    image.paste(x, y, cell);
  }
}

/** A keycap `w` x `h`: outline, a light top `top` rows deep, a shaded front. */
function keycap(image: SheetImage, clear: number, w: number, h: number, top: number): number[][] {
  const [outline, white, shade, front, edge] = (
    [
      [1, 1, 1],
      [255, 255, 255],
      [200, 200, 200],
      [148, 148, 148],
      [117, 117, 117],
    ] as const
  ).map((c) => image.nearest(c)) as [number, number, number, number, number];
  const cap = Array.from({ length: 16 }, () => Array<number>(w).fill(clear));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const border = y === 0 || y === h - 1 || x === 0 || x === w - 1;
      let index = white;
      if (y > top) index = y === h - 2 ? edge : front;
      else if (x === w - 2 || y === top) index = shade;
      cap[y]![x] = border ? outline : index;
    }
  for (const [x, y] of [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ] as const)
    cap[y]![x] = clear;
  return cap;
}

/** Redraws a sheet's icons as keycaps for PPSSPP's default keys. */
function drawKeyboard(image: SheetImage, sheet: Sheet): void {
  const [cx, cy] = at(sheet, "cross");
  const clear = image.get(cx, cy);
  const ink = image.nearest([73, 73, 73]);
  const key = (
    icon: Icon,
    h: number,
    top: number,
    glyph: readonly string[],
    x: number,
    y: number,
  ) => {
    const [w] = ICON_CELLS[icon].slice(2) as [number];
    const cell = keycap(image, clear, w, h, top);
    draw(cell, glyph, x, y, ink);
    const [px, py] = at(sheet, icon);
    image.paste(px, py, cell);
  };
  key("circle", 16, 11, FACE_GLYPHS.X!, 4, 2);
  key("cross", 16, 11, FACE_GLYPHS.Z!, 4, 2);
  key("triangle", 16, 11, FACE_GLYPHS.S!, 4, 2);
  key("square", 16, 11, FACE_GLYPHS.A!, 4, 2);
  key("l", 16, 11, BUMPER_GLYPHS.Q!, 7, 3);
  key("r", 16, 11, WIDE_W, 6, 3);
  if (!sheet.icons.includes("start")) return;
  key("start", 14, 9, KEYBOARD_PILL.start, 5, 1);
  key("select", 14, 9, KEYBOARD_PILL.select, 5, 1);
}

/** Redraws a sheet's icons as a set's. */
export function drawSet(image: SheetImage, sheet: Sheet, set: ButtonSet): void {
  if (set === "xbox") drawXbox(image, sheet);
  else if (set === "keyboard") drawKeyboard(image, sheet);
  else drawStyled(image, sheet, STYLES[set]);
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
 * The file with its PSP icons redrawn as a set's (the Xbox's unless told
 * otherwise), and the names of the sheets drawn on, or null if it has none
 * this knows.
 */
export function redrawIcons(
  file: Buffer,
  known: Record<string, readonly string[]> = PSP_ART,
  set: ButtonSet = "xbox",
): { file: Buffer; sheets: string[] } | null {
  const out = Buffer.from(file);
  const sheets: string[] = [];
  for (const { image, pixelsAt } of sheetImages(file)) {
    const sheet = SHEETS.find((s) => known[s.name]?.includes(iconsHash(image, s)));
    if (!sheet) continue;
    drawSet(image, sheet, set);
    swizzle(image.pixels, 256, 256).copy(out, pixelsAt);
    sheets.push(sheet.name);
  }
  return sheets.length > 0 ? { file: out, sheets } : null;
}

/** The DATA.BIN files holding the icon sheets: `demo.tmh` and `resides.tmh`, and EU's copies. */
export const SHEET_FILES: Partial<Record<Region, readonly number[]>> = {
  jp: [17, 18],
  eu: [25, 26, 27, 28, 29, 30, 31, 32, 33, 34],
};
/** Elsewhere, the first files are searched: the system files are among them. */
export const SCAN_FILES = 64;

const NOTES: Record<ButtonSet, { name: string; note: string }> = {
  xbox: {
    name: "Xbox",
    note: "The PSP's button icons are drawn as an Xbox controller's, as PPSSPP maps one by default: A for ×, B for ○, X for □, Y for △, LB and RB for L and R, Menu and View for START and SELECT.",
  },
  nintendo: {
    name: "Nintendo",
    note: "The PSP's button icons are drawn as a Switch controller's, in the same places as the Xbox's: B for ×, A for ○, Y for □, X for △, L and R, + and − for START and SELECT.",
  },
  playstation: {
    name: "PlayStation",
    note: "The PSP's button icons are drawn as a modern PlayStation controller's: coloured × ○ □ △ shapes, L1 and R1, Options (≡) for START and the touchpad for SELECT.",
  },
  keyboard: {
    name: "Keyboard",
    note: "The PSP's button icons are drawn as keys, as PPSSPP maps a keyboard by default: Z for ×, X for ○, A for □, S for △, Q and W for L and R, Space for START and Enter for SELECT.",
  },
};

/** The title of a set's report. */
export const buttonIconsTitle = (set: ButtonSet) => `${NOTES[set].name} button icons`;

/** Redraws the button icons on every sheet that has them. */
export function addButtonIcons(game: GameData, edits: Edits, set: ButtonSet): ShuffleReport {
  const TITLE = buttonIconsTitle(set);
  const drawn: string[] = [];
  const files = SHEET_FILES[game.region] ?? Array.from({ length: SCAN_FILES }, (_, index) => index);
  for (const index of files.filter((index) => index < game.dataBin.fileCount)) {
    const result = redrawIcons(edits.dataFileNow(index), PSP_ART, set);
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
    notes: [NOTES[set].note, `Drawn on DATA.BIN files ${drawn.join(", ")}.`],
    lines: [],
    summary: `${TITLE}: ${drawn.length} textures`,
  };
}
