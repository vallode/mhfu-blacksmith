/**
 * The image in a monster page's link embed: its portrait on the scroll with
 * its HP, gold and mini crown sizes and breakable parts under it, and beside them its name,
 * its type with the buildup each status first takes (or "Immune"), and its hitzone table,
 * given most of the room, the best part in each column in green as on the page, and under
 * the table the star levels it's hunted at on the Village board and each Guild rank.
 *
 * scripts/generate-embeds.ts draws one per monster at build time (with satori
 * and resvg, like the set card the Worker draws) to monsterCardPath(). It
 * makes the frame, the portrait and the sprites too, since satori can't draw
 * a 9-slice frame or scale pixel art without smoothing. Pure: no fs, no
 * process.env, and English only, like the rest of the embeds (the names
 * spelled as the monster page's English shows them).
 */
import { CARD, cardShell, COLOR, h, text, type CardNode } from "./card-tree";
import { crownCutoff, type Crown } from "./crowns";
import { titleCase } from "./embed-format";
import { STATUS_ORDER, type MonsterStatus } from "./monster-status";
import { questStarLevel, type HuntStars } from "./quests";
import type { Monster } from "./types";

/** Bump when the card's look changes, so link previews pick up the new image. */
export const MONSTER_CARD_VERSION = 4;

/** Where the build writes a monster's card, under public/. */
export const monsterCardPath = (slug: string) => `/embed/cards/monsters/${slug}.png`;

/**
 * The card's URL for the page's meta tags. Its `v` is the card version and a
 * hash of what the card shows, so a data change gets a new URL, which link
 * previews fetch again rather than keep the old image.
 */
export function monsterCardUrl(monster: Monster, hunts: HuntStars): string {
  const { name, type, hitzones, base_hp, base_size, crowns, breaks } = monster;
  const status = statusThresholds(monster);
  const shown = JSON.stringify({
    name,
    type,
    hitzones,
    base_hp,
    base_size,
    crowns,
    breaks,
    hunts,
    status,
  });
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
/** How far the stats under the scroll sit in from its left and right edges. */
const STATS_INSET = 8;

const COLUMNS = ["cut", "bash", "shot", "fir", "wtr", "thn", "ice", "drg", "ko"] as const;
/** The sprites the card uses (public/images/<name>.png), as data: URIs by name. */
export const MONSTER_CARD_SPRITES = [
  "fire",
  "water",
  "thunder",
  "ice",
  "dragon",
  "crown-gold",
  "crown-mini",
  "star",
  ...STATUS_ORDER,
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
/** The crowns the card lists: the record sizes, largest and smallest, not silver. */
const CARD_CROWNS = ["gold", "mini"] as const satisfies readonly Crown[];
type CardCrown = (typeof CARD_CROWNS)[number];
const CROWN_NAMES: Record<CardCrown, string> = { gold: "Gold", mini: "Mini" };

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

/** Each status's first threshold, null where the monster is immune; absent without tolerances. */
function statusThresholds(monster: Monster): [MonsterStatus, number | null][] | undefined {
  const t = monster.tolerances;
  return t && STATUS_ORDER.map((s) => [s, t[s]?.initial ?? null]);
}

const STATUS_NAMES: Record<MonsterStatus, string> = {
  poison: "Poison",
  paralysis: "Paralysis",
  sleep: "Sleep",
  ko: "KO",
};
/** The status row's figures, its icons, and the gaps beside each icon and between statuses. */
const STATUS_TEXT = 22;
const STATUS_GAP = 6;
const STATUS_SPACING = 18;

/** An immune status's icon, faded. */
const IMMUNE_ICON_OPACITY = 0.4;
const IMMUNE = "Immune";

/**
 * The status row as groups of icons and their figure: each status with its
 * first threshold, or "Immune" (its icon faded); a monster immune to all four
 * gets their four faded icons and one "Immune", which fits where four
 * wouldn't.
 */
function statusGroups(
  status: [MonsterStatus, number | null][],
): { icons: MonsterStatus[]; label: string; immune: boolean }[] {
  if (status.every(([, n]) => n === null)) {
    return [{ icons: status.map(([s]) => s), label: IMMUNE, immune: true }];
  }
  return status.map(([s, n]) => ({
    icons: [s],
    label: n === null ? IMMUNE : String(n),
    immune: n === null,
  }));
}

/** The status row's width, as the layout draws it. */
function statusRowWidth(status: [MonsterStatus, number | null][]): number {
  const groups = statusGroups(status);
  return (
    groups.reduce(
      (w, g) => w + g.icons.length * (SPRITE + STATUS_GAP) + textWidth(g.label.length, STATUS_TEXT),
      0,
    ) +
    STATUS_SPACING * (groups.length - 1)
  );
}

/** The type's line: the type left, each status's icon and first threshold right. */
function typeLine(monster: Monster, sprites: MonsterCardSprites): CardNode {
  const status = statusThresholds(monster);
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: typeLineHeight(monster),
      },
    },
    text({ color: COLOR.parchment, fontSize: 22 }, titleCase(monster.type)),
    status
      ? h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: STATUS_SPACING } },
          ...statusGroups(status).map(({ icons, label, immune }) =>
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: STATUS_GAP } },
              ...icons.map((s) =>
                h("img", {
                  src: sprites[s],
                  style: {
                    width: SPRITE,
                    height: SPRITE,
                    ...(immune && { opacity: IMMUNE_ICON_OPACITY }),
                  },
                }),
              ),
              text(
                { color: immune ? COLOR.unavailable : COLOR.white, fontSize: STATUS_TEXT },
                label,
              ),
            ),
          ),
        )
      : null,
  );
}

const PART_WIDTH = 215;
const COLUMN_WIDTH = 56;
/** The table's row height, unless its rows need less to fit; never below the least. */
const ROW_HEIGHT = 45;
const MIN_ROW_HEIGHT = 36;
const NAME_TEXT = 40;
const BREAK_TEXT = 20;
const TABLE_TEXT = 24;
/** The right column's gap, between the name, the table and the quest rows. */
const RIGHT_GAP = 16;

/** The inside of the frame, where the card lays out. */
const INNER = {
  width: CARD.width - 2 * (CARD.frameSide + 20),
  height: CARD.height - 2 * (CARD.frameTop + 14),
};

/** A line of text at `fontSize`, about 1.2em high. */
const lineHeight = (fontSize: number) => Math.ceil(fontSize * 1.2);
/** The type's line: as tall as the status icons beside it, where it has them. */
const typeLineHeight = (monster: Monster) =>
  monster.tolerances ? Math.max(lineHeight(22), SPRITE) : lineHeight(22);

/**
 * The hitzone table's row height: ROW_HEIGHT, or less where the header and
 * rows would otherwise push the quest rows off the card (the 8-row
 * monsters with two quest rows: Gravios, Diablos and their variants).
 */
function rowHeight(monster: Monster, hunts: HuntStars): number {
  const rows = Object.keys(monster.hitzones ?? {}).length;
  const name = lineHeight(NAME_TEXT) + 4 + typeLineHeight(monster);
  const lines = boardRows(hunts).length;
  const foot = lines ? RIGHT_GAP + lines * HUNT_ROW : 0;
  const room = INNER.height - name - RIGHT_GAP - foot;
  return Math.min(ROW_HEIGHT, Math.floor(room / (rows + 1)));
}

function hitzoneTable(
  monster: Monster,
  rowHeight: number,
  sprites: MonsterCardSprites,
): CardNode | null {
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
    { style: { display: "flex", alignItems: "center", height: rowHeight } },
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
            height: rowHeight,
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

/** A board or rank the monster is hunted on, and the star levels of its quests there. */
interface HuntBoard {
  /** The card's short name: "Village", "LR", "HR", "G". */
  short: string;
  /** In full, for the alt text: "Village", "Low Rank". */
  name: string;
  /** As the board shows them: G Rank's ★9-★11 are 1-3, its name saying G. */
  stars: number[];
}

const BOARDS = [
  { key: "village", short: "Village", name: "Village" },
  { key: "low-rank", short: "LR", name: "Low Rank" },
  { key: "high-rank", short: "HR", name: "High Rank" },
  { key: "g-rank", short: "G", name: "G Rank" },
] as const;

function huntBoards(hunts: HuntStars): HuntBoard[] {
  return BOARDS.flatMap(({ key, short, name }) => {
    const stars = hunts[key];
    return stars?.length
      ? [{ short, name, stars: stars.map((s) => questStarLevel(key, s).stars) }]
      : [];
  });
}

/** The star sprite (13×14) at the sprite scale. */
const STAR = { width: 13 * MONSTER_CARD_SPRITE_SCALE, height: 14 * MONSTER_CARD_SPRITE_SCALE };
/** Space after a board's name, between its stars and star sprite, and between boards. */
const BOARD_NAME_GAP = 12;
const BOARD_INNER_GAP = 6;
const BOARD_GAP = 28;
/** A star-level row's height. */
const HUNT_ROW = 34;
/** The "Quests" label's column: the word, then a gap before the boards. */
const QUESTS_LABEL = "Quests";
const QUESTS_LABEL_WIDTH = Math.ceil(QUESTS_LABEL.length * TABLE_TEXT * 0.64) + 20;

/** The comma between star levels: a narrow box, so the monospace font's wide cell doesn't space them out. */
const COMMA_WIDTH = Math.round(TABLE_TEXT * 0.34);
const COMMA_GAP = 3;
const starDigits = (b: HuntBoard) => b.stars.reduce((n, s) => n + String(s).length, 0);
const boardWidth = (b: HuntBoard) =>
  textWidth(b.short.length + starDigits(b), TABLE_TEXT) +
  (b.stars.length - 1) * (COMMA_WIDTH + 2 * COMMA_GAP) +
  BOARD_NAME_GAP +
  BOARD_INNER_GAP +
  STAR.width;

/** The boards in rows that fit beside the label, in order. */
function boardRows(hunts: HuntStars): HuntBoard[][] {
  const room = INNER.width - LEFT_WIDTH - 36 - QUESTS_LABEL_WIDTH;
  const rows: HuntBoard[][] = [];
  let width = Infinity;
  for (const b of huntBoards(hunts)) {
    const w = boardWidth(b);
    if (width + BOARD_GAP + w > room) {
      rows.push([b]);
      width = w;
    } else {
      rows[rows.length - 1].push(b);
      width += BOARD_GAP + w;
    }
  }
  return rows;
}

/**
 * "Quests  Village 2, 3, 4, 7, 9★  LR 2, 3, 4★ / HR 6, 8★  G 1, 2★" at the foot of
 * the table's column, laid out like table rows: the star levels of the
 * quests the monster is hunted in on each board and rank, wrapping onto a
 * second row when they don't fit one, or null when it never is.
 */
function huntStarsRows(hunts: HuntStars, sprites: MonsterCardSprites): CardNode | null {
  const rows = boardRows(hunts);
  if (rows.length === 0) return null;
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", marginTop: "auto", flexShrink: 0 } },
    ...rows.map((boards, i) =>
      h(
        "div",
        { style: { display: "flex", alignItems: "center", height: HUNT_ROW } },
        text(
          { width: QUESTS_LABEL_WIDTH, color: COLOR.stat, fontSize: TABLE_TEXT },
          i === 0 ? QUESTS_LABEL : "",
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: BOARD_GAP } },
          ...boards.map((b) =>
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: BOARD_INNER_GAP } },
              text(
                {
                  color: COLOR.parchment,
                  fontSize: TABLE_TEXT,
                  marginRight: BOARD_NAME_GAP - BOARD_INNER_GAP,
                },
                b.short,
              ),
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: COMMA_GAP } },
                ...b.stars.flatMap((star, k) => [
                  ...(k > 0
                    ? [
                        text(
                          {
                            color: COLOR.white,
                            fontSize: TABLE_TEXT,
                            width: COMMA_WIDTH,
                            justifyContent: "center",
                          },
                          ",",
                        ),
                      ]
                    : []),
                  text({ color: COLOR.white, fontSize: TABLE_TEXT }, star),
                ]),
              ),
              h("img", { src: sprites.star, style: STAR }),
            ),
          ),
        ),
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
 * The card for a monster, as a satori element tree. `hunts` is the star
 * levels it's hunted at (getHuntStars), `frame` the frame at CARD's size and
 * `portrait` the portrait on its scroll, both as data: URIs.
 */
export function monsterCardTree(
  monster: Monster,
  hunts: HuntStars,
  frame: string,
  portrait: string,
  sprites: MonsterCardSprites,
): CardNode {
  const breaks = breakLabels(monster);
  const { crowns, base_size } = monster;
  // The crown cutoffs, laid out like the monster page's (CrownCutoffs).
  const crownLine = (crown: CardCrown) =>
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
        crownCutoff(crown, crowns!, base_size!).toFixed(1),
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
      // The stats sit under the scroll, inset from its edges.
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 10,
          width: SCROLL.width,
          padding: `0 ${STATS_INSET}px`,
        },
      },
      monster.base_hp ? statLine("Base HP", String(monster.base_hp)) : null,
      crowns && base_size
        ? h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 4 } },
            ...CARD_CROWNS.map(crownLine),
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
    { style: { display: "flex", flexDirection: "column", gap: RIGHT_GAP, flexGrow: 1 } },
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 4 } },
      text({ color: COLOR.white, fontSize: NAME_TEXT }, monster.name),
      typeLine(monster, sprites),
    ),
    hitzoneTable(monster, rowHeight(monster, hunts), sprites),
    huntStarsRows(hunts, sprites),
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
export function monsterCardAlt(monster: Monster, hunts: HuntStars): string {
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
  const boards = huntBoards(hunts);
  const status = statusThresholds(monster);
  return [
    `${monster.name}, ${titleCase(monster.type)}.`,
    boards.length
      ? `Hunted in ${boards.map((b) => `${b.name} ${b.stars.join(", ")}★`).join("; ")}.`
      : "",
    monster.base_hp ? `Base HP ${monster.base_hp}.` : "",
    status
      ? `Status buildup: ${status
          .map(([s, n]) => `${STATUS_NAMES[s]} ${n === null ? "immune" : n}`)
          .join(", ")}.`
      : "",
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
 * column, part names beside the table's first column, the rows down it,
 * the quest rows across it,
 * and the break names across the left column and down it.
 */
export function monsterCardOverflow(monster: Monster, hunts: HuntStars): string[] {
  const inner = INNER;
  const right = inner.width - LEFT_WIDTH - 36;
  const problems: string[] = [];
  if (textWidth(monster.name.length, NAME_TEXT) > right) problems.push(`name "${monster.name}"`);
  // The type and, right of it, the status row.
  const status = statusThresholds(monster);
  if (status) {
    const row = statusRowWidth(status);
    const type = textWidth(titleCase(monster.type).length, 22);
    if (type + 24 + row > right) problems.push(`status row beside "${titleCase(monster.type)}"`);
  }
  const rows = Object.keys(monster.hitzones ?? {});
  if (rowHeight(monster, hunts) < MIN_ROW_HEIGHT) problems.push(`${rows.length} hitzone rows`);
  for (const part of rows) {
    if (textWidth(partLabel(part).length, TABLE_TEXT) > PART_WIDTH - 8) {
      problems.push(`part "${partLabel(part)}"`);
    }
  }
  const breaks = breakLabels(monster);
  for (const b of breaks) {
    if (textWidth(b.length, BREAK_TEXT) > SCROLL.width - 2 * STATS_INSET) {
      problems.push(`break "${b}"`);
    }
  }
  // The left column's height: the portrait, then lines about 1.2em high
  // with the gaps between them (the layout's gap: 14, 10 and 4).
  const line = lineHeight;
  const groups = [
    monster.base_hp ? line(22) : 0,
    monster.crowns && monster.base_size
      ? CARD_CROWNS.length * line(22) + (CARD_CROWNS.length - 1) * 4
      : 0,
    breaks.length ? line(22) + breaks.length * (line(BREAK_TEXT) + 4) : 0,
  ].filter((g) => g > 0);
  const left = SCROLL.height + 14 + groups.reduce((a, b) => a + b, 0) + 10 * (groups.length - 1);
  if (left > inner.height) problems.push(`left column ${left}px of ${inner.height}px`);
  return problems;
}
