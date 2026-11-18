/**
 * Where an item comes from: monster drops (carves, breaks, captures, shiny
 * drops) and quest rewards, indexed by in-game item ID. Pure, so the item
 * pages build it on the client from the bundles they already cache, and the
 * tests build it from data/.
 */
import { formatRank, parseDropSource, type DropSource } from "./monster-drops";
import { QUEST_HUB_SLUGS, isHiddenQuest, type Quest, type QuestRewardTable } from "./quests";
import { slugify } from "./slug";
import type { Monster } from "./types";

/** An item's page: /items/<slug>/, the slug from its name. */
export function itemHref(name: string): string {
  return `/items/${slugify(name)}/`;
}

/** One monster drop that gives the item. */
export interface MonsterSource {
  monster: { name: string; href: string };
  /** "Low Rank", "G Rank", … (the drop table's rank, through `formatRank`) */
  rank: string;
  /** How it's obtained: "Body carves" ×3, "Break tail", "Shiny drop" … */
  source: DropSource;
  /** Percent per attempt */
  chance: number;
  /** How many each success gives */
  quantity: number;
}

/** One quest reward table that gives the item. */
export interface QuestSource {
  quest: Quest;
  table: QuestRewardTable;
  /** Percent per draw */
  chance: number;
  /** How many each draw gives */
  amount: number;
}

export interface ItemSources {
  monsters: MonsterSource[];
  quests: QuestSource[];
}

/** A monster with its drop tables and page, as `buildItemSources` reads it. */
export interface SourceMonster {
  name: string;
  href: string;
  drops?: Monster["drops"];
}

/**
 * Every item's sources, by item ID. Drops are matched to items by name
 * (`itemId`); quest rewards already carry item IDs. Quests the site leaves
 * out (`isHiddenQuest`) are skipped. Each list is in `sortSources` order.
 */
export function buildItemSources(
  monsters: SourceMonster[],
  quests: Quest[],
  itemId: (name: string) => number | undefined,
): Map<number, ItemSources> {
  const out = new Map<number, ItemSources>();
  const entry = (id: number) => {
    let e = out.get(id);
    if (!e) {
      e = { monsters: [], quests: [] };
      out.set(id, e);
    }
    return e;
  };

  for (const m of monsters) {
    for (const [rank, sources] of Object.entries(m.drops ?? {})) {
      for (const [source, drops] of Object.entries(sources)) {
        for (const drop of drops) {
          const id = itemId(drop.name);
          if (id === undefined) continue;
          entry(id).monsters.push({
            monster: { name: m.name, href: m.href },
            rank: formatRank(rank),
            source: parseDropSource(source),
            chance: parseFloat(drop.chance) || 0,
            quantity: drop.quantity ?? 1,
          });
        }
      }
    }
  }

  for (const quest of quests) {
    if (isHiddenQuest(quest.id)) continue;
    for (const table of quest.rewardTables) {
      for (const reward of table.items) {
        entry(reward.itemId).quests.push({
          quest,
          table,
          chance: reward.chance,
          amount: reward.amount,
        });
      }
    }
  }

  for (const e of out.values()) sortSources(e);
  return out;
}

/** The ranks monster drops are listed under, in the order the game unlocks them. */
const RANK_ORDER = ["Low Rank", "High Rank", "G Rank"];
const rankOrder = (rank: string) => {
  const i = RANK_ORDER.indexOf(rank);
  return i === -1 ? RANK_ORDER.length : i;
};

/**
 * Best first: monster drops by rank, then chance (highest first), then
 * monster; quest rewards by board, then chance, then stars and quest ID.
 */
export function sortSources(s: ItemSources): ItemSources {
  s.monsters.sort(
    (a, b) =>
      rankOrder(a.rank) - rankOrder(b.rank) ||
      a.rank.localeCompare(b.rank) ||
      b.chance - a.chance ||
      a.monster.name.localeCompare(b.monster.name),
  );
  const hub = (q: Quest) => QUEST_HUB_SLUGS.indexOf(q.hub);
  s.quests.sort(
    (a, b) =>
      hub(a.quest) - hub(b.quest) ||
      b.chance - a.chance ||
      a.quest.stars - b.quest.stars ||
      a.quest.id - b.quest.id,
  );
  return s;
}

/** Items grouped by a key, in first-seen order. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return [...groups];
}
