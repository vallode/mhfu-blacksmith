/**
 * Encodes data/quests/*.json into the compact public/data/quests.json bundle
 * (shape and decoder: src/lib/quests.ts). Item names become in-game item IDs
 * (names and icons then come from items.json); monster names link to monster
 * pages; strings and identical reward tables are stored once.
 */
import {
  QUEST_HUBS,
  QUEST_MONSTER_ALIASES,
  QUEST_NON_MONSTERS,
  REWARD_KINDS,
  ROLL_OUTCOMES,
  questHp,
  questHubSlug,
  type CompactMonsterStats,
  type CompactQuest,
  type CompactQuestSize,
  type CompactRewardTable,
  type CompactSupplies,
  type QuestsBundle,
} from "../../src/lib/quests";

/** One data/quests/*.json quest, as far as the bundle reads it. */
export interface QuestRecord {
  id: number;
  hub: string;
  rank: string | null;
  stars: number;
  map: string | null;
  fee: number;
  reward: number;
  time_limit_minutes: number;
  target: { monster: string; amount: number } | null;
  supplies: { item: string; amount: number }[];
  reward_tables: {
    kind?: string;
    draws?: number | null;
    condition?: number | null;
    items: { chance: number; item: string; amount: number }[];
  }[];
  large_monsters: {
    monster: string;
    multipliers?: { hp: number; attack: number; defense: number; status: number };
    crown_chances?: { mini: number; silver: number; gold: number };
  }[];
  monster_size?: { modifier: number; min: number; max: number; fixed_until_flag?: number } | null;
  small_monsters: { monster: string; total_quantity?: number; endless?: boolean }[];
  title: string | null;
  goal: string | null;
  details: string | null;
  fail: string | null;
  client: string | null;
  requires?: number | null;
  urgent?: boolean;
}

export interface QuestBundleInputs {
  quests: QuestRecord[];
  /** item name -> in-game item ID */
  itemId: (name: string) => number | undefined;
  /** site monster name -> its page */
  monsterPage: (name: string) => { category: string; slug: string } | undefined;
  /** site monster name -> its base HP */
  baseHp?: (name: string) => number | undefined;
  /** whether area-maps.json has this quest */
  hasAreaMap?: (questId: number) => boolean;
}

export function encodeQuestBundle({
  quests,
  itemId,
  monsterPage,
  baseHp = () => undefined,
  hasAreaMap = () => false,
}: QuestBundleInputs): {
  bundle: QuestsBundle;
  unresolvedItems: string[];
} {
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const str = (s: string | null | undefined): number | null => {
    if (!s) return null;
    let i = stringIndex.get(s);
    if (i === undefined) {
      i = strings.length;
      strings.push(s);
      stringIndex.set(s, i);
    }
    return i;
  };

  const monsters: QuestsBundle["monsters"] = [];
  const monsterIndex = new Map<string, number>();
  const monster = (discName: string): number => {
    const name = QUEST_MONSTER_ALIASES[discName] ?? discName;
    let i = monsterIndex.get(name);
    if (i === undefined) {
      const page = monsterPage(name);
      i = monsters.length;
      monsters.push([name, page?.category ?? null, page?.slug ?? null]);
      monsterIndex.set(name, i);
    }
    return i;
  };

  const unresolved = new Set<string>();
  const item = (name: string): number | undefined => {
    const id = itemId(name);
    if (id === undefined) unresolved.add(name);
    return id;
  };

  const tables: CompactRewardTable[] = [];
  const tableIndex = new Map<string, number>();
  const table = (t: QuestRecord["reward_tables"][number]): number => {
    const kind = REWARD_KINDS.indexOf((t.kind ?? "conditional") as (typeof REWARD_KINDS)[number]);
    const compact: CompactRewardTable = [
      kind === -1 ? REWARD_KINDS.indexOf("conditional") : kind,
      t.draws ?? null,
      t.condition ?? null,
      t.items.flatMap((r) => {
        const id = item(r.item);
        if (id === undefined) return [];
        return [
          r.amount === 1 ? [r.chance, id] : [r.chance, id, r.amount],
        ] as CompactRewardTable[3];
      }),
    ];
    const key = JSON.stringify(compact);
    let i = tableIndex.get(key);
    if (i === undefined) {
      i = tables.length;
      tables.push(compact);
      tableIndex.set(key, i);
    }
    return i;
  };

  const supplies: CompactSupplies[] = [];
  const suppliesIndex = new Map<string, number>();
  const supplyList = (list: QuestRecord["supplies"]): number | null => {
    // The disc repeats rows (quest 1 has four "Map x1" rows); keep each
    // distinct row once, with how many times it appears.
    const rows = new Map<string, [number, number] | [number, number, number]>();
    for (const s of list) {
      const id = item(s.item);
      if (id === undefined) continue;
      const key = `${id}:${s.amount}`;
      const row = rows.get(key);
      if (row) row[2] = (row[2] ?? 1) + 1;
      else rows.set(key, [id, s.amount]);
    }
    if (rows.size === 0) return null;
    const compact = [...rows.values()];
    const key = JSON.stringify(compact);
    let i = suppliesIndex.get(key);
    if (i === undefined) {
      i = supplies.length;
      supplies.push(compact);
      suppliesIndex.set(key, i);
    }
    return i;
  };

  /** Each spawn with multipliers, once per distinct row. */
  const monsterStats = (list: QuestRecord["large_monsters"]): CompactMonsterStats[] => {
    const rows = new Map<string, CompactMonsterStats>();
    for (const { monster: name, multipliers: m } of list) {
      if (!m) continue;
      const i = monster(name);
      const base = baseHp(monsters[i]![0]);
      const row: CompactMonsterStats = [
        i,
        base === undefined ? null : questHp(base, m.hp),
        m.attack,
        m.defense,
        m.status,
      ];
      rows.set(JSON.stringify(row), row);
    }
    return [...rows.values()];
  };

  /** The roll's range and each crowned monster's chances, once per monster. */
  const monsterSize = (q: QuestRecord): CompactQuestSize | null => {
    const size = q.monster_size;
    if (!size) return null;
    const crowns = new Map<number, CompactQuestSize[4][number]>();
    const outcomes = (chance: number) => Math.round(chance * ROLL_OUTCOMES);
    for (const { monster: name, crown_chances: c } of q.large_monsters) {
      if (!c) continue;
      const i = monster(name);
      crowns.set(i, [i, outcomes(c.mini), outcomes(c.silver), outcomes(c.gold)]);
    }
    return [
      size.modifier,
      size.min,
      size.max,
      size.fixed_until_flag === undefined ? 0 : 1,
      [...crowns.values()],
    ];
  };

  /** The small monsters, with each one's total in the quest, parallel to each other. */
  const smallMonsters = (list: QuestRecord["small_monsters"]) => {
    const spawns = new Map<number, [total: number] | [total: number, endless: 1]>();
    for (const x of list) {
      if (QUEST_NON_MONSTERS.has(x.monster)) continue;
      const i = monster(x.monster);
      const row = spawns.get(i) ?? [0];
      row[0] += x.total_quantity ?? 0;
      if (x.endless) (row as number[])[1] = 1;
      spawns.set(i, row);
    }
    return { indices: [...spawns.keys()], counts: [...spawns.values()] };
  };

  const items: CompactQuest[] = [];
  for (const q of quests) {
    const hub = questHubSlug(q.hub, q.rank);
    if (!hub) continue;
    const small = smallMonsters(q.small_monsters);
    items.push([
      q.id,
      QUEST_HUBS.findIndex((h) => h.slug === hub),
      q.stars,
      str(q.map),
      q.fee,
      q.reward,
      q.time_limit_minutes,
      q.target ? [monster(q.target.monster), q.target.amount] : null,
      [...new Set(q.large_monsters.map((x) => monster(x.monster)))],
      small.indices,
      supplyList(q.supplies),
      q.reward_tables.map(table),
      str(q.title),
      str(q.goal),
      str(q.fail),
      str(q.details),
      str(q.client),
      q.requires ?? null,
      q.urgent ? 1 : 0,
      monsterStats(q.large_monsters),
      hasAreaMap(q.id) ? 1 : 0,
      small.counts,
      monsterSize(q),
    ]);
  }

  return {
    bundle: { kind: "quests", strings, monsters, tables, supplies, items },
    unresolvedItems: [...unresolved].sort(),
  };
}
