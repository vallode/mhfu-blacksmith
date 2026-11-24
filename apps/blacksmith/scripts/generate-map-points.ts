/**
 * Draws the area map's node sprites that the item icons don't cover
 * (public/images/map-points/<name>.png): 16×16 pixel art, shown at 2× like
 * the item icons. Gathering points use the item icons themselves.
 * k outline, w fill, g shade. Run: pnpm tsx scripts/generate-map-points.ts
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const SIZE = 16;
const PALETTE: Record<string, number[]> = {
  k: [20, 16, 10],
  w: [240, 240, 236],
  g: [150, 150, 146],
};

const SPRITES: Record<string, string[]> = {
  // The mining node: a pickaxe.
  pickaxe: [
    "................",
    "...kkkkkkkkkk...",
    "..kwwwwwwwwwwk..",
    ".kwwkkkkkkkkwwk.",
    ".kwk..kwwk..kwk.",
    ".kk...kwwk...kk.",
    "......kwwk......",
    "......kwwk......",
    "......kggk......",
    "......kwwk......",
    "......kggk......",
    "......kwwk......",
    "......kggk......",
    "......kkkk......",
    "................",
    "................",
  ],
  // The bug gathering node: a net.
  net: [
    "................",
    "....kkkkkkkk....",
    "...kwwwwwwwwk...",
    "..kwwkwwkwwwwk..",
    "..kwwwkwwkwwwk..",
    "..kwkwwkwwkwwk..",
    "..kwwkwwkwwwwk..",
    "..kwwwkwwkwwwk..",
    "...kwwwwwwwwk...",
    "....kkkkkkkk....",
    "......kggk......",
    "......kwwk......",
    "......kggk......",
    "......kwwk......",
    "......kggk......",
    "......kkkk......",
  ],
};

async function main() {
  const out = path.join(__dirname, "..", "public", "images", "map-points");
  fs.mkdirSync(out, { recursive: true });
  for (const [name, art] of Object.entries(SPRITES)) {
    const data = Buffer.alloc(SIZE * SIZE * 4);
    art.forEach((row, y) => {
      if (row.length !== SIZE) throw new Error(`${name} row ${y} is ${row.length} wide`);
      [...row].forEach((ch, x) => {
        const rgb = PALETTE[ch];
        if (rgb) Buffer.from([...rgb, 255]).copy(data, (y * SIZE + x) * 4);
      });
    });
    await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 4 } })
      .png()
      .toFile(path.join(out, `${name}.png`));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
