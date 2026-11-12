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
 * - set-data.json: every armor piece and decoration a set share code can
 *   name, which the Cloudflare Worker reads to give shared sets their own
 *   embeds. See src/lib/set-embed.ts. Needs the /data bundles, so this runs
 *   after scripts/generate-data.ts.
 * - set-card/: what the Worker draws a shared set's card image with
 *   (src/lib/set-card.ts): frame.png, the site's card frame at the card's
 *   size, and sprites.json, the icons it uses, tinted and scaled, as data:
 *   URIs.
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
import { buildCodecTables } from "../src/lib/set-codec";
import {
  CARD,
  cardSpriteSources,
  SET_CARD_FRAME_PATH,
  SET_CARD_SPRITES_PATH,
  SPRITE_SCALE,
  type CardSprites,
} from "../src/lib/set-card";
import { SET_EMBED_DATA_PATH, setEmbedData } from "../src/lib/set-embed";
import { getWeapons } from "../src/lib/weapons";
import { readSetSearchData } from "./lib/set-data";

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

/** A sprite multiplied by `tint` (as the site tints icons), at SPRITE_SCALE, as a data: URI. */
async function tintedSprite(file: string, hex: string | undefined): Promise<string> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (hex) {
    const tint = hexToRgb(hex);
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) data[i + c] = Math.round((data[i + c] * tint[c]) / 255);
    }
  }
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(info.width * SPRITE_SCALE, info.height * SPRITE_SCALE, { kernel: "nearest" })
    .png({ palette: true })
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * The site's card frame (the card-frame utility's border image in
 * globals.css: 160×80, 24px slices top and bottom, 32px at the sides, with
 * its fill), drawn `width`×`height` by repeating its middle strips. The
 * size must be a whole number of strips, so no tile is cut.
 */
async function drawFrame(width: number, height: number): Promise<Buffer> {
  const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf-8");
  const m =
    /@utility card-frame \{[^}]*?border-image-source: url\("data:image\/png;base64,([^"]+)"\)/.exec(
      css,
    );
  if (!m) throw new Error("No card-frame border image in globals.css");
  const { data: art, info } = await sharp(Buffer.from(m[1], "base64"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { frameTop: top, frameSide: side } = CARD;
  const midX = info.width - 2 * side;
  const midY = info.height - 2 * top;
  if ((width - 2 * side) % midX || (height - 2 * top) % midY) {
    throw new Error(`A ${width}×${height} frame would cut its ${midX}×${midY} strips`);
  }
  const pick = (v: number, size: number, edge: number, mid: number, artSize: number) =>
    v < edge ? v : v >= size - edge ? v - (size - artSize) : edge + ((v - edge) % mid);
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = pick(y, height, top, midY, info.height);
    for (let x = 0; x < width; x++) {
      const sx = pick(x, width, side, midX, info.width);
      art.copy(
        out,
        (y * width + x) * 4,
        (sy * info.width + sx) * 4,
        (sy * info.width + sx + 1) * 4,
      );
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } })
    .png({ palette: true })
    .toBuffer();
}

/** The set card's frame and sprites. */
async function writeSetCard() {
  const dir = path.join(publicDir, path.dirname(SET_CARD_FRAME_PATH));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(publicDir, SET_CARD_FRAME_PATH),
    await drawFrame(CARD.width, CARD.height),
  );

  const sprites: CardSprites = {};
  for (const { name, file, tint } of cardSpriteSources()) {
    sprites[name] = await tintedSprite(path.join(publicDir, "images", file), tint);
  }
  fs.writeFileSync(path.join(publicDir, SET_CARD_SPRITES_PATH), JSON.stringify(sprites));
  return Object.keys(sprites).length;
}

/** The pieces and decorations share codes name, for the Worker's set embeds. */
function writeSetData() {
  const { data, ids } = readSetSearchData(path.join(publicDir, "data"));
  const tables = buildCodecTables(data, ids);
  const { version } = JSON.parse(
    fs.readFileSync(path.join(publicDir, "data", "data-manifest.json"), "utf-8"),
  ) as { version: string };
  const embedData = setEmbedData(data, tables, version);
  fs.writeFileSync(path.join(publicDir, SET_EMBED_DATA_PATH), JSON.stringify(embedData));
  return Object.keys(embedData.pieces).length + Object.keys(embedData.decorations).length;
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  const icons = await writeIcons();
  const oembeds = writeOembeds();
  const setEntries = writeSetData();
  const cardSprites = await writeSetCard();
  console.log(
    `Wrote ${icons} embed icons, ${oembeds} oEmbed files, set data for ${setEntries} pieces and decorations, and the set card with ${cardSprites} sprites to public/embed/`,
  );
}

main();
