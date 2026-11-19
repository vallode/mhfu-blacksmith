/**
 * Quests: hub constants, the compact quests.json bundle shape written by
 * scripts/generate-data.ts, and its decoder. Pure (no fs), so it's shared by
 * the generator, the pages and the client.
 */

import { CROWN_ORDER, type Crown } from "./crowns";

/**
 * A quest board: Village, the three Guild ranks, Training School, Treasure
 * Hunting, then the downloaded Event and Challenge Quests (not on the disc;
 * see mhfu-extract's README, "Downloadable quests"). `guildStars`: the
 * board numbers its stars like the Guild's, ★9 and up showing as G★1-G★3
 * (see `questStarLevel`).
 */
export const QUEST_HUBS = [
  { slug: "village", label: "Village", hub: "village", rank: null, guildStars: false },
  { slug: "low-rank", label: "Guild Low Rank", hub: "guild", rank: "low-rank", guildStars: true },
  {
    slug: "high-rank",
    label: "Guild High Rank",
    hub: "guild",
    rank: "high-rank",
    guildStars: true,
  },
  { slug: "g-rank", label: "Guild G Rank", hub: "guild", rank: "g-rank", guildStars: true },
  {
    slug: "training-school",
    label: "Training School",
    hub: "training-school",
    rank: null,
    guildStars: false,
  },
  {
    slug: "treasure-hunting",
    label: "Treasure Hunting",
    hub: "treasure-hunting",
    rank: null,
    guildStars: false,
  },
  { slug: "event", label: "Event", hub: "event", rank: null, guildStars: true },
  { slug: "challenge", label: "Challenge", hub: "challenge", rank: null, guildStars: false },
] as const;

export type QuestHubSlug = (typeof QUEST_HUBS)[number]["slug"];
export const QUEST_HUB_SLUGS: readonly QuestHubSlug[] = QUEST_HUBS.map((h) => h.slug);

/**
 * Boards of downloaded quests. A save has no cleared bit for them, so they
 * stay out of a hunter's quest progress, and no copy of the game has them,
 * so they aren't places to gather or stages of the game. They hold few
 * enough quests that their page lists them all together, each with its star
 * level, filtered by rank as well as type, instead of a star level at a time.
 */
export const DOWNLOADED_QUEST_HUBS: ReadonlySet<QuestHubSlug> = new Set(["event", "challenge"]);

/** A quest's rank tier, as data/quests has it. */
export const QUEST_RANKS = ["low-rank", "high-rank", "g-rank"] as const;
export type QuestRank = (typeof QUEST_RANKS)[number];

/** The hub page a data/quests record belongs on, from its `hub` and `rank`. */
export function questHubSlug(hub: string, rank: string | null): QuestHubSlug | null {
  const match = QUEST_HUBS.find((h) => h.hub === hub && (h.rank === null || h.rank === rank));
  return match?.slug ?? null;
}

export function questHubLabel(slug: string): string {
  return QUEST_HUBS.find((h) => h.slug === slug)?.label ?? slug;
}

/** Small-monster spawns that aren't monsters: Treasure Hunting's breakable rocks. */
export const QUEST_NON_MONSTERS: ReadonlySet<string> = new Set(["Rocks"]);

/** Quest types, in the order the boards' filter steps through them. */
export const QUEST_TYPES = ["hunting", "slaying", "gathering", "treasure"] as const;
export type QuestType = (typeof QUEST_TYPES)[number];

/** A quest type as the quest card heads it ("Hunting Quest"). */
export function questTypeLabel(type: QuestType): string {
  return `${type[0]!.toUpperCase()}${type.slice(1)} Quest`;
}

/**
 * A quest's type, read from its goal: the data has no type of its own (the
 * disc's quest header has one, not yet extracted). Slay N small monsters is
 * Slaying; deliveries, and the gathering tours that end on the Paw Pass
 * Ticket, are Gathering; Treasure Hunting's are Treasure; the rest (hunts
 * and the fortress defences) are Hunting.
 */
export function questType(hub: string, goal: string | null): QuestType {
  if (hub === "treasure-hunting") return "treasure";
  if (goal?.startsWith("Slay ")) return "slaying";
  if (goal?.startsWith("Deliver ") || goal?.includes("Paw Pass Ticket")) return "gathering";
  return "hunting";
}

/** The types a list of quests covers, in QUEST_TYPES order. */
export function questTypesIn(quests: Pick<Quest, "type">[]): QuestType[] {
  return QUEST_TYPES.filter((t) => quests.some((q) => q.type === t));
}

/** The ranks a list of quests covers, lowest first. */
export function questRanksIn(quests: Pick<Quest, "rank">[]): QuestRank[] {
  return QUEST_RANKS.filter((r) => quests.some((q) => q.rank === r));
}

/** One step of a board's filter: a quest type, or (on a downloaded quests' board) a rank. */
export type QuestFilter = { type: QuestType } | { rank: QuestRank };

/**
 * A board's filters, after "every quest": the ranks a downloaded quests'
 * board's quests cover, then the types. Each kind only when there is more than one
 * to choose between.
 */
export function questFilters(quests: Pick<Quest, "rank" | "type">[], hub: string): QuestFilter[] {
  const ranks = DOWNLOADED_QUEST_HUBS.has(hub as QuestHubSlug) ? questRanksIn(quests) : [];
  const types = questTypesIn(quests);
  return [
    ...(ranks.length > 1 ? ranks.map((rank) => ({ rank })) : []),
    ...(types.length > 1 ? types.map((type) => ({ type })) : []),
  ];
}

/** Whether a quest passes a filter (null: every quest does). */
export function matchesQuestFilter(
  quest: Pick<Quest, "rank" | "type">,
  filter: QuestFilter | null,
): boolean {
  if (!filter) return true;
  return "rank" in filter ? quest.rank === filter.rank : quest.type === filter.type;
}

/** Whether two filters are the same step (null is "every quest"). */
export function sameQuestFilter(a: QuestFilter | null, b: QuestFilter | null): boolean {
  if (!a || !b) return a === b;
  return "rank" in a ? "rank" in b && a.rank === b.rank : "type" in b && a.type === b.type;
}

// ---------------------------------------------------------------------------
// Bundle (public/data/quests.json)
// ---------------------------------------------------------------------------

/** Reward table kinds, as in data/schemas/quest.schema.json. */
export const REWARD_KINDS = ["main", "extra", "conditional"] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

/** [kind index into REWARD_KINDS, draws, condition, [chance, item ID, amount (omitted when 1)][]] */
export type CompactRewardTable = [
  kind: number,
  draws: number | null,
  condition: number | null,
  items: ([chance: number, itemId: number] | [chance: number, itemId: number, amount: number])[],
];

/** [name, category, slug]; category and slug are null when the site has no page for it. */
export type CompactQuestMonster = [name: string, category: string | null, slug: string | null];

/**
 * A large monster's stats in one quest: the monster, its HP (null without a
 * base HP) and its attack, defense and stagger multipliers.
 */
export type CompactMonsterStats = [
  monster: number,
  hp: number | null,
  attack: number,
  defense: number,
  stagger: number,
];

/**
 * The size a quest's large monsters roll, in percent of their base size:
 * the roll's centre and range, whether a story flag (likely the first clear)
 * holds them at 100 first, and each crowned monster's chance of a mini,
 * silver or gold crown size, in 1024ths (the roll has 1024 outcomes).
 */
export type CompactQuestSize = [
  modifier: number,
  min: number,
  max: number,
  fixedFirst: 0 | 1,
  crowns: [monster: number, mini: number, silver: number, gold: number][],
];

/** One supply list: [item ID, amount, stacks (only when more than 1)] rows, distinct, in disc order. */
export type CompactSupplies = ([number, number] | [number, number, number])[];

/**
 * One quest. Indices point into the bundle's tables; null where a quest has
 * no value. Titles etc. index `strings`, monsters index `monsters`.
 */
export type CompactQuest = [
  id: number,
  hub: number, // index into QUEST_HUBS
  stars: number,
  map: number | null,
  fee: number,
  reward: number,
  timeLimit: number, // minutes
  target: [monster: number, amount: number] | null,
  largeMonsters: number[],
  smallMonsters: number[],
  supplies: number | null, // index into supplies
  rewardTables: number[], // indices into tables, in disc order
  title: number | null,
  goal: number | null,
  fail: number | null,
  details: number | null,
  client: number | null,
  requires: number | null, // quest ID cleared before this one appears
  urgent: 0 | 1,
  monsterStats: CompactMonsterStats[], // distinct rows, in disc order
  areaMap: 0 | 1,
  smallCounts: ([total: number] | [total: number, endless: 1])[], // parallel to smallMonsters
  size: CompactQuestSize | null, // null without large monsters
  rank: number | null, // index into QUEST_RANKS; null without a rank tier
];

export interface QuestsBundle {
  kind: "quests";
  strings: string[];
  monsters: CompactQuestMonster[];
  /** reward tables shared between quests (identical tables are stored once) */
  tables: CompactRewardTable[];
  /** supply lists shared between quests */
  supplies: CompactSupplies[];
  items: CompactQuest[];
}

// ---------------------------------------------------------------------------
// Decoded
// ---------------------------------------------------------------------------

export interface QuestMonster {
  name: string;
  /** Monster page, when the site has one. */
  href: string | null;
}

/**
 * A large monster's stats in a quest, from its stat multiplier row
 * (data/schemas/quest.schema.json `multipliers`).
 */
export interface QuestMonsterStats {
  monster: QuestMonster;
  /** Base HP times the quest's HP multiplier, as the game rounds it; null without a base HP. */
  hp: number | null;
  /** Multiplies the damage it deals. */
  attack: number;
  /** Multiplies the damage it takes: lower is tougher. */
  defense: number;
  /** Multiplies the damage a part takes before the monster flinches. */
  stagger: number;
}

/** A crowned large monster's chance (0-1) of each crown size in a quest. */
export interface QuestCrownChances {
  monster: QuestMonster;
  mini: number;
  silver: number;
  gold: number;
}

/** The size, in percent, a quest's large monsters roll (src/lib/crowns.ts). */
export interface QuestMonsterSize {
  /** The roll's centre: a roll of 100 gives this. */
  modifier: number;
  min: number;
  max: number;
  /** Monsters stay at 100 until a story flag (likely the quest's first clear) is set. */
  fixedFirst: boolean;
  /** Each monster with crowns; others are always 100. */
  crowns: QuestCrownChances[];
}

export interface QuestReward {
  chance: number;
  itemId: number;
  amount: number;
}

export interface QuestRewardTable {
  kind: RewardKind;
  draws: number | null;
  condition: number | null;
  items: QuestReward[];
}

export interface Quest {
  id: number;
  hub: QuestHubSlug;
  /** The quest's rank tier; null without one (and in a bundle cached before ranks were added). */
  rank: QuestRank | null;
  type: QuestType;
  stars: number;
  map: string | null;
  fee: number;
  reward: number;
  timeLimit: number;
  target: { monster: QuestMonster; amount: number } | null;
  largeMonsters: QuestMonster[];
  /** Each distinct large monster spawn's stats; empty when the data has none. */
  monsterStats: QuestMonsterStats[];
  smallMonsters: QuestMonster[];
  /**
   * Each small monster's total in the quest (parallel to `smallMonsters`),
   * and whether it keeps spawning, in which case the total leaves those out.
   * Empty in a bundle cached before the totals were added.
   */
  smallSpawns: { total: number; endless: boolean }[];
  /** Distinct supply rows; `stacks` is how many times the disc lists the row. */
  supplies: { itemId: number; amount: number; stacks: number }[];
  rewardTables: QuestRewardTable[];
  title: string;
  goal: string | null;
  fail: string | null;
  details: string | null;
  client: string | null;
  /** ID of the quest that must be cleared before this one appears. */
  requires: number | null;
  /** An Urgent Quest, which unlocks the next star level. */
  urgent: boolean;
  /** Whether area-maps.json places this quest's gathering points. */
  hasAreaMap: boolean;
  /** Null without large monsters, or in a bundle cached before sizes were added. */
  monsterSize: QuestMonsterSize | null;
}

/** The size roll's outcomes: 32 tiers by 32 rolls. Crown chances are stored as counts of these. */
export const ROLL_OUTCOMES = 1024;

export function decodeQuests(b: QuestsBundle): Quest[] {
  const str = (i: number | null) => (i === null ? null : (b.strings[i] ?? null));
  const monsters: QuestMonster[] = b.monsters.map(([name, category, slug]) => ({
    name,
    href: category && slug ? `/monsters/${category}/${slug}/` : null,
  }));
  const tables: QuestRewardTable[] = b.tables.map(([kind, draws, condition, items]) => ({
    kind: REWARD_KINDS[kind] ?? "conditional",
    draws,
    condition,
    items: items.map(([chance, itemId, amount]) => ({ chance, itemId, amount: amount ?? 1 })),
  }));
  return b.items.map(
    ([
      id,
      hub,
      stars,
      map,
      fee,
      reward,
      timeLimit,
      tg,
      lm,
      sm,
      su,
      rw,
      n,
      g,
      x,
      d,
      c,
      rq,
      ur,
      ms,
      am,
      sc,
      sz,
      rk,
    ]) => ({
      id,
      hub: QUEST_HUBS[hub]?.slug ?? "village",
      rank: rk === undefined || rk === null ? null : (QUEST_RANKS[rk] ?? null),
      type: questType(QUEST_HUBS[hub]?.slug ?? "village", str(g)),
      stars,
      map: str(map),
      fee,
      reward,
      timeLimit,
      target: tg ? { monster: monsters[tg[0]]!, amount: tg[1] } : null,
      largeMonsters: lm.map((i) => monsters[i]!),
      // `?? []`: a bundle cached before stats were added has none.
      monsterStats: (ms ?? []).map(([m, hp, attack, defense, stagger]) => ({
        monster: monsters[m]!,
        hp,
        attack,
        defense,
        stagger,
      })),
      smallMonsters: sm.map((i) => monsters[i]!),
      smallSpawns: (sc ?? []).map(([total, endless]) => ({ total, endless: endless === 1 })),
      supplies: (su === null ? [] : (b.supplies[su] ?? [])).map(([itemId, amount, stacks]) => ({
        itemId,
        amount,
        stacks: stacks ?? 1,
      })),
      rewardTables: rw.map((i) => tables[i]!),
      title: str(n) ?? `Quest ${id}`,
      goal: str(g),
      fail: str(x),
      details: str(d),
      client: str(c),
      requires: rq ?? null,
      urgent: ur === 1,
      hasAreaMap: am === 1,
      monsterSize: sz
        ? {
            modifier: sz[0],
            min: sz[1],
            max: sz[2],
            fixedFirst: sz[3] === 1,
            crowns: sz[4].map(([m, mini, silver, gold]) => ({
              monster: monsters[m]!,
              mini: mini / ROLL_OUTCOMES,
              silver: silver / ROLL_OUTCOMES,
              gold: gold / ROLL_OUTCOMES,
            })),
          }
        : null,
    }),
  );
}

/**
 * A monster's HP in a quest, as the game works it out: base HP times the HP
 * multiplier in single precision, truncated (mhfu-extract
 * `monsters/multipliers.ts`).
 */
export function questHp(baseHp: number, multiplier: number): number {
  return Math.trunc(Math.fround(Math.fround(baseHp) * Math.fround(multiplier)));
}

/**
 * Quests left off the site for now: the 90 identical "Gathering - Snowy
 * Mountains" copies (IDs 30001-30090) on the Guild Low Rank board.
 */
export function isHiddenQuest(id: number): boolean {
  return id >= 30001 && id <= 30090;
}

/** Quests on a hub, by stars and then ID. */
export function questsOnHub(quests: Quest[], hub: string): Quest[] {
  return quests
    .filter((q) => q.hub === hub && !isHiddenQuest(q.id))
    .sort((a, b) => a.stars - b.stars || a.id - b.id);
}

/**
 * G Rank quests are stored at ★9-★11, after High Rank's ★6-★8. The game
 * shows them as G★1-G★3, on every board that numbers its stars like the
 * Guild's (`guildStars`: Event Quests do, the Village's ★9 doesn't).
 */
export const G_RANK_STAR_OFFSET = 8;

/** A star level as the game shows it: G Rank's are "G" and 1-3 stars. */
export interface StarLevel {
  g: boolean;
  stars: number;
}

/** The star level a quest on this hub (a QuestHubSlug) shows. */
export function questStarLevel(hub: string, stars: number): StarLevel {
  const guildStars = QUEST_HUBS.find((h) => h.slug === hub)?.guildStars ?? false;
  const g = guildStars && stars > G_RANK_STAR_OFFSET;
  return g ? { g: true, stars: stars - G_RANK_STAR_OFFSET } : { g: false, stars };
}

/** The star levels a hub's quests span, lowest first. */
export function questStarLevels(quests: Pick<Quest, "stars">[]): number[] {
  return [...new Set(quests.map((q) => q.stars))].sort((a, b) => a - b);
}

/** Quests a monster appears in as a large monster or the target, by hub order, stars and ID. */
export function questsWithMonster(quests: Quest[], name: string): Quest[] {
  const hubOrder = (q: Quest) => QUEST_HUB_SLUGS.indexOf(q.hub);
  return quests
    .filter((q) => q.target?.monster.name === name || q.largeMonsters.some((m) => m.name === name))
    .sort((a, b) => hubOrder(a) - hubOrder(b) || a.stars - b.stars || a.id - b.id);
}

/** One star level of a quest board, with the quests that hold the most of a small monster. */
export interface SmallMonsterStage {
  hub: QuestHubSlug;
  stars: number;
  /** The quests with the most (all of them on a tie), each with its total. */
  best: { quest: Quest; total: number }[];
  /** Quests where it keeps spawning (not counted in the totals), when any. */
  endless: Quest[];
}

/** The boards that are stages of the game, where `smallMonsterStages` looks. */
const STAGE_HUBS: ReadonlySet<QuestHubSlug> = new Set([
  "village",
  "low-rank",
  "high-rank",
  "g-rank",
]);

/**
 * Where a small monster is most plentiful: for each star level of the village
 * and guild boards (`STAGE_HUBS`), the quests with the biggest total of it (every distinct
 * spawn table counted once), in board and star order. Star levels without it
 * are left out; Training School, Treasure Hunting and the downloaded quests
 * are not stages of the game.
 */
export function smallMonsterStages(quests: Quest[], name: string): SmallMonsterStage[] {
  const stages = new Map<string, SmallMonsterStage>();
  for (const quest of quests) {
    if (isHiddenQuest(quest.id) || !STAGE_HUBS.has(quest.hub)) continue;
    const at = quest.smallMonsters.findIndex((m) => m.name === name);
    const spawn = quest.smallSpawns[at];
    if (!spawn) continue;
    const key = `${quest.hub}:${quest.stars}`;
    let stage = stages.get(key);
    if (!stage) {
      stage = { hub: quest.hub, stars: quest.stars, best: [], endless: [] };
      stages.set(key, stage);
    }
    if (spawn.endless) stage.endless.push(quest);
    if (spawn.total === 0) continue;
    const top = stage.best[0]?.total ?? 0;
    if (spawn.total > top) stage.best = [{ quest, total: spawn.total }];
    else if (spawn.total === top) stage.best.push({ quest, total: spawn.total });
  }
  const hubOrder = (s: SmallMonsterStage) => QUEST_HUB_SLUGS.indexOf(s.hub);
  return [...stages.values()]
    .filter((s) => s.best.length > 0 || s.endless.length > 0)
    .sort((a, b) => hubOrder(a) - hubOrder(b) || a.stars - b.stars);
}

/**
 * IDs of the quests the loaded hunter has cleared, or null without a hunter
 * (or with one stored before cleared quests were read from saves).
 */
export function clearedQuestIds(
  save: { clearedQuests?: readonly number[] } | null,
): ReadonlySet<number> | null {
  return save?.clearedQuests ? new Set(save.clearedQuests) : null;
}

export function questHref(q: Pick<Quest, "hub" | "id">): string {
  return `/quests/${q.hub}/${q.id}/`;
}

/**
 * Heading for a reward table, as the data supports it: main and extra tables
 * by name, with their draw count; conditional tables say their condition is
 * unknown (the raw value is kept for reference).
 */
export function rewardTableHeading(t: QuestRewardTable): {
  title: string;
  count?: number;
  note?: string;
} {
  switch (t.kind) {
    case "main":
      return { title: "Main reward", count: t.draws || undefined };
    case "extra":
      return { title: "Extra reward", count: t.draws || undefined };
    case "conditional":
      return {
        title: "Conditional reward",
        note: t.condition === null ? undefined : `condition ${t.condition}`,
      };
  }
}

/** A crown a quest gives a monster the best chance of, and that chance. */
export interface BestCrown {
  crown: Crown;
  chance: number;
}

/**
 * For each crown, the quests that give a monster the best chance of it
 * (every quest tied at that chance), by quest ID. Crowns no quest can give
 * are left out; crowns are listed gold, silver, mini.
 */
export function bestCrownQuests(
  quests: readonly Quest[],
  monster: string,
): Map<number, BestCrown[]> {
  const out = new Map<number, BestCrown[]>();
  // Each quest's chances for this monster, looked up once.
  const rows = quests.flatMap((quest) => {
    const chances = quest.monsterSize?.crowns.find((c) => c.monster.name === monster);
    return chances ? [{ id: quest.id, chances }] : [];
  });
  for (const crown of CROWN_ORDER) {
    const best = Math.max(0, ...rows.map((r) => r.chances[crown]));
    if (best === 0) continue;
    for (const { id, chances } of rows)
      if (chances[crown] === best) {
        const list = out.get(id) ?? [];
        list.push({ crown, chance: best });
        out.set(id, list);
      }
  }
  return out;
}
