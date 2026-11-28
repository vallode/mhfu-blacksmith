/**
 * Where each item is best had, by item name: the monsters that drop it
 * (one row per monster and set of ranks, the best chance first) and the
 * quest rewards that give it (highest chance first). Read from data/ at
 * build time for the item cards (detail-card-data.ts) and the Discord bot's
 * index, so the two list the same sources in the same order.
 */
import { readData } from "game-data";
import { MONSTER_CATEGORIES } from "./constants";
import { formatRank, parseDropSource, splitDropQuantity } from "./monster-drops";
import { DATA_DIR } from "./paths";
import { isHiddenQuest, questHubLabel, questHubSlug, questStarLevel } from "./quests";
import type { CardDropWay, CardItemDrop, CardItemReward } from "./detail-card";

export type { CardDropWay as ItemDropWay, CardItemDrop as ItemDrop, CardItemReward as ItemReward };

const QUEST_FILES = [
  "village",
  "guild",
  "training-school",
  "treasure-hunting",
  "event",
  "challenge",
];

interface RawDrop extends CardDropWay {
  monster: string;
  rank: string;
}

/** Drop table ranks, short and in order. The bestiary heads the first tables
 *  three ways ("1-2 star", "1-2 star rank", "1-2 star guild"): all ★1-2. */
const RANKS = ["LR ★1-2", "LR", "HR", "G"];
export function shortRank(heading: string): string {
  const h = heading.toLowerCase().replace(/-/g, " ");
  if (h.startsWith("1 2 star")) return "LR ★1-2";
  if (h.startsWith("low rank")) return "LR";
  if (h.startsWith("high rank")) return "HR";
  if (h.startsWith("g rank")) return "G";
  return formatRank(heading);
}
const rankOrder = (r: string) => (RANKS.includes(r) ? RANKS.indexOf(r) : RANKS.length);

/** "Guild LR ★5", "Guild G★2", "Village ★7". */
export function questWhere(hub: string, rank: string | null, stars: number): string {
  const slug = questHubSlug(hub, rank);
  if (!slug) return `${hub} ★${stars}`;
  const label = questHubLabel(slug)
    .replace(/ Low Rank$/, " LR")
    .replace(/ High Rank$/, " HR")
    .replace(/ G Rank$/, "");
  const level = questStarLevel(slug, stars);
  return `${label} ${level.g ? "G" : ""}★${level.stars}`;
}

/**
 * One row per monster and set of ranks: the same drop at several ranks is
 * one way (its ranks joined), and a monster's ways at the same ranks share
 * a row. Monsters with the best chance first.
 */
function groupDrops(drops: RawDrop[]): CardItemDrop[] {
  const ways = new Map<string, { way: CardDropWay; monster: string; ranks: Set<string> }>();
  for (const d of drops) {
    const key = `${d.monster}|${d.how}|${d.chance}|${d.quantity ?? 1}`;
    const seen = ways.get(key);
    if (seen) seen.ranks.add(d.rank);
    else {
      const { monster, rank, ...way } = d;
      ways.set(key, { way, monster, ranks: new Set([rank]) });
    }
  }
  const rows = new Map<string, CardItemDrop>();
  for (const { way, monster, ranks } of ways.values()) {
    // ★1-2 is part of Low Rank: a drop at both is a Low Rank one.
    if (ranks.has("LR")) ranks.delete("LR ★1-2");
    const label = [...ranks].sort((a, b) => rankOrder(a) - rankOrder(b)).join(", ");
    const key = `${monster}|${label}`;
    const row = rows.get(key) ?? { monster, ranks: label, ways: [] };
    row.ways.push(way);
    rows.set(key, row);
  }
  const best = (r: CardItemDrop) => Math.max(...r.ways.map((w) => w.chance));
  const monsterBest = new Map<string, number>();
  for (const r of rows.values()) {
    r.ways.sort((a, b) => b.chance - a.chance);
    monsterBest.set(r.monster, Math.max(monsterBest.get(r.monster) ?? 0, best(r)));
  }
  // A monster's rows stay together, under its best chance.
  return [...rows.values()].sort(
    (a, b) =>
      monsterBest.get(b.monster)! - monsterBest.get(a.monster)! ||
      a.monster.localeCompare(b.monster) ||
      best(b) - best(a),
  );
}

let cache: Map<string, { drops: CardItemDrop[]; rewards: CardItemReward[] }> | null = null;

/** Every monster drop and quest reward, by item name, best (highest chance) first. */
export function itemBestSources(): Map<
  string,
  { drops: CardItemDrop[]; rewards: CardItemReward[] }
> {
  if (cache) return cache;
  const raw = new Map<string, { drops: RawDrop[]; rewards: CardItemReward[] }>();
  const of = (name: string) => {
    let e = raw.get(name);
    if (!e) raw.set(name, (e = { drops: [], rewards: [] }));
    return e;
  };
  for (const category of MONSTER_CATEGORIES) {
    const { monsters } = readData<{
      monsters: {
        name: string;
        drops?: Record<
          string,
          Record<string, { name: string; chance: string; quantity?: number }[]>
        >;
      }[];
    }>(DATA_DIR, "monsters", `${category}.json`);
    for (const m of monsters)
      for (const [rank, tables] of Object.entries(m.drops ?? {}))
        for (const [source, drops] of Object.entries(tables)) {
          // The carve count is the monster's, not the item's: left out.
          const { title } = parseDropSource(source);
          for (const d of drops) {
            const [name, inName] = splitDropQuantity(d.name);
            const quantity = d.quantity ?? inName ?? 1;
            of(name).drops.push({
              monster: m.name,
              rank: shortRank(rank),
              how: title,
              chance: parseFloat(d.chance) || 0,
              ...(quantity > 1 && { quantity }),
            });
          }
        }
  }
  for (const file of QUEST_FILES) {
    const { quests } = readData<{
      quests: {
        id: number;
        hub: string;
        rank: string | null;
        stars: number;
        title?: string;
        reward_tables: { items: { item: string; chance: number; amount: number }[] }[];
      }[];
    }>(DATA_DIR, "quests", `${file}.json`);
    for (const q of quests) {
      if (isHiddenQuest(q.id) || !q.title) continue;
      const where = questWhere(q.hub, q.rank, q.stars);
      for (const table of q.reward_tables)
        for (const r of table.items)
          of(r.item).rewards.push({
            quest: q.title,
            where,
            chance: r.chance,
            ...(r.amount > 1 && { amount: r.amount }),
          });
    }
  }
  cache = new Map();
  for (const [name, e] of raw) {
    e.rewards.sort((a, b) => b.chance - a.chance);
    cache.set(name, { drops: groupDrops(e.drops), rewards: e.rewards });
  }
  return cache;
}
