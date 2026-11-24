/**
 * The image in a shared set's link embed (`/set-builder/card.png?s=<code>`):
 * the set as a card, laid out after the set builder's editor. A row per
 * piece (weapon first) with its decorations (or "-") under it, then the
 * activated skills and the Status panel beside them.
 *
 * This builds the card as a satori element tree; the Cloudflare Worker
 * (src/cloudflare/worker.ts) renders it to a PNG. The frame and the tinted
 * sprites are made by scripts/generate-embeds.ts, since satori can't draw a
 * 9-slice frame or tint an image. Pure: no fs, no process.env.
 */
import { ARMOR_SLOTS } from "./constants";
import {
  CARD,
  CARD_FONT,
  CARD_FONT_PATH,
  cardShell,
  COLOR,
  h,
  text,
  type CardNode,
} from "./card-tree";
import { EMBED_ICON_TINTS, tally, tintFor } from "./embed-format";
import { binSlots, evaluateBuild, type BuildSet } from "./set-build";
import type { DecoBin, Piece, SkillTreeData } from "./set-search";

/** Bump when the card's look changes, so caches and link previews pick it up. */
export const SET_CARD_VERSION = 5;

export { CARD, type CardNode };

/** Where the build writes the card's frame and sprites, under public/. */
export const SET_CARD_ASSETS_PATH = "/embed/set-card.json";
export const SET_CARD_FONT_PATH = CARD_FONT_PATH;
export const SET_CARD_FONT = CARD_FONT;

/** Sprites are drawn at this many times their size (the 16px mini icons at 32px). */
export const SPRITE_SCALE = 2;
export const SPRITE_SIZE = 16 * SPRITE_SCALE;
/** A slot circle, about the cap height of the row's name. */
const SLOT_SIZE = 24;

/** The sprites the card uses, by name (see spriteName): data: URIs. */
export type CardSprites = Record<string, string>;

/** What the build writes to SET_CARD_ASSETS_PATH: the frame at the card's size, and the sprites, as data: URIs. */
export interface CardAssets {
  frame: string;
  sprites: CardSprites;
}

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
    { name: "slot-empty", file: "slot-empty.png" },
  ];
}

const img = (sprites: CardSprites, name: string, size = SPRITE_SIZE) =>
  sprites[name] ? h("img", { src: sprites[name], style: { width: size, height: size } }) : null;

/**
 * A jewel's name without "Jewel" (or the game's shortened "Jwl"), which its
 * icon says: "Attack", "Steadfast+", "Snowblower+".
 */
export const jewelLabel = (name: string) => name.replace(/ ?(?:Jewel|Jwl)(?=\+|$)/, "");

/**
 * The line under a piece: its decorations, as "Attack ×2" beside the jewel's
 * icon, or "-" when it has none. Every piece has the line, so rows are the
 * same height on every card. Decorations in a bin with no slots (a shared
 * set's missing piece) count for nothing, as in evaluateBuild, so they
 * aren't drawn.
 */
function decoLine(set: BuildSet, bin: DecoBin, sprites: CardSprites): CardNode {
  const counts =
    binSlots(set, bin) === 0
      ? []
      : tally(
          set.decorations.filter((d) => d.bin === bin),
          (d) => d.deco.name,
        );
  return h(
    "div",
    // 18px fits the longest three different jewels a bin can hold
    // (DivineProtect, Snowblower+, HvnlyShield) in one line under the name;
    // anything longer is cut off rather than run into the skills.
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: SPRITE_SIZE,
        marginLeft: 68,
        fontSize: 18,
        color: counts.length > 0 ? COLOR.white : COLOR.faint,
        overflow: "hidden",
      },
    },
    ...(counts.length > 0
      ? counts.map(([{ deco }, n]) =>
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" } },
            img(sprites, spriteName(ICONS.decoration, null, deco.color)),
            `${jewelLabel(deco.name)}${n > 1 ? ` ×${n}` : ""}`,
          ),
        )
      : ["-"]),
  );
}

/** A row's slots as empty circles, dashes for the missing ones. */
function slotMarks(sprites: CardSprites, count: number): CardNode {
  const missing = Math.max(0, 3 - count);
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" } },
    ...Array.from({ length: Math.min(count, 3) }, () => img(sprites, "slot-empty", SLOT_SIZE)),
    missing > 0 && text({ color: COLOR.faint, fontSize: SLOT_SIZE }, "-".repeat(missing)),
  );
}

function equipRow(
  icon: CardNode | null,
  name: CardNode,
  slots: number,
  decos: CardNode,
  sprites: CardSprites,
): CardNode {
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 2 } },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", height: 44 } },
      h("div", { style: { display: "flex", width: SPRITE_SIZE, marginRight: 8 } }, icon),
      text({ color: COLOR.stat, fontSize: 32, width: 28 }, ":"),
      h("div", { style: { display: "flex", flexGrow: 1, alignItems: "baseline", gap: 12 } }, name),
      slotMarks(sprites, slots),
    ),
    decos,
  );
}

function pieceName(piece: Piece | null): CardNode {
  if (!piece) return text({ color: COLOR.faint, fontSize: 32 }, "-");
  return h(
    "div",
    { style: { display: "flex", alignItems: "baseline", gap: 12 } },
    text({ color: COLOR.white, fontSize: 32 }, piece.name),
    piece.torsoUp && text({ color: COLOR.faint, fontSize: 18 }, "Torso Up"),
  );
}

/** How many skills fit beside the Status panel before "and N more" (bad skills always show). */
export const MAX_SKILLS = 7;

/**
 * The card for a set, as a satori element tree. `frame` is the frame image
 * (CardAssets.frame) as a data: URI.
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
        text({ color: "rgba(255,255,255,0.6)", fontSize: 32 }, "Weapon"),
        set.weaponSlots,
        decoLine(set, "weapon", sprites),
        sprites,
      ),
    ...ARMOR_SLOTS.map((slot, i) => {
      const p = set.pieces[i];
      return equipRow(
        img(sprites, spriteName(slot, p?.rarity)),
        pieceName(p),
        binSlots(set, slot),
        decoLine(set, slot, sprites),
        sprites,
      );
    }),
  ];

  const bad = stats.skills.filter((s) => s.threshold < 0).slice(0, MAX_SKILLS);
  const good = stats.skills.filter((s) => s.threshold > 0);
  const shown = [...good.slice(0, MAX_SKILLS - bad.length), ...bad];
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

  return cardShell(
    frame,
    h(
      "div",
      { style: { display: "flex", gap: 36, flexGrow: 1 } },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 8, width: 620 } },
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
  );
}
