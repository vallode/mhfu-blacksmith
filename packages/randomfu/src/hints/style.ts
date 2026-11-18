/**
 * How randomfu styles text it writes into the game (the bookshelf guides),
 * from what a probe article showed on the EU disc in PPSSPP. Use these
 * names rather than raw codes, and `compact` every page.
 *
 * Text codes (in the message files' UTF-8 text):
 *
 * - `~Cnn` colours what follows until the next code; `~C00` is white, the
 *   default. Codes cost 4 bytes each and no width (`width` strips them).
 *   Spaces look the same in any colour, so `compact` skips codes there.
 * - `~C30` draws black text on a white box, a box per word (spaces aren't
 *   boxed). `~C01` and `~C25` are black: unreadable on the shelf's dark
 *   background, never use them.
 * - `~B00`-`~B09` are button icons: ○ × △ □ L R START SELECT, analog stick,
 *   d-pad. A page drew only its first ten icons (later ones, and
 *   `~B10`-`~B12`, were blank). `~A00`/`~A01` stand for numbers: avoid.
 * - Symbols that render, each two columns wide: the game's own ♪ → ★ ◇ ◆ ●
 *   ○ ∞ ※ ①-⑤ Ⅱ €, and ☆ ■ □ ▲ ▼ △ ▽ ◎ ← ↑ ↓ × ÷ ♂ ♀ ♦ ♥ ± √ ∴ 〒.
 *   "…" and "·" render as faint dots.
 *
 * A bookshelf page is 8 lines of 46 columns; the strings are UTF-8, so ★
 * costs 3 bytes and the guides' room is counted in bytes (`bookshelf.ts`).
 */

/** Every colour that reads on the shelf, as the probe showed it. */
export const COLOURS = {
  white: "~C00",
  softRed: "~C02",
  green: "~C03",
  cyan: "~C04",
  yellow: "~C05", // the game's own highlight: headings
  peach: "~C06",
  lightPink: "~C07",
  salmon: "~C08",
  lightGrey: "~C09",
  grey: "~C10", // dim: de-emphasis
  orange: "~C11",
  taupe: "~C12",
  crimson: "~C13",
  periwinkle: "~C14",
  pink: "~C15",
  magenta: "~C16",
  blue: "~C17",
  brightYellow: "~C18",
  red: "~C19",
  brightGreen: "~C20",
  beige: "~C21",
  lightBlue: "~C22",
  lavender: "~C23",
  amber: "~C24",
  boxed: "~C30", // black on white boxes
} as const;

export type Colour = (typeof COLOURS)[keyof typeof COLOURS];

/**
 * What each colour means in the guides. Keep to these so both books read
 * alike: one colour per kind of thing, white for plain text.
 */
export const STYLE = {
  heading: COLOURS.yellow,
  /** A monster's name at the top of its page. */
  name: COLOURS.boxed,
  /** Words that rate (Frail ... Colossal) and other asides. */
  note: COLOURS.lightGrey,
  /** "-", immune, nothing: what doesn't apply. */
  none: COLOURS.grey,
  element: {
    Fire: COLOURS.red,
    Water: COLOURS.blue,
    Thunder: COLOURS.brightYellow,
    Ice: COLOURS.cyan,
    Dragon: COLOURS.magenta,
  } as Record<string, Colour>,
  status: {
    poison: COLOURS.lavender,
    sleep: COLOURS.lightBlue,
    paralysis: COLOURS.amber,
    ko: COLOURS.salmon,
  },
  rank: { low: COLOURS.green, high: COLOURS.orange, g: COLOURS.pink },
  source: {
    shop: COLOURS.lightBlue,
    map: COLOURS.green,
    monster: COLOURS.orange,
    reward: COLOURS.amber,
  },
} as const;

/** `text` in `colour`, back to white after. `compact` drops what the next code makes redundant. */
export const paint = (colour: Colour, text: string) =>
  colour === COLOURS.white ? text : `${colour}${text}${COLOURS.white}`;

/**
 * A page with no code it doesn't need: a colour is set just before the
 * first character that shows it (not before spaces), only if it differs
 * from the colour in effect, and every line that starts in a colour says
 * so (so it reads the same whether or not the game carries colour over a
 * line break). A page ends in white.
 */
export function compact(page: string): string {
  let out = "";
  let wanted: string = COLOURS.white;
  /** The colour in effect; null at a line's start, where it isn't known. */
  let shown: string | null = COLOURS.white;
  for (let i = 0; i < page.length;) {
    const code = /^~C\d\d/.exec(page.slice(i, i + 4));
    if (code) {
      wanted = code[0];
      i += 4;
      continue;
    }
    const ch = page[i]!;
    i++;
    if (ch === "\n") {
      out += ch;
      if (shown !== COLOURS.white) shown = null;
      continue;
    }
    if (ch !== " " && ch !== "　" && wanted !== shown) {
      out += wanted;
      shown = wanted;
    }
    out += ch;
  }
  if (shown !== COLOURS.white) out += COLOURS.white;
  return out;
}
