/**
 * Earliest quest progress at which gear can be made, derived from the recipe
 * graph rather than hand-entered rank data.
 *
 * Every item gets the earliest quest it can come from: a quest reward table, or
 * a carve/break/capture drop of a monster whose first appearance at that rank
 * is that quest. A recipe needs the *latest* of its materials, and a weapon
 * upgraded from a tree parent also needs the parent. A weapon with several
 * routes (create, upgrade, alternative create) is available at the earliest.
 *
 * Progress is one ladder, the guild's (rank, then stars). Village quests are
 * counted as low rank at their own star count. Materials no quest or monster
 * drops (mining, shops, events, tickets) don't gate anything, but are reported
 * as `unsourced` so the output can be audited.
 */

import { G_RANK_STAR_OFFSET } from "./quests";

export const GUILD_RANKS = ["low-rank", "high-rank", "g-rank"] as const;
export type GuildRank = (typeof GUILD_RANKS)[number];

/** A point on the ladder. Ordered by rank, then stars. */
export interface Tier {
  rank: GuildRank;
  stars: number;
}

/** A tier, or null when no route exists. */
export type Progress = Tier | null;

export interface QuestLike {
  id?: number;
  hub: string;
  rank: string | null;
  stars: number;
  /** Quest that must be cleared before this one appears. */
  requires?: number | null;
  large_monsters: { monster: string }[];
  reward_tables: { items: { item: string }[] }[];
}

export interface MonsterLike {
  name: string;
  /** Drop tables by rank heading ("low rank", "high-rank", "1-2 star", ...). */
  drops?: Record<string, Record<string, { name: string }[]>>;
}

export interface RecipeLike {
  name: string;
  /** Material category from the recipe data ("ore", "insect", "claw", ...). */
  type?: string;
}

/**
 * Categories that are gathered in the field rather than earned. Quest rewards and
 * monster drops list some of them, but they're available from the first quest, so
 * those aren't their gate. Gathering tiers aren't in the data, so these count as
 * ungated and show up as `unsourced`. Ores are the exception: they're gated by the
 * rank they can be mined at, see `GATHER_TIERS`.
 */
export const GATHERED_TYPES: ReadonlySet<string> = new Set([
  "insect",
  "fish",
  "herb",
  "mushroom",
  "seed",
  "bait",
]);

export interface WeaponLike {
  name: string;
  improve_from?: string | string[] | null;
  create_mats?: RecipeLike[] | null;
  improve_mats?: RecipeLike[] | null;
  alternative_create_mats?: RecipeLike[] | null;
}

/**
 * The rank an ore can first be mined at, by item name. Ore armor repeats its
 * materials from low to high rank (Hi-Metal vs Chain), so without this the
 * recipe graph can't tell the ranks apart. Hand-entered, not in the game data:
 * checked against the armor ranks in data/armor, but worth confirming in game.
 * Ores left out (Firestone, Antiseptic Stone, ...) are ungated, which hides
 * too little rather than too much.
 */
export const GATHER_TIERS: Readonly<Record<string, Tier>> = (() => {
  const at = (rank: GuildRank, names: string[]) =>
    names.map((name) => [name, { rank, stars: 0 }] as const);
  return Object.fromEntries([
    ...at("low-rank", [
      "Iron Ore",
      "Machalite Ore",
      "Dragonite Ore",
      "Disk Stone",
      "Earth Crystal",
      "Lightcrystal",
      "Ice Crystal",
    ]),
    ...at("high-rank", [
      "Carbalite Ore",
      "Union Ore",
      "Nova Crystal",
      "Novacrystal",
      "Eltalite Ore",
      "Etherlite Ore",
      "Firecell Stone",
      "Rainbow Ore",
    ]),
    ...at("g-rank", ["Pure Crystal", "Purecrystal", "PureCrystal", "Mellanje Ore", "Melange Ore"]),
  ]);
})();

export type ItemKey = (name: string) => string | undefined;

export function compareTiers(a: Tier, b: Tier): number {
  return GUILD_RANKS.indexOf(a.rank) - GUILD_RANKS.indexOf(b.rank) || a.stars - b.stars;
}

/**
 * The guild stars each rank's quests span, from the quest data. The ranks
 * overlap at their ends: ★6 has both low and high rank quests, ★9 both high and
 * G-rank.
 */
const STAR_SPANS: Record<GuildRank, [number, number]> = {
  "low-rank": [1, 6],
  "high-rank": [6, 9],
  "g-rank": [9, 11],
};

/** Every tier a hunter can be at, earliest first: what a rank selector offers. */
export const STAGES: readonly Tier[] = GUILD_RANKS.flatMap((rank) => {
  const [first, last] = STAR_SPANS[rank];
  return Array.from({ length: last - first + 1 }, (_, i) => ({ rank, stars: first + i }));
});

const RANK_NAMES: Record<GuildRank, string> = {
  "low-rank": "Low Rank",
  "high-rank": "High Rank",
  "g-rank": "G-Rank",
};

export const rankName = (rank: GuildRank): string => RANK_NAMES[rank];

/** The stars the game shows for a tier: G Rank's ★9-★11 are the game's G★1-G★3. */
export const tierStars = (t: Tier): number =>
  t.rank === "g-rank" ? t.stars - G_RANK_STAR_OFFSET : t.stars;

/**
 * "High Rank ★7", in English (scripts, tests). Pages show the translated
 * form, `t.equipment.tierLabel(tier)`.
 */
export const tierLabel = (t: Tier): string => `${RANK_NAMES[t.rank]} ★${tierStars(t)}`;

/** Is this one of the offered stages? Guards values read back from storage. */
export function isStage(value: unknown): value is Tier {
  const t = value as Partial<Tier> | null;
  return !!t && STAGES.some((s) => s.rank === t.rank && s.stars === t.stars);
}

/**
 * Can a hunter who has reached `progress` make gear needing `needs`? No
 * progress (null) means no filter: everything is available. Gear with no known
 * route (undefined) is never hidden, since we can't say it's out of reach.
 */
export function isAvailable(needs: Tier | undefined, progress: Tier | null): boolean {
  if (!progress || !needs) return true;
  return compareTiers(needs, progress) <= 0;
}

/** Nothing is needed: the starting point. */
export const START: Tier = { rank: "low-rank", stars: 0 };

/** Everything must be done: the latest point, null if either is unreachable. */
export function both(a: Progress, b: Progress): Progress {
  if (!a || !b) return null;
  return compareTiers(a, b) >= 0 ? a : b;
}

/** Either will do: the earliest point. */
export function either(a: Progress, b: Progress): Progress {
  if (!a) return b;
  if (!b) return a;
  return compareTiers(a, b) <= 0 ? a : b;
}

/**
 * Quest progress: village and guild quests are their rank tier at their own
 * stars (a village quest without one counts as low rank); other hubs don't gate.
 */
function questTier(q: QuestLike): Tier | null {
  const ranked = GUILD_RANKS.includes(q.rank as GuildRank);
  if (q.hub === "village")
    return { rank: ranked ? (q.rank as GuildRank) : "low-rank", stars: q.stars };
  if (q.hub === "guild" && ranked) return { rank: q.rank as GuildRank, stars: q.stars };
  return null;
}

/**
 * A quest's tier, but no earlier than the quest it requires: Guild ★2
 * "Attack of the Rathian" only appears after Village ★3 "Shadow in the Snow".
 */
function gatedQuestTier(
  q: QuestLike,
  byId: ReadonlyMap<number, QuestLike>,
  seen: Set<QuestLike> = new Set(),
): Tier | null {
  const tier = questTier(q);
  const prereq = q.requires == null ? undefined : byId.get(q.requires);
  if (!tier || !prereq || seen.has(prereq)) return tier;
  seen.add(q);
  const needs = gatedQuestTier(prereq, byId, seen);
  return needs ? both(tier, needs) : tier;
}

/** "low rank", "high-rank", "g rank" -> the rank. "1-2 star..." is the first low-rank stars. */
export function dropRank(heading: string): GuildRank | null {
  const h = heading.toLowerCase().replace(/-/g, " ");
  if (h.startsWith("low rank") || /^\d+ \d+ star/.test(h) || h.startsWith("1 2 star"))
    return "low-rank";
  if (h.startsWith("high rank")) return "high-rank";
  if (h.startsWith("g rank")) return "g-rank";
  return null;
}

/** Earliest tier per item key from quest rewards and monster drops. */
export function earliestSources(
  quests: QuestLike[],
  monsters: MonsterLike[],
  key: ItemKey,
  gathered: ReadonlySet<string> = new Set(),
  gatherTiers: Readonly<Record<string, Tier>> = GATHER_TIERS,
): Map<string, Tier> {
  const out = new Map<string, Tier>();
  const add = (name: string, tier: Tier) => {
    const k = key(name);
    if (k === undefined || gathered.has(k)) return;
    out.set(k, either(out.get(k) ?? null, tier)!);
  };

  // First quest each large monster appears in, per rank.
  const byId = new Map<number, QuestLike>();
  for (const q of quests) if (q.id !== undefined) byId.set(q.id, q);
  const firstSeen = new Map<string, Tier>();
  for (const q of quests) {
    const tier = gatedQuestTier(q, byId);
    if (!tier) continue;
    for (const table of q.reward_tables) for (const { item } of table.items) add(item, tier);
    for (const { monster } of q.large_monsters) {
      const k = `${monster}|${tier.rank}`;
      firstSeen.set(k, either(firstSeen.get(k) ?? null, tier)!);
    }
  }

  for (const m of monsters)
    for (const [heading, tables] of Object.entries(m.drops ?? {})) {
      const rank = dropRank(heading);
      const tier = rank && firstSeen.get(`${m.name}|${rank}`);
      if (!tier) continue;
      for (const drops of Object.values(tables)) for (const d of drops) add(d.name, tier);
    }

  // Gathered items are gated by where they can be mined, not by quests.
  for (const [name, tier] of Object.entries(gatherTiers)) {
    const k = key(name);
    if (k !== undefined) out.set(k, tier);
  }
  return out;
}

/** Progress a recipe needs. `unsourced` collects materials nothing drops. */
export function recipeProgress(
  mats: RecipeLike[] | null | undefined,
  sources: Map<string, Tier>,
  key: ItemKey,
  unsourced?: Set<string>,
): Progress {
  let acc: Progress = START;
  for (const m of mats ?? []) {
    const k = key(m.name);
    const src = k === undefined ? undefined : sources.get(k);
    if (!src) {
      unsourced?.add(m.name);
      continue;
    }
    acc = both(acc, src);
  }
  return acc;
}

/** Key for a weapon in the maps below: names are only unique within a type. */
export const weaponKey = (type: string, name: string) => `${type}/${name}`;

/**
 * Progress for every weapon across all types, keyed by `weaponKey`. Upgrade
 * parents may live in another type's tree (a Sword and Shield upgrading into
 * Dual Blades), so the whole graph is solved together: a parent is looked up in
 * the same type first, then by name across the others. A weapon with no route
 * at all, e.g. a parent missing from the data, is null.
 */
export function weaponProgress(
  weapons: (WeaponLike & { type: string })[],
  sources: Map<string, Tier>,
  key: ItemKey,
  unsourced?: Set<string>,
): Map<string, Progress> {
  const byKey = new Map(weapons.map((w) => [weaponKey(w.type, w.name), w]));
  const byName = new Map<string, string[]>();
  for (const w of weapons) {
    const list = byName.get(w.name) ?? [];
    list.push(weaponKey(w.type, w.name));
    byName.set(w.name, list);
  }
  const findParent = (type: string, name: string): string | undefined => {
    const same = weaponKey(type, name);
    if (byKey.has(same)) return same;
    const others = byName.get(name);
    return others?.length === 1 ? others[0] : undefined;
  };

  const memo = new Map<string, Progress>();
  const visiting = new Set<string>();

  const solve = (id: string): Progress => {
    if (memo.has(id)) return memo.get(id)!;
    const w = byKey.get(id);
    if (!w || visiting.has(id)) return null;
    visiting.add(id);

    let best: Progress = null;
    const hasCreate = !!w.create_mats?.length;
    const hasAlt = !!w.alternative_create_mats?.length;
    if (hasCreate) best = either(best, recipeProgress(w.create_mats, sources, key, unsourced));
    if (hasAlt)
      best = either(best, recipeProgress(w.alternative_create_mats, sources, key, unsourced));

    const parents = [w.improve_from ?? []].flat();
    if (parents.length) {
      const mats = recipeProgress(w.improve_mats, sources, key, unsourced);
      for (const name of parents) {
        const parent = findParent(w.type, name);
        best = either(best, parent ? both(solve(parent), mats) : null);
      }
    }
    // A root with no recorded recipe is available from the start.
    if (!hasCreate && !hasAlt && !parents.length) best = START;

    visiting.delete(id);
    memo.set(id, best);
    return best;
  };

  for (const id of byKey.keys()) solve(id);
  return memo;
}
