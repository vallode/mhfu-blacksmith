/**
 * Building blocks of the link-preview cards (set-card.ts, monster-card.ts):
 * satori element trees, without React. Pure: no fs, no process.env.
 */
import { UI_COLORS } from "./embed-format";

/**
 * The image: the site's card frame (the card-frame art, at the game's 4×,
 * drawn 1:1) and what's in it, about the usual large link-preview shape
 * (1.91:1). The frame tiles in 96×32 periods, so its middle is a whole number
 * of them: 32 + 11 × 96 + 32 wide and 24 + 17 × 32 + 24 high. Around it, the
 * frame's notches are transparent.
 */
export const CARD = { width: 1120, height: 592, frameTop: 24, frameSide: 32 } as const;

export const CARD_FONT_PATH = "/fonts/biz-udgothic-latin-400-normal.ttf";
export const CARD_FONT = "BIZ UDGothic";

// The @theme tokens the cards use (embed-format.ts keeps the copies satori needs).
export const COLOR = {
  ...UI_COLORS,
  white: "#ffffff",
  faint: "rgba(255,255,255,0.5)",
  positive: "#52f152",
  unavailable: "#808080",
  parchment: "#c3be9f",
};

/** satori's element shape: what React.createElement makes, without React. */
export interface CardNode {
  type: string;
  props: { style?: Record<string, unknown>; src?: string; children?: CardChild | CardChild[] };
}
export type CardChild = CardNode | string | number | null | false;

export function h(
  type: string,
  props: { style?: Record<string, unknown>; src?: string },
  ...children: CardChild[]
): CardNode {
  const kept = children.filter((c) => c !== null && c !== false);
  return { type, props: { ...props, children: kept.length === 1 ? kept[0] : kept } };
}

export const text = (style: Record<string, unknown>, value: string | number) =>
  h("div", { style: { display: "flex", ...style } }, String(value));

/**
 * The card's outer box: the frame image `frame` (a data: URI of the frame at
 * CARD's size) behind `content`, which sits inside the frame's border.
 */
export function cardShell(frame: string, content: CardNode): CardNode {
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
        fontFamily: CARD_FONT,
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
      content,
    ),
  );
}
