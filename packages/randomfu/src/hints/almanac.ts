/**
 * The RandomFU Almanac: the bookshelf's "Lay of the Land" articles rewritten
 * as an index of where every crafting material now comes from, a line per
 * item: the shops that sell it, then its earliest gathering spots, carves,
 * captures, breaks and quest rewards (`bookshelf.ts` writes and unlocks the
 * articles).
 *
 * Sources are read back from the edited files after every shuffle, so the
 * Almanac shows the seed as it plays.
 */
import { OvlFile } from "mhfu-extract/src/container/ovl.js";
import { findShops, readTable, type ShopList } from "mhfu-extract/src/shops/shops.js";
import type { ParsedQuest } from "mhfu-extract/src/quests/parser.js";
import type { Edits } from "../edits.js";
import type { GameData } from "../game/load.js";
import { monsterKey, monsterStars, tierOrder, type Tier } from "../game/tiers.js";
import { monsterName, tableName } from "../names.js";
import { collectGatheringSlots } from "../shuffles/gathering.js";
import { collectQuestRewardSlots } from "../shuffles/quest-rewards.js";
import {
  checkPage,
  fitLine,
  introPage,
  letterTitle,
  PAGE_LINES,
  PAGE_WIDTH,
  spreadEvenly,
  textBytes,
  width,
  type Article,
  type GuidePlan,
} from "./bookshelf.js";
import { compact, paint, STYLE } from "./style.js";
import { mapLabel, readMonsterDrops, recipeMaterials, tierShort } from "./sources.js";

export const ALMANAC_NAME = "RandomFU Almanac";

/** The "Lay of the Land" articles, in order: title string and page count. */
export const ALMANAC_ARTICLES_EU: readonly Article[] = [
  { title: 107, pages: 10 },
  { title: 118, pages: 7 },
  { title: 126, pages: 7 },
  { title: 134, pages: 7 },
  { title: 142, pages: 8 },
  { title: 151, pages: 8 },
  { title: 160, pages: 7 },
  { title: 168, pages: 6 },
  { title: 175, pages: 7 },
  { title: 183, pages: 4 },
  { title: 188, pages: 8 },
  { title: 197, pages: 7 },
  { title: 205, pages: 6 },
  { title: 212, pages: 7 },
  { title: 220, pages: 10 },
];

/** Where an item comes from. */
export interface ItemSource {
  type: "shop" | "map" | "monster" | "reward";
  /** "Village shop", "Forest", "Rathalos", "Reward". */
  place: string;
  /** For monsters: "carve", "tail", "shiny", "capture" or "break". */
  how?: string;
  /** Null for shops. */
  tier: Tier | null;
}

export interface AlmanacItem {
  itemId: number;
  name: string;
  /** Shops first, then the rest earliest first; each source once, at its earliest tier. */
  sources: ItemSource[];
}

const TYPE_ORDER = ["shop", "map", "monster", "reward"] as const;
const HOW_ORDER = ["carve", "tail", "shiny", "capture", "break"];

/** Joins names with "/", the first `cap` of them and a "+" for the rest. */
const joinCapped = (names: readonly string[], cap: number) =>
  names.length <= cap ? names.join("/") : `${names.slice(0, cap).join("/")}+`;

/**
 * An item's sources as the Almanac lists them, earliest first: shops, then
 * a label per tier for its maps ("Desert/Jungle LR★1"), one per monster
 * ("Rathalos carve/break LR★2") and one for quest rewards ("Reward LR★3").
 */
export function sourceLabels(sources: readonly ItemSource[], styled = false): string[] {
  const labels: string[] = [];
  const push = (type: ItemSource["type"], ...texts: string[]) =>
    labels.push(...texts.map((t) => (styled ? paint(STYLE.source[type], t) : t)));
  for (let i = 0; i < sources.length;) {
    const s = sources[i]!;
    const same = (t: ItemSource) =>
      t.type === s.type &&
      (t.tier === null
        ? s.tier === null
        : s.tier !== null && tierOrder(t.tier) === tierOrder(s.tier)) &&
      (s.type !== "monster" || t.place === s.place);
    let j = i;
    while (j < sources.length && same(sources[j]!)) j++;
    const group = sources.slice(i, j);
    i = j;
    const tier = s.tier ? ` ${tierShort(s.tier)}` : "";
    if (s.type === "shop") push(s.type, ...group.map((g) => g.place));
    else if (s.type === "map")
      push(s.type, `${joinCapped([...new Set(group.map((g) => g.place))], 2)}${tier}`);
    else if (s.type === "monster")
      push(
        s.type,
        `${s.place} ${joinCapped(
          group.map((g) => g.how!),
          2,
        )}${tier}`,
      );
    else push(s.type, `${s.place}${tier}`);
  }
  return labels;
}

function shopLabel(name: string): string {
  if (name.startsWith("Village")) return "Village shop";
  if (name.startsWith("Guild")) return "Guild shop";
  return "Peddler";
}

/**
 * Every item's sources as the edited files now hold them, for the items in
 * `only` if given. Shops come from `lobby_task.ovl` (all but the Point
 * Exchange), the rest from quests the player can take and monsters that
 * appear in them (`questTier`, `monsterStars`).
 */
export function collectItemSources(
  game: GameData,
  quests: readonly ParsedQuest[],
  edits: Edits,
  only: ReadonlySet<number> | null = null,
): AlmanacItem[] {
  const sources = new Map<number, ItemSource[]>();
  const add = (itemId: number, source: ItemSource) => {
    if (itemId === 0 || tableName("ItemID", itemId) === null) return;
    if (only && !only.has(itemId)) return;
    sources.set(itemId, [...(sources.get(itemId) ?? []), source]);
  };

  // Shops: the tables as the disc had them; their lists as the shuffles left them.
  const lobby = new OvlFile(edits.dataFileNow(game.lobbyTask.index));
  const lists = new Map<number, ShopList>();
  for (const table of findShops(game.lobbyTask.ovl).tables) {
    if (table.special) continue;
    for (const offset of readTable(lobby, table.at, lists) ?? []) {
      for (const itemId of lists.get(offset)?.items ?? []) {
        add(itemId, { type: "shop", place: shopLabel(table.name), tier: null });
      }
    }
  }

  for (const slot of collectGatheringSlots(game.quests).slots) {
    const itemId = edits.questNow(slot.quest).readUInt16LE(slot.offset + 2);
    add(itemId, {
      type: "map",
      place: mapLabel(slot.quest.parsed.header.map),
      tier: slot.tier,
    });
  }

  const stars = monsterStars(quests);
  for (const drop of readMonsterDrops(game, edits)) {
    const star = stars.get(monsterKey(drop.emId, drop.band));
    if (star === undefined) continue;
    add(drop.itemId, {
      type: "monster",
      place: monsterName(drop.emId),
      how: drop.how,
      tier: { band: drop.band, stars: star },
    });
  }

  for (const slot of collectQuestRewardSlots(game.quests)) {
    const itemId = edits.questNow(slot.quest).readUInt16LE(slot.offset + 2);
    add(itemId, { type: "reward", place: "Reward", tier: slot.tier });
  }

  return [...sources]
    .map(([itemId, all]) => ({
      itemId,
      name: tableName("ItemID", itemId)!,
      sources: earliest(all),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.itemId - b.itemId);
}

/** Each source once, at its earliest tier: shops first, then earliest first. */
export function earliest(sources: readonly ItemSource[]): ItemSource[] {
  const best = new Map<string, ItemSource>();
  for (const s of sources) {
    const key = `${s.type}:${s.place}:${s.how ?? ""}`;
    const current = best.get(key);
    if (!current || (s.tier && current.tier && tierOrder(s.tier) < tierOrder(current.tier))) {
      best.set(key, s);
    }
  }
  const rank = (s: ItemSource) => (s.tier ? tierOrder(s.tier) : -1);
  return [...best.values()].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      a.place.localeCompare(b.place) ||
      HOW_ORDER.indexOf(a.how ?? "") - HOW_ORDER.indexOf(b.how ?? ""),
  );
}

/**
 * One item's line: its name, then as many source labels as fit (at most
 * `max`). A first label too wide for the line is cut short.
 */
export function itemLine(item: AlmanacItem, max = Infinity): string {
  const name = item.name.length > 22 ? `${item.name.slice(0, 21)}.` : item.name;
  const labels = sourceLabels(item.sources, true).slice(0, max);
  const line = fitLine(`${name}: `, labels, "-", ", ");
  if (!line.endsWith(": -") || labels.length === 0) return compact(line);
  let cut = sourceLabels(item.sources)[0]!;
  while (width(`${name}: ${cut}`) > PAGE_WIDTH) cut = cut.slice(0, -1);
  return compact(`${name}: ${paint(STYLE.source[item.sources[0]!.type], cut)}`);
}

/** How many source labels an item's line shows. */
export function shownSources(item: AlmanacItem): number {
  const labels = sourceLabels(item.sources).length;
  let n = 0;
  while (n < labels && itemLine(item, n + 1) !== itemLine(item, n)) n++;
  return n;
}

/**
 * How many labels each item's line may show so the lines take `over`
 * fewer bytes: one label at a time off the lines that show the most, the
 * last (latest) first. Items with no entry show all that fit.
 */
export function trimSources(items: readonly AlmanacItem[], over: number): Map<number, number> {
  const caps = new Map(items.map((item) => [item.itemId, shownSources(item)]));
  const top = Math.max(0, ...caps.values());
  for (let level = top; level > 1 && over > 0; level--) {
    for (const item of items) {
      if (over <= 0) break;
      if (caps.get(item.itemId) !== level) continue;
      over -=
        Buffer.byteLength(itemLine(item, level)) - Buffer.byteLength(itemLine(item, level - 1));
      caps.set(item.itemId, level - 1);
    }
  }
  return caps;
}

/** The Almanac's first page. */
export function almanacIntro(seed: string): string {
  const { source } = STYLE;
  return compact(
    introPage(ALMANAC_NAME, seed, [
      "Every crafting material, A to Z, and where,",
      "earliest first. LR, HR, G ★: rank and stars.",
      `${paint(source.shop, "Village shop, Guild shop, Peddler")}: buy it.`,
      `${paint(source.map, "Forest, Desert/Jungle...")}: gather it there.`,
      `${paint(source.monster, "Rathalos carve, tail, break...")}: from it.`,
      `${paint(source.reward, "Reward")}: a quest's reward. +: and more.`,
    ]),
  );
}

/**
 * Each article's title and pages: the intro, then the article's share of
 * items eight lines a page. Items that don't fit are returned in `left`.
 */
export function almanacStrings(
  seed: string,
  items: readonly AlmanacItem[],
  articles: readonly Article[],
  caps: ReadonlyMap<number, number> = new Map(),
): { texts: string[]; titles: string[]; listed: AlmanacItem[][]; left: AlmanacItem[] } {
  const intro = almanacIntro(seed);
  checkPage(intro);
  const counts = spreadEvenly(
    items.length,
    articles.map((a, i) => (a.pages - (i === 0 ? 1 : 0)) * PAGE_LINES),
  );
  const texts: string[] = [];
  const titles: string[] = [];
  const listed: AlmanacItem[][] = [];
  let next = 0;
  articles.forEach((article, i) => {
    const own = items.slice(next, next + counts[i]!);
    next += own.length;
    const pages = i === 0 ? [intro] : [];
    for (let at = 0; at < own.length; at += PAGE_LINES) {
      pages.push(
        compact(
          own
            .slice(at, at + PAGE_LINES)
            .map((item) => itemLine(item, caps.get(item.itemId)))
            .join("\n"),
        ),
      );
    }
    pages.forEach(checkPage);
    while (pages.length < article.pages) pages.push(" ");
    titles.push(
      letterTitle(
        ALMANAC_NAME,
        own.map((item) => item.name),
      ),
    );
    texts.push(titles.at(-1)!, ...pages);
    listed.push(own);
  });
  return { texts, titles, listed, left: items.slice(next) };
}

/**
 * The Almanac for this seed, to write with `writeGuides`: its articles, and
 * its text shrunk to a size, lines dropping their latest label, the
 * fullest lines first.
 */
export function planAlmanac(
  game: GameData,
  quests: readonly ParsedQuest[],
  seed: string,
  edits: Edits,
): GuidePlan {
  const title = "Bookshelf item almanac";
  const articles = ALMANAC_ARTICLES_EU;
  const materials = recipeMaterials(game, edits);
  const items = collectItemSources(game, quests, edits, materials);
  const shown = new Map(items.map((item) => [item.itemId, shownSources(item)]));
  return {
    title,
    articles,
    fit(bytes) {
      let caps = new Map<number, number>();
      let book = almanacStrings(seed, items, articles);
      // trimSources counts each line alone; page by page a few bytes differ, so go again if short.
      for (let over = textBytes(book.texts) - bytes, extra = 0; over > 0;) {
        const next = trimSources(items, over + extra);
        if ([...next].every(([id, n]) => n === caps.get(id))) break;
        caps = next;
        book = almanacStrings(seed, items, articles, caps);
        extra += Math.max(0, textBytes(book.texts) - bytes);
        if (textBytes(book.texts) <= bytes) break;
      }
      const trimmed = items.filter(
        (item) => (caps.get(item.itemId) ?? Infinity) < shown.get(item.itemId)!,
      ).length;
      const notes = [
        `Home > Open Bookshelf > Info Magazine: the Lay of the Land articles are now the ${ALMANAC_NAME}, a line per crafting material naming the shops that sell it and its earliest gathering spots, carves, captures, breaks and quest rewards, readable from the start. In English in every language.`,
      ];
      if (!materials) {
        notes.push("The EBOOT wasn't loaded, so every item is listed, not just materials.");
      }
      if (trimmed > 0) notes.push(`For room, ${trimmed} lines leave out their latest source.`);
      if (book.left.length > 0) {
        notes.push(
          `No room for ${book.left.length} items: ${book.left.map((item) => item.name).join(", ")}.`,
        );
      }
      return {
        texts: book.texts,
        report: {
          title,
          notes,
          lines: book.listed.map((own, i) => ({
            where: book.titles[i]!,
            text:
              own.length > 0
                ? `${own.length} items, ${own[0]!.name} to ${own.at(-1)!.name}`
                : "(blank)",
          })),
        },
      };
    },
  };
}
