/**
 * Files that link embeds (Discord and others) read, written into public/embed/
 * (git-ignored; runs in `pnpm build` before `next build`):
 *
 * - icons/<type>-<tint>.png: 180px thumbnails, the site's in-game icon sprite
 *   tinted the way the site tints it (multiply), in the site's blue card frame
 *   and its patterned fill. Monsters get their portrait on the scroll, as on
 *   the monster page (see monsterEmbedIcon()).
 *   See embedIcon() in src/lib/seo.ts.
 * - oembed/<route>.json: each detail page's oEmbed file, which gives Discord
 *   the line above the title ("Rarity 10 Long Sword"). See oembedJson().
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { getArmorParams, getArmorPieces } from "../src/lib/armor";
import { WEAPON_TYPES } from "../src/lib/constants";
import { getDecorations } from "../src/lib/decorations";
import { getMonsterCategories, getMonsters } from "../src/lib/monsters";
import {
  EMBED_ICON_TINTS,
  EMBED_ICON_TYPES,
  armorAuthor,
  decorationAuthor,
  monsterAuthor,
  oembedJson,
  oembedPath,
  weaponAuthor,
  type EmbedAuthor,
} from "../src/lib/seo";
import { getWeapons } from "../src/lib/weapons";

const publicDir = path.join(process.cwd(), "public");
const outDir = path.join(publicDir, "embed");

const SIZE = 180;
/** Room inside the frame for the sprite, in pixels. */
const INNER = 140;
/** The largest scale: weapon and armour sprites (26px) draw at 5×. */
const MAX_SCALE = 5;

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Source-over of a straight-alpha RGBA colour onto another. */
function over(top: number[], under: number[]): number[] {
  const a = top[3] + under[3] * (1 - top[3]);
  if (a === 0) return [0, 0, 0, 0];
  const rgb = [0, 1, 2].map((c) => (top[c] * top[3] + under[c] * under[3] * (1 - top[3])) / a);
  return [...rgb, a];
}

interface Sprite {
  data: Buffer;
  width: number;
  height: number;
}

/** A sprite as raw RGBA, cropped to its visible pixels so it centres on what's drawn. */
async function loadSprite(file: string): Promise<Sprite> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let [x0, y0, x1, y1] = [info.width, info.height, -1, -1];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] === 0) continue;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  }
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const cropped = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    data.copy(
      cropped,
      y * width * 4,
      ((y + y0) * info.width + x0) * 4,
      ((y + y0) * info.width + x1 + 1) * 4,
    );
  }
  return { data: cropped, width, height };
}

/**
 * One thumbnail: the sprite at the largest whole scale that fits, centred in
 * the frame, multiplied by `tint` (the site's mix-blend-mode: multiply; white
 * leaves full-colour sprites as they are).
 */
async function drawIcon(frame: Buffer, sprite: Sprite, tint: number[], file: string) {
  const scale = Math.min(MAX_SCALE, Math.floor(INNER / Math.max(sprite.width, sprite.height)));
  const left = Math.floor((SIZE - sprite.width * scale) / 2);
  const top = Math.floor((SIZE - sprite.height * scale) / 2);
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = (y * SIZE + x) * 4;
      let px = [frame[o], frame[o + 1], frame[o + 2], frame[o + 3] / 255];
      const sx = Math.floor((x - left) / scale);
      const sy = Math.floor((y - top) / scale);
      if (x >= left && y >= top && sx < sprite.width && sy < sprite.height) {
        const i = (sy * sprite.width + sx) * 4;
        const tinted = [0, 1, 2].map((c) => (sprite.data[i + c] * tint[c]) / 255);
        px = over([...tinted, sprite.data[i + 3] / 255], px);
      }
      out[o] = Math.round(px[0]);
      out[o + 1] = Math.round(px[1]);
      out[o + 2] = Math.round(px[2]);
      out[o + 3] = Math.round(px[3] * 255);
    }
  }
  await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png({ palette: true })
    .toFile(file);
}

/** The scroll (public/images/scroll.png, 49×32) at 4×, and portraits (32–40px) at 3× on it. */
const SCROLL_SCALE = 4;
const PORTRAIT_SCALE = 3;

/** A monster portrait centred on the scroll, like the portrait on the monster page. */
async function drawOnScroll(name: string, file: string) {
  const scroll = sharp(path.join(publicDir, "images/scroll.png"));
  const { width = 0, height = 0 } = await scroll.metadata();
  const portrait = sharp(path.join(publicDir, "images/monsters", `${name}.png`));
  const size = await portrait.metadata();
  const w = (size.width ?? 0) * PORTRAIT_SCALE;
  const h = (size.height ?? 0) * PORTRAIT_SCALE;
  const W = width * SCROLL_SCALE;
  const H = height * SCROLL_SCALE;
  await scroll
    .resize(W, H, { kernel: "nearest" })
    .composite([
      {
        input: await portrait.resize(w, h, { kernel: "nearest" }).toBuffer(),
        left: Math.floor((W - w) / 2),
        top: Math.floor((H - h) / 2),
      },
    ])
    .png({ palette: true })
    .toFile(file);
}

async function writeIcons() {
  // scripts/lib/embed-frame.png is the site's blue card frame (the
  // card-frame-blue utility in globals.css, with its patterned fill) drawn by
  // the browser at 180px, on a transparent background.
  const frame = await sharp(path.join(process.cwd(), "scripts/lib/embed-frame.png"))
    .ensureAlpha()
    .raw()
    .toBuffer();

  const dir = path.join(outDir, "icons");
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;

  // Weapons, armour and decorations: one per tint.
  for (const type of EMBED_ICON_TYPES) {
    const sprite = await loadSprite(path.join(publicDir, "images", `${type}.png`));
    for (const [name, hex] of Object.entries(EMBED_ICON_TINTS)) {
      const tint = hex ? hexToRgb(hex) : [255, 255, 255];
      await drawIcon(frame, sprite, tint, path.join(dir, `${type}-${name}.png`));
      count++;
    }
  }

  // Monsters: their portrait on the scroll, as on the monster page. The
  // category icon stands in for monsters without a portrait of their own.
  for (const category of getMonsterCategories()) {
    await drawOnScroll(category, path.join(dir, `monster-${category}.png`));
    count++;
    for (const m of getMonsters(category)) {
      if (!fs.existsSync(path.join(publicDir, "images/monsters", `${m.slug}.png`))) continue;
      await drawOnScroll(m.slug, path.join(dir, `monster-${m.slug}.png`));
      count++;
    }
  }
  return count;
}

function writeOembed(route: string, author: EmbedAuthor) {
  const file = path.join(publicDir, oembedPath(route));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(oembedJson(author)));
}

function writeOembeds() {
  let count = 0;
  for (const type of WEAPON_TYPES) {
    for (const w of getWeapons(type)) {
      writeOembed(`/blacksmith/${type}/${w.slug}/`, weaponAuthor(w));
      count++;
    }
  }
  for (const { slot, rank } of getArmorParams()) {
    for (const p of getArmorPieces(slot, rank)) {
      writeOembed(`/armorsmith/${slot}/${rank}/${p.slug}/`, armorAuthor(p));
      count++;
    }
  }
  for (const d of getDecorations()) {
    writeOembed(`/decorations/${d.slug}/`, decorationAuthor(d));
    count++;
  }
  for (const category of getMonsterCategories()) {
    for (const m of getMonsters(category)) {
      writeOembed(`/monsters/${category}/${m.slug}/`, monsterAuthor(category));
      count++;
    }
  }
  return count;
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  const icons = await writeIcons();
  const oembeds = writeOembeds();
  console.log(`Wrote ${icons} embed icons and ${oembeds} oEmbed files to public/embed/`);
}

main();
