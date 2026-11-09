/**
 * Rank bands: Low, High and G Rank. Shuffles only move items within a band,
 * which is what keeps every recipe craftable at the rank it was before.
 */
import { isPlaceholderQuest, questHub } from "../../../mhfu-extract/src/emit/quests.js";
import type { ParsedQuest } from "../../../mhfu-extract/src/quests/parser.js";
import type { RewardRank } from "../../../mhfu-extract/src/monsters/rewards.js";

export const BANDS = ["low", "high", "g"] as const;
export type Band = (typeof BANDS)[number];

export const BAND_NAMES: Record<Band, string> = { low: "Low Rank", high: "High Rank", g: "G Rank" };

export function bandOrder(band: Band): number {
  return BANDS.indexOf(band);
}

/** `questHeader.Rank` -> band (see `RANK_TIER` in mhfu-extract's emit/quests.ts). */
const HEADER_RANK_BAND: Record<number, Band> = { 1: "low", 2: "high", 5: "g" };

/** Quest IDs at or above this are the 90 unused "Gathering - Snowy Mountains" copies. */
const UNUSED_GATHERING_QUESTS = 30001;

/**
 * The band of a quest a player can take, or null for quests the randomizer
 * leaves alone: Training School and Treasure Hunting quests, unused slots
 * and the unused gathering copies. Items are never moved into these, since a
 * player may never be able to get them there.
 */
export function questBand(quest: ParsedQuest): Band | null {
  const id = quest.header.questId;
  const hub = questHub(id);
  if (hub !== "guild" && hub !== "village") return null;
  if (id >= UNUSED_GATHERING_QUESTS || isPlaceholderQuest(quest)) return null;
  // Rank 0: the Guild's 1-2 star quests and the Village's two Tigrex quests.
  return HEADER_RANK_BAND[quest.header.rank] ?? (quest.header.rank === 0 ? "low" : null);
}

/** A monster reward list's rank slot -> band. Treasure, training and the rest aren't shuffled. */
export function rewardRankBand(rank: RewardRank): Band | null {
  if (rank === "low" || rank === "high" || rank === "g") return rank;
  return null;
}

/** Each item's lowest band among `sources`: the earliest rank it can be found at. */
export function itemBands(sources: Iterable<{ itemId: number; band: Band }>): Map<number, Band> {
  const bands = new Map<number, Band>();
  for (const { itemId, band } of sources) {
    const current = bands.get(itemId);
    if (current === undefined || bandOrder(band) < bandOrder(current)) bands.set(itemId, band);
  }
  return bands;
}

/** `emId:band` for every monster that appears in a quest the player can take. */
export function reachableMonsters(quests: readonly ParsedQuest[]): Set<string> {
  const out = new Set<string>();
  for (const quest of quests) {
    const band = questBand(quest);
    if (!band) continue;
    for (const m of quest.largeMonsters) out.add(monsterKey(m.monsterId, band));
    for (const table of quest.smallMonsters) {
      for (const m of table.monsters) out.add(monsterKey(m.monsterId, band));
    }
  }
  return out;
}

export function monsterKey(emId: number, band: Band): string {
  return `${emId}:${band}`;
}
