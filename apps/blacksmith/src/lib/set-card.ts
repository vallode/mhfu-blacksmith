/**
 * The image in a shared set's link embed (`/set-builder/card.png?s=<code>`):
 * the set as a card, laid out after the set builder's editor. A row per
 * piece (weapon first) with its decorations under it, then the activated
 * skills and the Status panel beside them.
 *
 * This builds the card as a satori element tree; the Cloudflare Worker
 * (src/cloudflare/worker.ts) renders it to a PNG. The frame and the tinted
 * sprites are made by scripts/generate-embeds.ts, since satori can't draw a
 * 9-slice frame or tint an image. Pure: no fs, no process.env.
 */
import { ARMOR_SLOTS } from "./constants";
import { EMBED_ICON_TINTS, tintFor } from "./embed-format";
import { binSlots, evaluateBuild, type BuildSet } from "./set-build";
import { setLabel } from "./set-embed";
import type { DecoBin, Piece, SkillTreeData } from "./set-search";

/** Bump when the card's look changes, so caches and link previews pick it up. */
export const SET_CARD_VERSION = 1;

/**
 * The image: the site's card frame (the card-frame art, at the game's 4×,
 * drawn 1:1) and what's in it, about the usual large link-preview shape
 * (1.91:1). The frame tiles in 96×32 periods, so its middle is a whole number
 * of them: 32 + 11 × 96 + 32 wide and 24 + 17 × 32 + 24 high. Around it, the
 * frame's notches are transparent.
 */
export const CARD = { width: 1120, height: 592, frameTop: 24, frameSide: 32 } as const;

/** Where the build writes the card's frame and sprites, under public/. */
export const SET_CARD_FRAME_PATH = "/embed/set-card/frame.png";
export const SET_CARD_SPRITES_PATH = "/embed/set-card/sprites.json";
export const SET_CARD_FONT_PATH = "/fonts/biz-udgothic-latin-400-normal.ttf";
export const SET_CARD_FONT = "BIZ UDGothic";

/** Sprites are drawn at this many times their size (the 16px mini icons at 32px). */
export const SPRITE_SCALE = 2;
export const SPRITE_SIZE = 16 * SPRITE_SCALE;

/** The sprites the card uses, by name (see spriteName): data: URIs. */
export type CardSprites = Record<string, string>;

/** Icons the card draws: armor slots, decorations, the two weapon classes, elements. */
const ICONS = {
  decoration: "decoration",
  weapons: { Blademaster: "great-sword", Gunner: "heavy-bowgun" },
  elements: ["fire", "water", "thunder", "ice", "dragon"],
} as const;

/** A sprite's name: its icon, then its tint as embedIcon names it ("helmet-rarity-7", "decoration-blue"). */
export function spriteName(icon: string, rarity?: number | null, gem?: string | null): string {
  if (gem && tintFor(null, gem)) return `${icon}-${gem}`;
  if (tintFor(rarity)) return `${icon}-rarity-${rarity}`;
  return `${icon}-plain`;
}

/**
 * Every sprite the card can use, for the build to make: its name, its image
 * in public/images, and the colour it's tinted with (multiplied, as the site
 * tints icons). Armor is tinted by rarity, decorations by gem colour.
 */
export function cardSpriteSources(): { name: string; file: string; tint?: string }[] {
  const tints = Object.entries(EMBED_ICON_TINTS);
  const byRarity = tints.filter(([t]) => t === "plain" || t.startsWith("rarity-"));
  const byGem = tints.filter(([t]) => !t.startsWith("rarity-"));
  return [
    ...ARMOR_SLOTS.flatMap((slot) =>
      byRarity.map(([t, tint]) => ({ name: `${slot}-${t}`, file: `${slot}-mini.png`, tint })),
    ),
    ...byGem.map(([t, tint]) => ({
      name: `${ICONS.decoration}-${t}`,
      file: `${ICONS.decoration}-mini.png`,
      tint,
    })),
    ...Object.values(ICONS.weapons).map((w) => ({ name: `${w}-plain`, file: `${w}-mini.png` })),
    ...ICONS.elements.map((e) => ({ name: `${e}-plain`, file: `${e}.png` })),
  ];
}

// Colours from the @theme block in src/app/globals.css.
const COLOR = {
  stat: "#ffff50",
  negative: "#f9455c",
  hr: "#6e905f",
  parchment: "#c3be9f",
  white: "#ffffff",
  faint: "rgba(255,255,255,0.5)",
};

/** satori's element shape: what React.createElement makes, without React. */
export interface CardNode {
  type: string;
  props: { style?: Record<string, unknown>; src?: string; children?: CardChild | CardChild[] };
}
type CardChild = CardNode | string | number | null | false;

function h(
  type: string,
  props: { style?: Record<string, unknown>; src?: string },
  ...children: CardChild[]
): CardNode {
  const kept = children.filter((c) => c !== null && c !== false);
  return { type, props: { ...props, children: kept.length === 1 ? kept[0] : kept } };
}

const text = (style: Record<string, unknown>, value: string | number) =>
  h("div", { style: { display: "flex", ...style } }, String(value));

const img = (sprites: CardSprites, name: string, size = SPRITE_SIZE) =>
  sprites[name] ? h("img", { src: sprites[name], style: { width: size, height: size } }) : null;

/** The game's slot glyphs: "OO-". */
const slotText = (count: number) =>
  Array.from({ length: 3 }, (_, i) => (i < count ? "O" : "-")).join("");

/** Decorations in a bin, as "Attack ×2" beside the jewel's icon ("Jewel" is in the icon). */
function decoLine(set: BuildSet, bin: DecoBin, sprites: CardSprites): CardNode | null {
  const counts = new Map<string, { n: number; color?: string }>();
  for (const d of set.decorations) {
    if (d.bin !== bin) continue;
    const c = counts.get(d.deco.name) ?? { n: 0, color: d.deco.color };
    c.n++;
    counts.set(d.deco.name, c);
  }
  if (counts.size === 0) return null;
  return h(
    "div",
    { style: { display: "flex", gap: 18, marginLeft: 66, fontSize: 20, color: COLOR.white } },
    ...[...counts].map(([name, { n, color }]) =>
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 4 } },
        img(sprites, spriteName(ICONS.decoration, null, color)),
        `${name.replace(/ Jewel$/, "")}${n > 1 ? ` ×${n}` : ""}`,
      ),
    ),
  );
}

function equipRow(
  icon: CardNode | null,
  name: CardNode,
  slots: number,
  decos: CardNode | null,
): CardNode {
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 2 } },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", height: 38 } },
      h("div", { style: { display: "flex", width: SPRITE_SIZE, marginRight: 8 } }, icon),
      text({ color: COLOR.stat, fontSize: 28, width: 26 }, ":"),
      h("div", { style: { display: "flex", flexGrow: 1, alignItems: "baseline", gap: 12 } }, name),
      text({ color: COLOR.faint, fontSize: 22 }, slotText(slots)),
    ),
    decos,
  );
}

function pieceName(piece: Piece | null): CardNode {
  if (!piece) return text({ color: COLOR.faint, fontSize: 28 }, "-");
  return h(
    "div",
    { style: { display: "flex", alignItems: "baseline", gap: 12 } },
    text({ color: COLOR.white, fontSize: 28 }, piece.name),
    piece.torsoUp && text({ color: COLOR.faint, fontSize: 18 }, "Torso Up"),
  );
}

/** How many skills fit beside the Status panel before "and N more". */
const MAX_SKILLS = 7;

/**
 * The card for a set, as a satori element tree. `frame` is the frame image
 * (SET_CARD_FRAME_PATH) as a data: URI.
 */
export function setCardTree(
  set: BuildSet,
  trees: SkillTreeData[],
  sprites: CardSprites,
  frame: string,
): CardNode {
  const stats = evaluateBuild({ trees, pieces: [], decorations: [] }, set);

  const showWeapon = set.weaponSlots > 0 || set.decorations.some((d) => d.bin === "weapon");
  const rows = [
    showWeapon &&
      equipRow(
        img(sprites, `${ICONS.weapons[set.hunterType]}-plain`),
        text({ color: "rgba(255,255,255,0.6)", fontSize: 28 }, "Weapon"),
        set.weaponSlots,
        decoLine(set, "weapon", sprites),
      ),
    ...ARMOR_SLOTS.map((slot, i) => {
      const p = set.pieces[i];
      return equipRow(
        img(sprites, spriteName(slot, p?.rarity)),
        pieceName(p),
        binSlots(set, slot),
        decoLine(set, slot, sprites),
      );
    }),
  ];

  const shown = stats.skills.slice(0, MAX_SKILLS);
  const more = stats.skills.length - shown.length;
  const skills = h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 4 } },
    text({ color: COLOR.stat, fontSize: 24, marginBottom: 6 }, "[Activate Skill]"),
    shown.length === 0 && text({ color: COLOR.faint, fontSize: 24 }, "None"),
    ...shown.map((s) =>
      text({ color: s.threshold < 0 ? COLOR.negative : COLOR.white, fontSize: 26 }, s.name),
    ),
    more > 0 && text({ color: COLOR.faint, fontSize: 20 }, `and ${more} more`),
  );

  const statLine = (label: string | CardNode, value: number) =>
    h(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
      typeof label === "string" ? text({ color: COLOR.stat, fontSize: 24 }, label) : label,
      text({ color: COLOR.white, fontSize: 24 }, value),
    );
  const resRow = (from: number, to: number) =>
    h(
      "div",
      { style: { display: "flex", gap: 22 } },
      ...ICONS.elements
        .slice(from, to)
        .map((el, j) =>
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: 6, width: 100 } },
            img(sprites, `${el}-plain`),
            text({ color: COLOR.white, fontSize: 24 }, stats.res[from + j]),
          ),
        ),
    );
  const status = h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 10 } },
    text({ color: COLOR.stat, fontSize: 24 }, "Status"),
    statLine("Defense", stats.defence),
    resRow(0, 3),
    resRow(3, 5),
    statLine("Free Slots", stats.freeSlots),
  );

  const { width, height, frameTop, frameSide } = CARD;
  return h(
    "div",
    {
      style: {
        display: "flex",
        width,
        height,
        backgroundImage: `url(${frame})`,
        backgroundSize: `${width}px ${height}px`,
        fontFamily: SET_CARD_FONT,
        letterSpacing: "0.14em",
        color: COLOR.white,
        textShadow: "2px 2px 0 #000",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: frameSide + 20,
          top: frameTop + 14,
          width: width - 2 * (frameSide + 20),
          height: height - 2 * (frameTop + 14),
        },
      },
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } },
        text({ color: COLOR.stat, fontSize: 32 }, setLabel(set)),
        text({ color: COLOR.parchment, fontSize: 20 }, "MHFU Blacksmith"),
      ),
      h("div", {
        style: { display: "flex", height: 3, backgroundColor: COLOR.hr, margin: "10px 0 14px" },
      }),
      h(
        "div",
        { style: { display: "flex", gap: 36, flexGrow: 1 } },
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: 8, width: 600 } },
          ...rows,
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              flexGrow: 1,
            },
          },
          skills,
          status,
        ),
      ),
    ),
  );
}
