import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

// Which icon types have a tintable mask / badge image under public/images.
// The colours themselves live in the @theme block in src/app/globals.css
// (--color-rarity-*, --color-gem-*, --color-note-*); this file only says
// which names exist. To add a type, drop the PNG(s) in public/images and add
// the name here.

/** Item, weapon and armor types with a mask at /images/<type>.png (and <type>-mini.png). */
const ITEM_MASKS = new Set([
  "great-sword",
  "long-sword",
  "sword-and-shield",
  "dual-blades",
  "hammer",
  "hunting-horn",
  "lance",
  "gunlance",
  "light-bowgun",
  "heavy-bowgun",
  "bow",
  "decoration",
  "deco",
  "herb",
  "seed",
  "meat",
  "note",
  "bone",
  "ore",
  "fish",
  "hide",
  "sac",
  "claw",
  "scale",
  "pelt",
  "insect",
  "fluid",
  "part",
  "egg",
  "ticket",
  "bait",
  "webbing",
  "mushroom",
  "shell",
  "heavenly",
  "stone",
  "coin",
  "ukwn",
  "helmet",
  "plate",
  "gauntlets",
  "waist",
  "leggings",
]);

/** Monster categories with a mask at /images/monsters/<type>.png. */
const MONSTER_MASKS = new Set([
  "bird-wyvern",
  "carapaceon",
  "elder-dragon",
  "flying-wyvern",
  "herbivore",
  "lynian",
  "neopteron",
  "pelagus",
  "piscine-wyvern",
]);

/** Element badges drawn in the bottom-right corner, from /images/<element>.png. */
const ELEMENT_BADGES = new Set([
  "fire",
  "thunder",
  "poison",
  "water",
  "ice",
  "sleep",
  "dragon",
  "paralysis",
]);

/** Rank badges drawn in the bottom-right corner, from /images/<rank>.png. */
const RANK_BADGES = new Set(["high-rank", "g-rank"]);

/** Names that have a --color-gem-* token. */
const GEM_COLORS = new Set([
  "blue",
  "cyan",
  "gray",
  "green",
  "orange",
  "pink",
  "red",
  "slate",
  "white",
  "yellow",
]);

/** Names that have a --color-note-* token (passed as color="note-a" etc.). */
const NOTE_COLORS = new Set(["a", "b", "g", "p", "r", "w", "y"]);

export interface IconStyleOptions {
  type: string;
  rarity?: number | null;
  color?: string | null;
  element?: string | null;
  rank?: string | null;
  /** Size of the mask image; "mini" uses the -mini.png mask. */
  size?: "default" | "large" | "mini";
  nav?: boolean;
  /** Highlights the icon with the rarity-4 green (used by nav icons). */
  active?: boolean;
  monster?: boolean;
}

function tintFor({ rarity, color, active }: IconStyleOptions): string | undefined {
  if (color?.startsWith("note-")) {
    const note = color.slice("note-".length);
    if (NOTE_COLORS.has(note)) return `var(--color-note-${note})`;
  } else if (color && GEM_COLORS.has(color)) {
    return `var(--color-gem-${color})`;
  }
  if (rarity && rarity >= 4 && rarity <= 10) return `var(--color-rarity-${rarity})`;
  if (active) return "var(--color-rarity-4)";
  return undefined;
}

function maskFor({ type, size }: IconStyleOptions): string | undefined {
  if (ITEM_MASKS.has(type)) {
    return `url("/images/${type}${size === "mini" ? "-mini" : ""}.png")`;
  }
  if (MONSTER_MASKS.has(type)) return `url("/images/monsters/${type}.png")`;
  return undefined;
}

/**
 * Class names and inline CSS variables for an icon wrapper. The icon is a
 * sprite <img> with an optional colour tint (a mask over the sprite, filled
 * with the rarity/gem/note colour) and an optional corner badge.
 */
export function iconStyle(opts: IconStyleOptions): { className: string; style: CSSProperties } {
  const { element, rank, size, nav } = opts;
  const mask = maskFor(opts);
  const tint = tintFor(opts);
  // Only one corner badge fits; rank wins over element.
  const badge =
    rank && RANK_BADGES.has(rank)
      ? "rank"
      : element && ELEMENT_BADGES.has(element)
        ? "element"
        : null;

  const style: Record<string, string> = {};
  if (mask) style["--icon-mask"] = mask;
  if (tint) style["--icon-tint"] = tint;
  if (badge) style["--icon-badge"] = `url("/images/${badge === "element" ? element : rank}.png")`;

  return {
    className: cn(
      "relative mr-[6px] flex h-[32px] w-[32px] flex-[0_0_3.2rem]",
      // flex-basis must grow with the box or the row squashes it horizontally
      size === "large" && "h-[52px] w-[52px] flex-[0_0_52px]",
      // The tint multiplies over the sprite alone: isolate makes the icon its
      // blend group. Without it the group is the nearest stacking context (a
      // card's body), and Safari, compositing a hovered row for its glow
      // animation, stops drawing the card's background under it.
      mask && "isolate before:icon-mask",
      // Tint fill. Nav icons are grey until hovered, unless tinted (active).
      mask && !nav && "before:[background:var(--icon-tint)]",
      mask && nav && "before:bg-[var(--icon-tint,#bdbdbd)] hover:before:bg-white",
      badge && "after:icon-badge",
      badge === "element" && "after:[background-position:bottom_-1px_right_-1px]",
      badge === "rank" &&
        "after:[background-size:37.5px_39px] after:[background-position:bottom_0px_right_0px]",
    ),
    style: style as CSSProperties,
  };
}

/** Classes for the sprite <img> inside an icon wrapper. */
export function iconImgClass({
  size,
  monster,
}: Pick<IconStyleOptions, "size" | "monster">): string {
  return cn(
    "relative h-[32px] w-[32px] pixelated",
    size === "large" && "h-[52px] w-[52px]",
    monster && "p-[4px]",
  );
}
