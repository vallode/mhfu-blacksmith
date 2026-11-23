/**
 * The image in a monster page's link embed: its portrait on the scroll with
 * its HP, crown sizes and breakable parts under it, and beside them its name
 * and hitzone table, given most of the room, the best part in each column in green as on the page.
 *
 * scripts/generate-embeds.ts draws one per monster at build time (with satori
 * and resvg, like the set card the Worker draws) to monsterCardPath(). It
 * makes the frame, the portrait and the sprites too, since satori can't draw
 * a 9-slice frame or scale pixel art without smoothing. Pure: no fs, no
 * process.env, and English only, like the rest of the embeds (the names
 * spelled as the monster page's English shows them).
 */
import { CARD, cardShell, COLOR, h, text, type CardNode } from "./card-tree";
import { CROWN_ORDER, cardSize, type Crown } from "./crowns";
import { titleCase } from "./embed-format";
import type { Monster } from "./types";

/** Bump when the card's look changes, so link previews pick up the new image. */
export const MONSTER_CARD_VERSION = 2;

/** Where the build writes a monster's card, under public/. */
export const monsterCardPath = (slug: string) => `/embed/cards/monsters/${slug}.png`;

/**
 * The card's URL for the page's meta tags. Its `v` is the card version and a
 * hash of what the card shows, so a data change gets a new URL, which link
 * previews fetch again rather than keep the old image.
 */
export function monsterCardUrl(monster: Monster): string {
  const { name, type, hitzones, base_hp, base_size, crowns, breaks } = monster;
  const shown = JSON.stringify({ name, type, hitzones, base_hp, base_size, crowns, breaks });
  // FNV-1a, 32-bit.
  let hash = 0x811c9dc5;
  for (let i = 0; i < shown.length; i++) {
    hash = Math.imul(hash ^ shown.charCodeAt(i), 0x01000193);
  }
  const v = `${MONSTER_CARD_VERSION}.${(hash >>> 0).toString(36)}`;
  return `${monsterCardPath(monster.slug)}?v=${v}`;
}

/** The left column, the portrait's and the stats under it. */
const LEFT_WIDTH = 265;

/** The portrait on the scroll: public/images/scroll.png (49×32) at this scale. */
export const MONSTER_CARD_SCROLL_SCALE = 5;
/** Portraits (32–40px) at this scale on it. */
export const MONSTER_CARD_PORTRAIT_SCALE = 3;
/** Hitzone sprites (16px) at this scale. */
export const MONSTER_CARD_SPRITE_SCALE = 2;
const SPRITE = 16 * MONSTER_CARD_SPRITE_SCALE;
const SCROLL = { width: 49 * MONSTER_CARD_SCROLL_SCALE, height: 32 * MONSTER_CARD_SCROLL_SCALE };

const COLUMNS = ["cut", "bash", "shot", "fir", "wtr", "thn", "ice", "drg", "ko"] as const;
/** The sprites the card uses (public/images/<name>.png), as data: URIs by name. */
export const MONSTER_CARD_SPRITES = [
  "fire",
  "water",
  "thunder",
  "ice",
  "dragon",
  "crown-gold",
  "crown-silver",
  "crown-mini",
] as const;
export type MonsterCardSprites = Record<(typeof MONSTER_CARD_SPRITES)[number], string>;

/** Element columns head with their icon; the rest with the game's short names. */
const ELEMENT_ICONS: Partial<
  Record<(typeof COLUMNS)[number], (typeof MONSTER_CARD_SPRITES)[number]>
> = {
  fir: "fire",
  wtr: "water",
  thn: "thunder",
  ice: "ice",
  drg: "dragon",
};

/** The game's short column headers, as the monster page shows them. */
const SHORT_COLUMNS: Record<(typeof COLUMNS)[number], string> = {
  cut: "Cut",
  bash: "Bsh",
  shot: "Sht",
  fir: "Fir",
  wtr: "Wtr",
  thn: "Thn",
  ice: "Ice",
  drg: "Drg",
  ko: "KO",
};
const CROWN_NAMES: Record<Crown, string> = { gold: "Gold", silver: "Silver", mini: "Mini" };

/** A hitzone part or break in words: "front-legs" → "Front-Legs", "dorsal fin" → "Dorsal Fin". */
const partLabel = (part: string) =>
  part.replace(/(^|[\s/-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());

/**
 * A break's part, without the condition or detail the data adds after " - "
 * ("chest - requires fire element" → "Chest"), which the card has no room for.
 */
const breakLabel = (name: string) => partLabel(name.split(" - ")[0]);
const breakLabels = (monster: Monster) => [
  ...new Set((monster.breaks ?? []).map((b) => breakLabel(b.name))),
];

const PART_WIDTH = 215;
const COLUMN_WIDTH = 56;
const ROW_HEIGHT = 45;
/** The most hitzone rows the card has room for. */
const MAX_ROWS = 8;
const NAME_TEXT = 40;
const BREAK_TEXT = 20;
const TABLE_TEXT = 24;

function hitzoneTable(monster: Monster, sprites: MonsterCardSprites): CardNode | null {
  const rows = Object.entries(monster.hitzones ?? {});
  if (rows.length === 0) return null;
  // The most effective part per column, as the monster page highlights it.
  const best: Partial<Record<string, number>> = {};
  for (const col of COLUMNS) {
    const values = rows.map(([, v]) => Number(v[col])).filter((n) => n > 0);
    if (values.length > 1) best[col] = Math.max(...values);
  }
  const cell = (child: CardNode) =>
    h(
      "div",
      { style: { display: "flex", width: COLUMN_WIDTH, justifyContent: "flex-end" } },
      child,
    );
  const header = h(
    "div",
    { style: { display: "flex", alignItems: "center", height: ROW_HEIGHT } },
    text({ width: PART_WIDTH, color: COLOR.stat, fontSize: TABLE_TEXT }, "Part"),
    ...COLUMNS.map((col) => {
      const icon = ELEMENT_ICONS[col];
      return cell(
        icon
          ? h("img", { src: sprites[icon], style: { width: SPRITE, height: SPRITE } })
          : text({ color: COLOR.stat, fontSize: 22 }, SHORT_COLUMNS[col]),
      );
    }),
  );
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column" } },
    header,
    ...rows.map(([part, values], i) =>
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            height: ROW_HEIGHT,
            // The site's zebra rows, faintly.
            backgroundColor: i % 2 === 0 ? "rgba(255,255,255,0.06)" : "transparent",
          },
        },
        text({ width: PART_WIDTH, color: COLOR.white, fontSize: TABLE_TEXT }, partLabel(part)),
        ...COLUMNS.map((col) => {
          const raw = values[col];
          const n = Number(raw);
          const color =
            raw === undefined
              ? COLOR.faint
              : n === 0
                ? COLOR.unavailable
                : n === best[col]
                  ? COLOR.positive
                  : COLOR.white;
          return cell(text({ color, fontSize: TABLE_TEXT }, raw ?? "-"));
        }),
      ),
    ),
  );
}

const statLine = (label: string, value: string) =>
  h(
    "div",
    { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 } },
    text({ color: COLOR.stat, fontSize: 22 }, label),
    text({ color: COLOR.white, fontSize: 22 }, value),
  );

/**
 * The card for a monster, as a satori element tree. `frame` is the frame at
 * CARD's size and `portrait` the portrait on its scroll, both as data: URIs.
 */
export function monsterCardTree(
  monster: Monster,
  frame: string,
  portrait: string,
  sprites: MonsterCardSprites,
): CardNode {
  const breaks = breakLabels(monster);
  const { crowns, base_size } = monster;
  // The crown cutoffs, laid out like the monster page's (CrownCutoffs).
  const crownLine = (crown: Crown) =>
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 8 } },
      h(
        "div",
        { style: { display: "flex", justifyContent: "center", width: 22 } },
        h("img", {
          src: sprites[`crown-${crown}`],
          style: crown === "mini" ? { width: 13, height: 13 } : { width: 21, height: 22 },
        }),
      ),
      text({ color: COLOR.stat, fontSize: 22, flexGrow: 1 }, CROWN_NAMES[crown]),
      text(
        { color: COLOR.white, fontSize: 22 },
        String(Math.round(cardSize(crowns![crown], base_size!))),
      ),
    );
  const group = (label: string, ...lines: CardNode[]) =>
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 4 } },
      text({ color: COLOR.stat, fontSize: 22 }, label),
      ...lines,
    );

  const left = h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 14, width: LEFT_WIDTH } },
    h("img", { src: portrait, style: SCROLL }),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 10, padding: "0 8px" } },
      monster.base_hp ? statLine("Base HP", String(monster.base_hp)) : null,
      crowns && base_size
        ? h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 4 } },
            ...CROWN_ORDER.map(crownLine),
          )
        : null,
      breaks.length > 0 &&
        group(
          "Breaks",
          ...breaks.map((b) => text({ color: COLOR.white, fontSize: BREAK_TEXT }, b)),
        ),
    ),
  );

  const right = h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 16, flexGrow: 1 } },
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 4 } },
      text({ color: COLOR.white, fontSize: NAME_TEXT }, monster.name),
      text({ color: COLOR.parchment, fontSize: 22 }, titleCase(monster.type)),
    ),
    hitzoneTable(monster, sprites),
  );

  return cardShell(
    frame,
    h("div", { style: { display: "flex", gap: 36, flexGrow: 1 } }, left, right),
  );
}

/** Column names in full, for the alt text. */
const COLUMN_NAMES: Record<(typeof COLUMNS)[number], string> = {
  cut: "Cut",
  bash: "Impact",
  shot: "Shot",
  fir: "Fire",
  wtr: "Water",
  thn: "Thunder",
  ice: "Ice",
  drg: "Dragon",
  ko: "KO",
};

/** Everything on the card in words, for the image's alt text. */
export function monsterCardAlt(monster: Monster): string {
  const rows = Object.entries(monster.hitzones ?? {});
  const best = COLUMNS.filter((c) => c !== "ko")
    .map((col) => {
      const top = rows.reduce<[string, number] | null>((acc, [part, v]) => {
        const n = Number(v[col] ?? 0);
        return n > (acc?.[1] ?? 0) ? [part, n] : acc;
      }, null);
      return top && `${COLUMN_NAMES[col]} ${partLabel(top[0])} ${top[1]}`;
    })
    .filter(Boolean);
  return [
    `${monster.name}, ${titleCase(monster.type)}.`,
    monster.base_hp ? `Base HP ${monster.base_hp}.` : "",
    best.length ? `Best hitzones: ${best.join(", ")}.` : "",
    monster.breaks?.length ? `Breaks: ${breakLabels(monster).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Width of `chars` characters at `fontSize`: the font's half-em glyphs plus the 0.14em tracking. */
const textWidth = (chars: number, fontSize: number) => chars * fontSize * 0.64;

/**
 * What on a monster's card wouldn't fit its place (an empty list when it all
 * fits), measured with the layout's own sizes: the name across the right
 * column, part names beside the table's first column, the number of rows,
 * and the break names across the left column and down it.
 */
export function monsterCardOverflow(monster: Monster): string[] {
  const { width, height, frameTop, frameSide } = CARD;
  const inner = { width: width - 2 * (frameSide + 20), height: height - 2 * (frameTop + 14) };
  const right = inner.width - LEFT_WIDTH - 36;
  const problems: string[] = [];
  if (textWidth(monster.name.length, NAME_TEXT) > right) problems.push(`name "${monster.name}"`);
  const rows = Object.keys(monster.hitzones ?? {});
  if (rows.length > MAX_ROWS) problems.push(`${rows.length} hitzone rows`);
  for (const part of rows) {
    if (textWidth(partLabel(part).length, TABLE_TEXT) > PART_WIDTH - 8) {
      problems.push(`part "${partLabel(part)}"`);
    }
  }
  const breaks = breakLabels(monster);
  for (const b of breaks) {
    if (textWidth(b.length, BREAK_TEXT) > LEFT_WIDTH - 16) problems.push(`break "${b}"`);
  }
  // The left column's height: the portrait, then lines about 1.2em high
  // with the gaps between them (the layout's gap: 14, 10 and 4).
  const line = (fontSize: number) => Math.ceil(fontSize * 1.2);
  const groups = [
    monster.base_hp ? line(22) : 0,
    monster.crowns && monster.base_size ? 3 * line(22) + 2 * 4 : 0,
    breaks.length ? line(22) + breaks.length * (line(BREAK_TEXT) + 4) : 0,
  ].filter((g) => g > 0);
  const left = SCROLL.height + 14 + groups.reduce((a, b) => a + b, 0) + 10 * (groups.length - 1);
  if (left > inner.height) problems.push(`left column ${left}px of ${inner.height}px`);
  return problems;
}
