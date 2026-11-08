/**
 * Files that link embeds (Discord and others) read, written into public/embed/
 * (git-ignored; runs in `pnpm build` before `next build`):
 *
 * - icons/<type>-<tint>.png: 180px thumbnails, the site's in-game icon sprite
 *   tinted the way the site tints it (multiply), in the site's blue card frame,
 *   with a transparent background.
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
/** Sprites are 26px; 5× sits inside the frame with a margin. */
const SCALE = 5;
const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Source-over of a straight-alpha RGBA colour onto another. */
function over(top: number[], under: number[]): number[] {
  const a = top[3] + under[3] * (1 - top[3]);
  if (a === 0) return [0, 0, 0, 0];
  const rgb = [0, 1, 2].map((c) => (top[c] * top[3] + under[c] * under[3] * (1 - top[3])) / a);
  return [...rgb, a];
}

async function writeIcons() {
  // scripts/lib/embed-frame.png is the site's blue card frame (the
  // card-frame-blue utility in globals.css, without its fill) drawn by the
  // browser at 180px. Inside it the icon is transparent.
  const frame = await sharp(path.join(process.cwd(), "scripts/lib/embed-frame.png"))
    .ensureAlpha()
    .raw()
    .toBuffer();

  const dir = path.join(outDir, "icons");
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;

  for (const type of EMBED_ICON_TYPES) {
    const { data: sprite, info } = await sharp(path.join(publicDir, "images", `${type}.png`))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const left = Math.floor((SIZE - info.width * SCALE) / 2);
    const top = Math.floor((SIZE - info.height * SCALE) / 2);

    for (const [name, hex] of Object.entries(EMBED_ICON_TINTS)) {
      const tint = hex ? hexToRgb(hex) : [255, 255, 255];
      const out = Buffer.alloc(SIZE * SIZE * 4);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const o = (y * SIZE + x) * 4;
          let px = [frame[o], frame[o + 1], frame[o + 2], frame[o + 3] / 255];

          const sx = Math.floor((x - left) / SCALE);
          const sy = Math.floor((y - top) / SCALE);
          if (x >= left && y >= top && sx < info.width && sy < info.height) {
            const i = (sy * info.width + sx) * 4;
            // Sprite colour × tint (the site's mix-blend-mode: multiply).
            const tinted = [0, 1, 2].map((c) => (sprite[i + c] * tint[c]) / 255);
            px = over([...tinted, sprite[i + 3] / 255], px);
          }
          out[o] = Math.round(px[0]);
          out[o + 1] = Math.round(px[1]);
          out[o + 2] = Math.round(px[2]);
          out[o + 3] = Math.round(px[3] * 255);
        }
      }
      await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 4 } })
        .png({ palette: true })
        .toFile(path.join(dir, `${type}-${name}.png`));
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
