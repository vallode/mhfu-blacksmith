/**
 * Large link-preview cards for weapons, items and a monster's drops at one
 * rank, in the monster card's frame and type. There are too many weapons
 * and items to draw them all at build time (monster cards are), so the
 * Cloudflare Worker (src/cloudflare/worker.ts) draws each on request, as it
 * draws set cards, and Cloudflare's cache keeps it:
 *
 * - `/embed/cards/weapons/<type>/<slug>.png`
 * - `/embed/cards/items/<slug>.png`
 * - `/embed/cards/drops/<monster>/<rank>.png`
 *
 * What each card shows is worked out at build time (detail-card-data.ts)
 * and written to `/embed/card-data/<kind>.json`, keyed as the paths are; the
 * frame and sprites go in DETAIL_CARD_ASSETS_PATH. The Discord bot puts
 * these cards in its replies, at the URLs `detailCardUrl` gives.
 *
 * This module builds the satori element trees. Pure: no fs, no process.env,
 * English only, like the other cards.
 */
import { CARD, cardShell, COLOR, h, text, type CardNode } from "./card-tree";
import { RARITY_COLORS } from "./embed-format";

export { CARD };

/** Bump when a card's look changes, so caches and link previews pick it up. */
export const DETAIL_CARD_VERSION = 1;

export type DetailCardKind = "weapons" | "items" | "drops";
export const DETAIL_CARD_KINDS: readonly DetailCardKind[] = ["weapons", "items", "drops"];

/** Where the build writes each kind's cards' contents, under public/. */
export const detailCardDataPath = (kind: DetailCardKind) => `/embed/card-data/${kind}.json`;
/** Where the build writes the cards' frame and sprites, under public/. */
export const DETAIL_CARD_ASSETS_PATH = "/embed/detail-card-assets.json";

/** A card's path: its kind, then its key in that kind's data ("long-sword/bone-g"). */
export const detailCardPath = (kind: DetailCardKind, key: string) =>
  `/embed/cards/${kind}/${key}.png`;

/** The kind and key a card's path names, or null for any other path. */
export function parseDetailCardPath(
  pathname: string,
): { kind: DetailCardKind; key: string } | null {
  const m = pathname.match(
    /^\/embed\/cards\/(weapons|items|drops)\/([a-z0-9-]+(?:\/[a-z0-9-]+)?)\.png$/,
  );
  if (!m) return null;
  const kind = m[1] as DetailCardKind;
  // Weapons and drops are two segments deep, items one.
  const depth = m[2]!.split("/").length;
  if ((kind === "items") !== (depth === 1)) return null;
  return { kind, key: m[2]! };
}

/** FNV-1a, 32-bit, of what a card shows: part of its URL, so a data change gets a new one. */
function hash(s: string): string {
  let h32 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h32 = Math.imul(h32 ^ s.charCodeAt(i), 0x01000193);
  return (h32 >>> 0).toString(36);
}

/** A card's version: the card version and a hash of what it shows. */
export const detailCardVersion = (card: unknown) =>
  `${DETAIL_CARD_VERSION}.${hash(JSON.stringify(card))}`;

/** A card's URL path with its version, for link previews and the bot's embeds. */
export const detailCardUrl = (kind: DetailCardKind, key: string, card: unknown) =>
  `${detailCardPath(kind, key)}?v=${detailCardVersion(card)}`;

/** The frame at CARD's size and the sprites by name, as data: URIs. */
export interface DetailCardAssets {
  frame: string;
  sprites: Record<string, string>;
}

/** Sprites (16px) are drawn at this many times their size. */
export const DETAIL_SPRITE_SCALE = 2;
const SPRITE = 16 * DETAIL_SPRITE_SCALE;

/** A material sprite's name: its icon and gem colour ("claw-yellow"). */
export const materialSprite = (type: string, color?: string | null) =>
  `${type}-${color ?? "plain"}`;

export interface CardMaterial {
  name: string;
  amount: number;
  /** Its sprite (materialSprite), when the build had one. */
  sprite?: string;
}

export interface CardRecipe {
  cost?: number;
  mats: CardMaterial[];
}

export interface CardStat {
  label: string;
  value: string;
  /** A sprite before the value (an element's icon). */
  sprite?: string;
  /** The whole row, for values too long for half of it. */
  wide?: boolean;
}

export interface WeaponCard {
  name: string;
  /** "Long Sword" */
  type: string;
  rarity?: number;
  /** The 180px framed icon, a path on the site (embedIcon). */
  icon: string;
  stats: CardStat[];
  slots: number;
  /** Hits of each sharpness colour, red first. */
  sharpness?: number[];
  sharpnessPlus?: number[];
  create?: CardRecipe;
  upgrade?: CardRecipe & { from: string[] };
  upgradesTo: string[];
}

export interface CardDropWay {
  how: string;
  chance: number;
  quantity?: number;
}

export interface CardItemDrop {
  monster: string;
  /** "LR, HR" */
  ranks: string;
  ways: CardDropWay[];
}

export interface CardItemReward {
  quest: string;
  /** "Guild HR ★8" */
  where: string;
  chance: number;
  amount?: number;
}

export interface ItemCard {
  name: string;
  rarity?: number;
  price?: number;
  carry?: number;
  /** The 180px framed icon, a path on the site (itemEmbedIcon). */
  icon?: string;
  drops: CardItemDrop[];
  dropCount: number;
  rewards: CardItemReward[];
  rewardCount: number;
}

export interface CardDropGroup {
  /** "Body carves ×3", "Break head" */
  title: string;
  rows: { name: string; chance: number; quantity?: number }[];
}

export interface DropsCard {
  monster: string;
  /** "High Rank" */
  rank: string;
  /** The monster's 196×128 portrait on the scroll, a path on the site. */
  portrait?: string;
  groups: CardDropGroup[];
}

/** Images the trees take from the site's files, as data: URIs by path. */
export type CardImages = Record<string, string | undefined>;

// Layout. The content box is CARD less the frame and its padding (cardShell).
const CONTENT = {
  width: CARD.width - 2 * (CARD.frameSide + 20),
  height: CARD.height - 2 * (CARD.frameTop + 14),
};
const LEFT_WIDTH = 265;
const COLUMN_GAP = 30;
const RIGHT_WIDTH = CONTENT.width - LEFT_WIDTH - COLUMN_GAP;
const NAME_TEXT = 40;
const BODY_TEXT = 22;
const SMALL_TEXT = 18;

/** A rare drop's colour: chances at or under RARE_CHANCE stand out. */
const RARE = RARITY_COLORS[5]!;
const RARE_CHANCE = 5;

/** The sharpness colours, red to purple: the --color-sharpness-* tokens. */
const SHARPNESS_COLORS = [
  "#c3333c",
  "#ef5a26",
  "#ffc03c",
  "#84c11c",
  "#5a8aed",
  "#f7f7f7",
  "#df78f6",
];

const rarityColor = (rarity?: number) => (rarity && RARITY_COLORS[rarity]) || COLOR.white;
const zenny = (n: number) => `${n.toLocaleString("en-US")}z`;
const lineHeight = (fontSize: number) => Math.ceil(fontSize * 1.2);

const row = (style: Record<string, unknown>, ...children: (CardNode | null | false)[]) =>
  h("div", { style: { display: "flex", ...style } }, ...children);
const col = (style: Record<string, unknown>, ...children: (CardNode | null | false)[]) =>
  row({ flexDirection: "column", ...style }, ...children);
const img = (src: string | undefined, width: number, height: number) =>
  src ? h("img", { src, style: { width, height } }) : null;

/** The two columns every card has: an icon and its facts on the left, the rest beside it. */
function twoColumns(left: CardNode, right: CardNode): CardNode {
  return row(
    { width: CONTENT.width, height: CONTENT.height, gap: COLUMN_GAP },
    col({ width: LEFT_WIDTH, alignItems: "center", gap: 14, paddingTop: 6 }, left),
    col({ width: RIGHT_WIDTH, gap: 16 }, right),
  );
}

/** A name line and the line under it. */
function heading(name: string, sub: string, subColor: string = COLOR.parchment): CardNode {
  return col(
    { gap: 4 },
    text({ fontSize: NAME_TEXT, lineHeight: 1.1 }, name),
    text({ fontSize: BODY_TEXT, color: subColor }, sub),
  );
}

/** "Label   value" across a column, the label in the stat colour. */
function labelled(label: string, value: string, width: number, valueColor: string = COLOR.white) {
  return row(
    { width, justifyContent: "space-between", fontSize: BODY_TEXT },
    text({ color: COLOR.stat }, label),
    text({ color: valueColor }, value),
  );
}

// ——— Weapons ———

function sharpnessBar(hits: number[], width: number, height: number): CardNode {
  return row(
    { width, height, border: "3px solid #000", boxShadow: "3px 3px 0 #000" },
    ...hits.map((n, i) =>
      n > 0 ? row({ flexGrow: n, flexBasis: 0, backgroundColor: SHARPNESS_COLORS[i] }) : null,
    ),
  );
}

/** Both bars to one scale: the longer is the full width. */
function sharpness(card: WeaponCard): CardNode | null {
  if (!card.sharpness?.length) return null;
  const total = (s?: number[]) => (s ?? []).reduce((a, b) => a + b, 0);
  const full = Math.max(total(card.sharpness), total(card.sharpnessPlus)) || 1;
  const bar = (s: number[], height: number) =>
    sharpnessBar(s, Math.round((RIGHT_WIDTH * total(s)) / full), height);
  return col(
    { gap: 8 },
    row(
      { justifyContent: "space-between", fontSize: SMALL_TEXT },
      text({ color: COLOR.stat, fontSize: BODY_TEXT }, "Sharpness"),
      card.sharpnessPlus?.length ? text({ color: COLOR.faint }, "+1 below") : null,
    ),
    bar(card.sharpness, 22),
    card.sharpnessPlus?.length ? bar(card.sharpnessPlus, 12) : null,
  );
}

const STAT_WIDTH = (RIGHT_WIDTH - 40) / 2;

function stats(card: WeaponCard, sprites: Record<string, string>): CardNode {
  const slots = row(
    {
      width: STAT_WIDTH,
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: BODY_TEXT,
    },
    text({ color: COLOR.stat }, "Slots"),
    card.slots
      ? row(
          { gap: 6 },
          ...Array.from({ length: card.slots }, () => img(sprites["slot-empty"], SPRITE, SPRITE)),
        )
      : text({ color: COLOR.unavailable }, "None"),
  );
  return row(
    { flexWrap: "wrap", columnGap: 40, rowGap: 10 },
    ...card.stats.map((s) =>
      row(
        {
          width: s.wide ? RIGHT_WIDTH : STAT_WIDTH,
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: BODY_TEXT,
        },
        text({ color: COLOR.stat, flexShrink: 0, marginRight: 16 }, s.label),
        row(
          { alignItems: "center", gap: 8 },
          s.sprite ? img(sprites[s.sprite], SPRITE, SPRITE) : null,
          text({}, s.value),
        ),
      ),
    ),
    slots,
  );
}

const MAX_MATS = 5;
const MAT_ROW = 36;

function recipe(label: string, r: CardRecipe, width: number, sprites: Record<string, string>) {
  const shown = r.mats.slice(0, MAX_MATS);
  return col(
    { width, gap: 6 },
    labelled(label, r.cost ? zenny(r.cost) : "", width),
    ...shown.map((m) =>
      row(
        { height: MAT_ROW, alignItems: "center", gap: 10, fontSize: SMALL_TEXT + 2 },
        m.sprite && sprites[m.sprite]
          ? img(sprites[m.sprite], SPRITE, SPRITE)
          : row({ width: SPRITE }),
        text({ flexGrow: 1 }, m.name),
        text({}, `×${m.amount}`),
      ),
    ),
    r.mats.length > shown.length
      ? text(
          { fontSize: SMALL_TEXT, color: COLOR.faint },
          `…and ${r.mats.length - shown.length} more`,
        )
      : null,
  );
}

function recipes(card: WeaponCard, sprites: Record<string, string>): CardNode | null {
  const both = [
    card.upgrade && (["Upgrade", card.upgrade] as const),
    card.create && (["Create", card.create] as const),
  ].filter((r): r is NonNullable<typeof r> => !!r);
  if (!both.length) return null;
  const width = both.length === 2 ? (RIGHT_WIDTH - 40) / 2 : STAT_WIDTH;
  return row({ gap: 40 }, ...both.map(([label, r]) => recipe(label, r, width, sprites)));
}

/** A labelled list of weapon names under the icon. */
function nameList(label: string, names: string[]): CardNode | null {
  if (!names.length) return null;
  const shown = names.slice(0, 3);
  return col(
    { width: LEFT_WIDTH, gap: 2, fontSize: SMALL_TEXT },
    text({ color: COLOR.stat }, label),
    ...shown.map((n) => text({}, n)),
    names.length > shown.length
      ? text({ color: COLOR.faint }, `…and ${names.length - shown.length} more`)
      : null,
  );
}

export function weaponCardTree(
  card: WeaponCard,
  assets: DetailCardAssets,
  images: CardImages,
): CardNode {
  const left = col(
    { alignItems: "center", gap: 14 },
    img(images[card.icon], 180, 180),
    labelled("Rarity", String(card.rarity ?? "-"), LEFT_WIDTH, rarityColor(card.rarity)),
    nameList("Upgrades from", card.upgrade?.from ?? []),
    nameList("Upgrades to", card.upgradesTo),
  );
  const right = col(
    { gap: 18 },
    heading(card.name, card.type),
    stats(card, assets.sprites),
    sharpness(card),
    recipes(card, assets.sprites),
  );
  return cardShell(assets.frame, twoColumns(left, right));
}

// ——— Items ———

const way = (w: CardDropWay) => `${w.how} ${w.chance}%${w.quantity ? ` ×${w.quantity}` : ""}`;

/** A chance as a bar, the best on the card at full width. */
function chanceBar(chance: number, best: number, width: number): CardNode {
  return row(
    { width, height: 16, alignItems: "center" },
    row({
      width: Math.max(6, Math.round((width * chance) / (best || 1))),
      height: 16,
      backgroundColor: chance <= RARE_CHANCE ? RARE : COLOR.stat,
      border: "3px solid #000",
      boxShadow: "3px 3px 0 #000",
    }),
  );
}

const BAR_WIDTH = 140;
const PCT_WIDTH = 70;

function dropRow(d: CardItemDrop, best: number): CardNode {
  const top = Math.max(...d.ways.map((w) => w.chance));
  return row(
    { alignItems: "center", gap: 16 },
    col(
      { flexGrow: 1, flexBasis: 0, gap: 2 },
      row(
        { gap: 14, fontSize: BODY_TEXT },
        text({}, d.monster),
        text({ color: COLOR.parchment }, d.ranks),
      ),
      // One line, cut with an ellipsis if the ways run long.
      h(
        "div",
        {
          style: {
            display: "block",
            fontSize: SMALL_TEXT - 2,
            color: COLOR.faint,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          },
        },
        d.ways.map(way).join(" · "),
      ),
    ),
    chanceBar(top, best, BAR_WIDTH),
    text({ width: PCT_WIDTH, justifyContent: "flex-end", fontSize: BODY_TEXT }, `${top}%`),
  );
}

/**
 * "Guild HR ★8" with the star as the card's star sprite: the card font has
 * no ★.
 */
function starred(s: string, style: Record<string, unknown>, sprites: Record<string, string>) {
  const [before, after] = s.split("★");
  if (after === undefined) return text(style, s);
  return row(
    { alignItems: "center", ...style },
    text({}, before!.trimEnd()),
    row({ width: before!.endsWith(" ") ? 10 : 2 }),
    img(sprites.star, 13 * DETAIL_SPRITE_SCALE, 14 * DETAIL_SPRITE_SCALE),
    text({ marginLeft: 2 }, after),
  );
}

function rewardRow(r: CardItemReward, sprites: Record<string, string>): CardNode {
  return row(
    { alignItems: "center", gap: 16, fontSize: SMALL_TEXT + 2 },
    text({ flexGrow: 1, flexBasis: 0 }, r.quest),
    starred(r.where, { color: COLOR.parchment }, sprites),
    text(
      { width: PCT_WIDTH, justifyContent: "flex-end" },
      `${r.chance}%${r.amount ? ` ×${r.amount}` : ""}`,
    ),
  );
}

const more = (shown: number, all: number, what: string) =>
  all > shown
    ? text({ fontSize: SMALL_TEXT, color: COLOR.faint }, `…and ${all - shown} more ${what}`)
    : null;

export function itemCardTree(
  card: ItemCard,
  assets: DetailCardAssets,
  images: CardImages,
): CardNode {
  // Without rewards the drops take their room, and the other way round.
  const drops = card.drops.slice(0, card.rewards.length ? 4 : 7);
  const rewards = card.rewards.slice(0, card.drops.length ? 3 : 9);
  const best = Math.max(0, ...drops.flatMap((d) => d.ways.map((w) => w.chance)));
  const left = col(
    { alignItems: "center", gap: 10 },
    img(card.icon && images[card.icon], 180, 180),
    labelled("Rarity", String(card.rarity ?? "-"), LEFT_WIDTH, rarityColor(card.rarity)),
    card.price !== undefined ? labelled("Sells for", zenny(card.price), LEFT_WIDTH) : null,
    card.carry !== undefined ? labelled("Carry", String(card.carry), LEFT_WIDTH) : null,
  );
  const right = col(
    { gap: 14 },
    text({ fontSize: NAME_TEXT, lineHeight: 1.1 }, card.name),
    drops.length
      ? col(
          { gap: 10 },
          text({ color: COLOR.stat, fontSize: BODY_TEXT }, "Monster drops"),
          ...drops.map((d) => dropRow(d, best)),
          more(drops.length, card.dropCount, "monsters"),
        )
      : null,
    rewards.length
      ? col(
          { gap: 8 },
          text({ color: COLOR.stat, fontSize: BODY_TEXT }, "Quest rewards"),
          ...rewards.map((r) => rewardRow(r, assets.sprites)),
          more(rewards.length, card.rewardCount, "quests"),
        )
      : null,
    !drops.length && !rewards.length
      ? text(
          { fontSize: BODY_TEXT, color: COLOR.parchment },
          "No monster drops it and no quest rewards it: it's gathered, bought or combined.",
        )
      : null,
  );
  return cardShell(assets.frame, twoColumns(left, right));
}

// ——— A monster's drops at one rank ———

const DROP_COLUMN_GAP = 24;
const GROUP_GAP = 14;
const MAX_DROP_TEXT = 22;
const MIN_DROP_TEXT = 13;
/** A character's cell in drop rows: the glyph (0.5em) and their 0.08em spacing. */
const DROP_CELL = 0.58;
const columnWidth = (columns: number) =>
  (CONTENT.width - DROP_COLUMN_GAP * (columns - 1)) / columns;
/** The portrait on the scroll, beside the name: the build's 196×128 thumbnail. */
const PORTRAIT = { width: 196, height: 128 };

/** Groups into columns, each into the shortest so far, so the columns end about level. */
function packColumns(heights: number[], columns: number): number[][] {
  const cols = Array.from({ length: columns }, () => ({ height: 0, items: [] as number[] }));
  heights.forEach((h32, i) => {
    const c = cols.reduce((a, b) => (b.height < a.height ? b : a));
    c.items.push(i);
    c.height += h32 + GROUP_GAP;
  });
  return cols.map((c) => c.items);
}

const groupHeight = (g: CardDropGroup, fs: number) =>
  lineHeight(fs + 2) + 4 + g.rows.length * (lineHeight(fs) + 2);

/**
 * The groups' layout: two or three columns, whichever fits the larger text
 * (tall and wide). At the smallest text, rows past the room are cut.
 */
function dropLayout(groups: CardDropGroup[], room: number) {
  // The widest row, in characters: the name, a gap, then "×2 20%".
  const widest = Math.max(
    0,
    ...groups.flatMap((g) =>
      g.rows.map(
        (r) => r.name.length + 1 + `${r.quantity ? `×${r.quantity} ` : ""}${r.chance}%`.length,
      ),
    ),
  );
  let best = { fontSize: MIN_DROP_TEXT, columns: 4, packed: [] as number[][] };
  for (const columns of [4, 3]) {
    for (let fontSize = MAX_DROP_TEXT; fontSize > best.fontSize; fontSize--) {
      const heights = groups.map((g) => groupHeight(g, fontSize));
      const packed = packColumns(heights, columns);
      const tallest = Math.max(
        ...packed.map((c) => c.reduce((s, i) => s + heights[i]! + GROUP_GAP, -GROUP_GAP)),
      );
      if (tallest <= room && widest * fontSize * DROP_CELL <= columnWidth(columns)) {
        best = { fontSize, columns, packed };
        break;
      }
    }
  }
  if (!best.packed.length) {
    best.packed = packColumns(
      groups.map((g) => groupHeight(g, MIN_DROP_TEXT)),
      best.columns,
    );
  }
  return best;
}

export function dropsCardTree(
  card: DropsCard,
  assets: DetailCardAssets,
  images: CardImages,
): CardNode {
  const room = CONTENT.height - PORTRAIT.height - 12;
  const { fontSize, columns, packed } = dropLayout(card.groups, room);
  const width = columnWidth(columns);

  const group = (g: CardDropGroup) =>
    col(
      { width, gap: 2 },
      text({ color: COLOR.stat, fontSize: fontSize + 2, marginBottom: 4 }, g.title),
      ...g.rows.map((r) =>
        row(
          {
            justifyContent: "space-between",
            fontSize,
            letterSpacing: "0.08em",
            color: r.chance <= RARE_CHANCE ? RARE : COLOR.white,
          },
          text({}, r.name),
          text(
            { flexShrink: 0, marginLeft: 8 },
            r.quantity ? `×${r.quantity} ${r.chance}%` : `${r.chance}%`,
          ),
        ),
      ),
    );

  const header = row(
    { height: PORTRAIT.height, alignItems: "center", gap: COLUMN_GAP },
    img(card.portrait && images[card.portrait], PORTRAIT.width, PORTRAIT.height),
    col(
      { gap: 6, flexGrow: 1 },
      heading(card.monster, `${card.rank} drops`),
      text({ fontSize: SMALL_TEXT, color: RARE }, `Pink: ${RARE_CHANCE}% or less`),
    ),
  );
  return cardShell(
    assets.frame,
    col(
      { width: CONTENT.width, height: CONTENT.height, gap: 12 },
      header,
      row(
        { gap: DROP_COLUMN_GAP, height: room, overflow: "hidden" },
        ...packed.map((c) => col({ gap: GROUP_GAP }, ...c.map((i) => group(card.groups[i]!)))),
      ),
    ),
  );
}

/** The images a card takes from the site's files. */
export function cardImagePaths(
  kind: DetailCardKind,
  card: WeaponCard | ItemCard | DropsCard,
): string[] {
  const path =
    kind === "weapons"
      ? (card as WeaponCard).icon
      : kind === "items"
        ? (card as ItemCard).icon
        : (card as DropsCard).portrait;
  return path ? [path] : [];
}

/** A card's tree, by kind. */
export function detailCardTree(
  kind: DetailCardKind,
  card: WeaponCard | ItemCard | DropsCard,
  assets: DetailCardAssets,
  images: CardImages,
): CardNode {
  if (kind === "weapons") return weaponCardTree(card as WeaponCard, assets, images);
  if (kind === "items") return itemCardTree(card as ItemCard, assets, images);
  return dropsCardTree(card as DropsCard, assets, images);
}
