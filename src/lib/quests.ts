/**
 * Quests: hub constants, the compact quests.json bundle shape written by
 * scripts/generate-data.ts, and its decoder. Pure (no fs), so it's shared by
 * the generator, the pages and the client.
 */

/** A quest board: Village, the three Guild ranks, Training School, Treasure Hunting. */
export const QUEST_HUBS = [
  { slug: "village", label: "Village", hub: "village", rank: null },
  { slug: "low-rank", label: "Guild Low Rank", hub: "guild", rank: "low-rank" },
  { slug: "high-rank", label: "Guild High Rank", hub: "guild", rank: "high-rank" },
  { slug: "g-rank", label: "Guild G Rank", hub: "guild", rank: "g-rank" },
  { slug: "training-school", label: "Training School", hub: "training-school", rank: null },
  { slug: "treasure-hunting", label: "Treasure Hunting", hub: "treasure-hunting", rank: null },
] as const;

export type QuestHubSlug = (typeof QUEST_HUBS)[number]["slug"];
export const QUEST_HUB_SLUGS: readonly QuestHubSlug[] = QUEST_HUBS.map((h) => h.slug);

/** The hub page a data/quests record belongs on, from its `hub` and `rank`. */
export function questHubSlug(hub: string, rank: string | null): QuestHubSlug | null {
  const match = QUEST_HUBS.find((h) => h.hub === hub && (h.rank === null || h.rank === rank));
  return match?.slug ?? null;
}

export function questHubLabel(slug: string): string {
  return QUEST_HUBS.find((h) => h.slug === slug)?.label ?? slug;
}

/**
 * Quest monster names come from the disc; these are the site's names for the
 * two that differ.
 */
export const QUEST_MONSTER_ALIASES: Record<string, string> = {
  "One-Ear Yian Garuga": "Scarred Yian Garuga",
  "Terra Shogun Ceanatur": "Terra Shogun Ceanataur",
};

/** Small-monster spawns that aren't monsters: Treasure Hunting's breakable rocks. */
export const QUEST_NON_MONSTERS: ReadonlySet<string> = new Set(["Rocks"]);

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
  stars: number;
  map: string | null;
  fee: number;
  reward: number;
  timeLimit: number;
  target: { monster: QuestMonster; amount: number } | null;
  largeMonsters: QuestMonster[];
  smallMonsters: QuestMonster[];
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
}

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
    ([id, hub, stars, map, fee, reward, timeLimit, tg, lm, sm, su, rw, n, g, x, d, c, rq, ur]) => ({
      id,
      hub: QUEST_HUBS[hub]?.slug ?? "village",
      stars,
      map: str(map),
      fee,
      reward,
      timeLimit,
      target: tg ? { monster: monsters[tg[0]]!, amount: tg[1] } : null,
      largeMonsters: lm.map((i) => monsters[i]!),
      smallMonsters: sm.map((i) => monsters[i]!),
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
    }),
  );
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

/** A star level as the game writes it: one ★ per star (3 -> "★★★"). */
export function starMarks(stars: number): string {
  return "★".repeat(Math.max(0, stars));
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
