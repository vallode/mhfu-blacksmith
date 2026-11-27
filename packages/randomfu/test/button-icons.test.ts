import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { locateIndexedImage, readTmh, swizzle } from "mhfu-extract/src/models/tmh.js";
import { loadGame } from "whetstone/src/game/load.js";
import {
  buttonIconsTitle,
  drawSet,
  drawXbox,
  iconsHash,
  redrawIcons,
  SHEETS,
  SheetImage,
  sheetImages,
} from "whetstone/src/patches/button-icons.js";
import { randomize } from "../src/randomize.js";
import { buildFixtureDisc, tempDir } from "whetstone/test/fixtures.js";
import { settingsWith } from "./settings-helper.js";

const CLEAR = 0;
const FACE = 1;
const SYMBOL = 2;
const BUMPER = 3;
const INK = 4;
const PILL = 5;
const GREEN = 10;
const RED = 11;
const BLUE = 12;
const YELLOW = 13;

const PALETTE: Record<number, [number, number, number, number]> = {
  [CLEAR]: [0, 0, 0, 0],
  [FACE]: [57, 57, 57, 255],
  [SYMBOL]: [217, 216, 216, 255],
  [BUMPER]: [195, 195, 195, 255],
  [INK]: [0, 0, 0, 255],
  [PILL]: [60, 60, 60, 255],
  [GREEN]: [114, 217, 42, 255],
  [RED]: [224, 30, 30, 255],
  [BLUE]: [24, 116, 233, 255],
  [YELLOW]: [255, 213, 6, 255],
};

/** A HUD-like sheet: PSP-ish buttons (a body with a symbol) where the icons sit. */
function sheetPixels(): Buffer {
  const pixels = Buffer.alloc(256 * 256, CLEAR);
  const fill = (x: number, y: number, w: number, h: number, index: number) => {
    for (let dy = 0; dy < h; dy++) pixels.fill(index, (y + dy) * 256 + x, (y + dy) * 256 + x + w);
  };
  for (const x of [0, 16, 32, 48]) {
    fill(x, 0, 16, 16, FACE);
    for (let k = 3; k <= 11; k++) pixels[(k + 1) * 256 + x + k] = SYMBOL; // a diagonal
  }
  for (const x of [64, 84]) {
    fill(x, 0, 20, 16, BUMPER);
    fill(x + 7, 4, 2, 8, INK);
  }
  for (const x of [0, 20]) {
    fill(x, 16, 20, 16, PILL);
    fill(x + 2, 21, 15, 5, SYMBOL);
  }
  pixels[200 * 256 + 200] = SYMBOL; // art away from the icons
  return pixels;
}

/** A texture set of a 16x16 image and then the 256x256 sheet, both 8-bit swizzled. */
function sheetFile(pixels = sheetPixels()): Buffer {
  const image = (width: number, height: number, data: Buffer) => {
    const head = Buffer.alloc(32);
    const palette = Buffer.alloc(16 + 1024);
    palette.writeUInt32LE(palette.length, 0);
    palette.writeUInt32LE(3, 8);
    palette.writeUInt32LE(256, 12);
    for (const [i, rgba] of Object.entries(PALETTE)) palette.set(rgba, 16 + Number(i) * 4);
    head.writeUInt32LE(32 + data.length + palette.length, 0);
    head.writeUInt32LE(1, 12);
    head.writeUInt32LE(16 + data.length, 16);
    head.writeUInt32LE(1, 20);
    head.writeUInt32LE(5, 24);
    head.writeUInt16LE(width, 28);
    head.writeUInt16LE(height, 30);
    return Buffer.concat([head, swizzle(data, width, height), palette]);
  };
  const header = Buffer.alloc(16);
  header.write(".TMH0.14", 0, "latin1");
  header.writeUInt32LE(2, 8);
  return Buffer.concat([header, image(16, 16, Buffer.alloc(256, FACE)), image(256, 256, pixels)]);
}

function drawnSheet(): SheetImage {
  const sheets = [...sheetImages(sheetFile())];
  assert.equal(sheets.length, 1, "the 16x16 image isn't a sheet");
  const { image } = sheets[0]!;
  drawXbox(image, SHEETS[0]!);
  return image;
}

test("locateIndexedImage finds a later image of a set, and only a lone one without asking", () => {
  const file = sheetFile();
  assert.equal(locateIndexedImage(file), null);
  assert.equal(locateIndexedImage(file, 0)?.width, 16);
  assert.equal(locateIndexedImage(file, 1)?.width, 256);
  assert.equal(locateIndexedImage(file, 2), null);
  assert.equal(readTmh(file)[1]!.width, 256);
});

test("the faces become A B X Y in their colours on the painted-out button", () => {
  const image = drawnSheet();
  // Each letter's first row, from the cell's (4, 4).
  assert.equal(image.get(0 + 4, 4), RED, "○ is B");
  assert.equal(image.get(16 + 4 + 2, 4), GREEN, "× is A");
  assert.equal(image.get(16 + 4, 4), FACE, "A's top corner is the body");
  assert.equal(image.get(32 + 4, 4), YELLOW, "△ is Y");
  assert.equal(image.get(48 + 4, 4), BLUE, "□ is X");
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 64; x++)
      assert.notEqual(image.get(x, y), SYMBOL, `no symbol at ${x}, ${y}`);
});

test("the bumpers read LB and RB in L's ink, START and SELECT get Menu and View", () => {
  const image = drawnSheet();
  assert.equal(image.get(64 + 3, 4), INK, "L of LB");
  assert.equal(image.get(64 + 7, 4), BUMPER, "the old L is painted out");
  assert.equal(image.get(64 + 10, 4), INK, "B of LB");
  assert.equal(image.get(84 + 3, 4), INK, "R of RB");
  assert.equal(image.get(84 + 8, 5), INK, "R's bowl");

  assert.equal(image.get(6, 16 + 5), SYMBOL, "Menu's top line, in the words' colour");
  assert.equal(image.get(6, 16 + 6), PILL, "between Menu's lines");
  assert.equal(image.get(2, 16 + 6), PILL, "the words are gone");
  assert.equal(image.get(20 + 5, 16 + 6), SYMBOL, "View's front window");
  assert.equal(image.get(20 + 8, 16 + 8), PILL, "the back window is hidden behind the front");
  assert.equal(image.get(200, 200), SYMBOL, "art elsewhere is left alone");
});

test("a sheet that isn't the PSP art this knows is left alone", () => {
  assert.equal(redrawIcons(sheetFile()), null);
  assert.equal(redrawIcons(Buffer.alloc(64)), null);
});

test("a known sheet is redrawn in place: same size, only its icon cells change", () => {
  const file = sheetFile();
  const sheet = [...sheetImages(file)][0]!.image;
  const result = redrawIcons(file, { HUD: [iconsHash(sheet, SHEETS[0]!)] });
  assert.ok(result);
  assert.deepEqual(result.sheets, ["HUD"]);
  assert.equal(result.file.length, file.length);
  const [smallBefore, before] = readTmh(file);
  const [smallAfter, after] = readTmh(result.file);
  assert.deepEqual(smallAfter, smallBefore, "the other image is untouched");
  const rgba = (img: typeof after, x: number, y: number) => [
    ...img!.rgba.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4),
  ];
  assert.deepEqual(rgba(after, 4, 4), PALETTE[RED], "○ is B, after the swizzle back");
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++)
      if (y >= 32 || x >= 104)
        assert.deepEqual(rgba(after, x, y), rgba(before, x, y), `${x}, ${y} is unchanged`);
});

test("randomize says so when the disc has no icon sheet, for every set", async () => {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  try {
    const game = await loadGame(source, iso);
    for (const set of ["xbox", "nintendo", "playstation", "keyboard"] as const) {
      const result = randomize(game, settingsWith("ICONS", [], { "mods.buttonIcons": set }));
      const report = result.reports.find((r) => r.title === buttonIconsTitle(set));
      assert.ok(report, set);
      assert.match(report.notes[0]!, /^Not written/);
    }
  } finally {
    source.close();
  }
});

test("every set draws the title sheet's icons, which have no START or SELECT, and nothing else", () => {
  for (const set of ["xbox", "nintendo", "playstation", "keyboard"] as const) {
    const image = sheetImages(sheetFile()).next().value!.image;
    const before = Buffer.from(image.pixels);
    drawSet(image, SHEETS[1]!, set);
    const [ox, oy] = SHEETS[1]!.origin;
    let changed = 0;
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        if (image.get(x, y) === before[y * 256 + x]) continue;
        changed++;
        assert.ok(
          x >= ox && x < ox + 104 && y >= oy && y < oy + 16,
          `${set}: ${x}, ${y} is outside the icons`,
        );
      }
    assert.ok(changed > 0, `${set} drew something`);
  }
});

test("Nintendo keeps the Xbox's places with a Switch's letters, plus and minus", () => {
  const image = sheetImages(sheetFile()).next().value!.image;
  drawSet(image, SHEETS[0]!, "nintendo");
  const xbox = drawnSheet();
  const shape = (img: SheetImage, x: number) =>
    img
      .copy(x + 4, 4, 7, 9)
      .flat()
      .map((index) => index === FACE);
  assert.deepEqual(shape(image, 0), shape(xbox, 16), "○ is A, the shape the Xbox gives ×");
  assert.deepEqual(shape(image, 16), shape(xbox, 0), "× is B, the shape the Xbox gives ○");
  assert.equal(image.get(5 + 4, 16 + 4), SYMBOL, "plus's stem, in the words' colour");
  assert.equal(image.get(5, 16 + 4), PILL, "the words are gone");
  assert.equal(image.get(20 + 5 + 1, 16 + 7), SYMBOL, "minus is a bar");
  assert.equal(image.get(20 + 5, 16 + 7), PILL, "which stops short of its edges");
  assert.equal(image.get(200, 200), SYMBOL, "art elsewhere is left alone");
});

test("PlayStation draws coloured shapes and L1 R1", () => {
  const image = sheetImages(sheetFile()).next().value!.image;
  drawSet(image, SHEETS[0]!, "playstation");
  assert.equal(image.get(0 + 3 + 2, 3), RED, "○ is red");
  assert.equal(image.get(64 + 4, 4), INK, "L of L1");
  assert.equal(image.get(64 + 12, 4), INK, "the 1 of L1");
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 64; x++)
      assert.notEqual(image.get(x, y), SYMBOL, `no PSP symbol at ${x}, ${y}`);
});

test("Keyboard draws outlined keycaps with their letters, leaving the corners clear", () => {
  const image = sheetImages(sheetFile()).next().value!.image;
  drawSet(image, SHEETS[0]!, "keyboard");
  // The fixture's buttons are square, so what's "clear" is its body, FACE.
  for (const x of [0, 16, 32, 48, 64, 84]) {
    assert.equal(image.get(x, 0), FACE, "the corner is clear");
    assert.equal(image.get(x + 5, 0), INK, "outline along the top");
  }
  assert.notEqual(image.get(16 + 4, 2), image.get(16 + 4, 4), "Z's bar differs from the key");
  assert.equal(image.get(0, 16 + 15), FACE, "the Enter and Space keys are 14 tall");
  assert.equal(image.get(5, 16 + 13), INK, "the key's bottom outline is its 14th row");
  assert.equal(image.get(200, 200), SYMBOL, "art elsewhere is left alone");
});

test("every set redraws a known sheet in place, size unchanged", () => {
  const file = sheetFile();
  const sheet = [...sheetImages(file)][0]!.image;
  for (const set of ["nintendo", "playstation", "keyboard"] as const) {
    const result = redrawIcons(file, { HUD: [iconsHash(sheet, SHEETS[0]!)] }, set);
    assert.ok(result, set);
    assert.equal(result.file.length, file.length, set);
    assert.notDeepEqual(result.file, file, set);
  }
});
