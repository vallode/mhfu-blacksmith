/**
 * Tiers: a rank (Low, High or G) and a star level. Shuffles only move items
 * within a tier, which keeps every recipe craftable at the star level it
 * was before.
 *
 * Village and Guild quests share one star scale: Village 3★ and Guild 3★
 * are the same tier. They don't line up exactly in difficulty, so an item
 * first found at Guild 3★ can turn up in a recipe that used a Village 3★
 * item.
 */
import { isPlaceholderQuest, questHub } from "mhfu-extract/src/emit/quests.js";
import type { ParsedQuest } from "mhfu-extract/src/quests/parser.js";
import type { RewardRank } from "mhfu-extract/src/monsters/rewards.js";

export const BANDS = ["low", "high", "g"] as const;
export type Band = (typeof BANDS)[number];

export const BAND_NAMES: Record<Band, string> = { low: "Low Rank", high: "High Rank", g: "G Rank" };

export interface Tier {
  band: Band;
  stars: number;
}

/** How strictly shuffles keep items in place: see the `logic.tiers` setting. */
export type TierMode = "star" | "rank" | "none";

/** The tier shuffles group by under `mode`: star level, rank only, or one pool. */
export function coarsen(tier: Tier, mode: TierMode): Tier {
  if (mode === "rank") return { band: tier.band, stars: 0 };
  if (mode === "none") return { band: "low", stars: 0 };
  return tier;
}

export function tierKey(tier: Tier): string {
  return `${tier.band}:${tier.stars}`;
}

/** Sorts tiers from earliest to latest. */
export function tierOrder(tier: Tier): number {
  return BANDS.indexOf(tier.band) * 100 + tier.stars;
}

export function tierLabel(tier: Tier): string {
  return tier.stars === 0 ? BAND_NAMES[tier.band] : `${BAND_NAMES[tier.band]} ${tier.stars}★`;
}

/** `questHeader.Rank` -> band (see `RANK_TIER` in mhfu-extract's emit/quests.ts). */
const HEADER_RANK_BAND: Record<number, Band> = { 1: "low", 2: "high", 5: "g" };

/** Quest IDs at or above this are the 90 unused "Gathering - Snowy Mountains" copies. */
const UNUSED_GATHERING_QUESTS = 30001;

/**
 * The tier of a quest a player can take, or null for quests the randomizer
 * leaves alone: Training School and Treasure Hunting quests, unused slots
 * and the unused gathering copies. Items are never moved into these, and
 * they don't count as sources, since a player may never be able to get
 * things there.
 */
export function questTier(quest: ParsedQuest): Tier | null {
  const id = quest.header.questId;
  const hub = questHub(id);
  if (hub !== "guild" && hub !== "village") return null;
  if (id >= UNUSED_GATHERING_QUESTS || isPlaceholderQuest(quest)) return null;
  // Rank 0: the Guild's 1-2 star quests and the Village's two Tigrex quests.
  const band = HEADER_RANK_BAND[quest.header.rank] ?? (quest.header.rank === 0 ? "low" : null);
  if (!band) return null;
  return { band, stars: Math.max(1, quest.header.questStars) };
}

/** A monster reward list's rank slot -> band. Treasure, training and the rest aren't shuffled. */
export function rewardRankBand(rank: RewardRank): Band | null {
  if (rank === "low" || rank === "high" || rank === "g") return rank;
  return null;
}

/** Each item's earliest tier among `sources`. */
export function itemTiers(sources: Iterable<{ itemId: number; tier: Tier }>): Map<number, Tier> {
  const tiers = new Map<number, Tier>();
  for (const { itemId, tier } of sources) {
    const current = tiers.get(itemId);
    if (current === undefined || tierOrder(tier) < tierOrder(current)) tiers.set(itemId, tier);
  }
  return tiers;
}

export function monsterKey(emId: number, band: Band): string {
  return `${emId}:${band}`;
}

/**
 * The lowest star level at which each monster appears in a quest the player
 * can take, per band (`monsterKey`). Large and small monsters both count.
 */
export function monsterStars(quests: readonly ParsedQuest[]): Map<string, number> {
  const out = new Map<string, number>();
  const add = (emId: number, tier: Tier): void => {
    const key = monsterKey(emId, tier.band);
    const current = out.get(key);
    if (current === undefined || tier.stars < current) out.set(key, tier.stars);
  };
  for (const quest of quests) {
    const tier = questTier(quest);
    if (!tier) continue;
    for (const m of quest.largeMonsters) add(m.monsterId, tier);
    for (const table of quest.smallMonsters) {
      for (const m of table.monsters) add(m.monsterId, tier);
    }
  }
  return out;
}
