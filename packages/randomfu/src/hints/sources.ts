/**
 * What the bookshelf guides say about the seed, read back from the edited
 * files after every shuffle: where monsters appear, what they drop, which
 * items recipes use, and how the guides name tiers and maps.
 */
import { MAP_NAMES } from "mhfu-extract/src/tables/quest-maps.js";
import type { ParsedQuest } from "mhfu-extract/src/quests/parser.js";
import type { Edits } from "../edits.js";
import type { GameData } from "../game/load.js";
import { BANDS, questTier, rewardRankBand, type Band, type Tier } from "../game/tiers.js";
import { collectRewardLists } from "../shuffles/monster-rewards.js";
import { collectRecipeSlots } from "../shuffles/recipes.js";

const BAND_SHORT: Record<Band, string> = { low: "LR", high: "HR", g: "G" };

/** G Rank quests are stored at 9-11 stars; the game shows them as G★1-G★3. */
const G_STAR_OFFSET = 8;

/** A tier as the game shows it: "LR★3", "HR★7", "G★1". */
export const tierShort = (tier: Tier) =>
  `${BAND_SHORT[tier.band]}★${tier.band === "g" ? Math.max(1, tier.stars - G_STAR_OFFSET) : tier.stars}`;

/** Map names without the day/night variant, shortened to fit a line. */
const SHORT_MAPS: Record<string, string> = {
  "Forest and Hills": "Forest",
  "Snowy Mountains": "Snowy Mtns",
  "Snowy Mountains Peak": "Snowy Peak",
  "Arena (Large)": "Arena",
  "Arena (Small)": "Arena",
};

export function mapLabel(map: number): string {
  const name = (MAP_NAMES[map] ?? `Map ${map}`).replace(/ \((Day|Night)\)$/, "");
  return SHORT_MAPS[name] ?? name;
}

/** A monster reward list's source as the guides name it: "carve", "tail", "capture" ... */
export function rewardKind(source: string): string {
  if (source === "body") return "carve";
  if (source.startsWith("break")) return "break";
  return source;
}

export interface MonsterDrop {
  emId: number;
  /** "carve", "tail", "shiny", "capture" or "break". */
  how: string;
  band: Band;
  itemId: number;
  chance: number;
}

/**
 * Every carve, tail, shiny, capture and break entry of the Low, High and G
 * Rank reward lists, with the item `game_sub.ovl` now holds there.
 */
export function readMonsterDrops(game: GameData, edits: Edits): MonsterDrop[] {
  const sub = edits.dataFileNow(game.gameSub.index);
  const out: MonsterDrop[] = [];
  for (const list of collectRewardLists(game.gameSub.ovl)) {
    const items = list.entries.map((entry, i) => ({
      itemId: sub.readUInt16LE(list.offset + i * list.stride + 2),
      chance: entry.chance,
    }));
    for (const ref of list.refs) {
      const band = rewardRankBand(ref.rank);
      if (!band) continue;
      for (const { itemId, chance } of items) {
        if (itemId !== 0)
          out.push({ emId: ref.emId, how: rewardKind(ref.source), band, itemId, chance });
      }
    }
  }
  return out;
}

/**
 * Each monster's earliest tier per rank as a large monster in quests the
 * player can take (`questTier`), earliest rank first.
 */
export function largeAppearances(quests: readonly ParsedQuest[]): Map<number, Tier[]> {
  const best = new Map<number, Map<Band, number>>();
  for (const quest of quests) {
    const tier = questTier(quest);
    if (!tier) continue;
    for (const m of quest.largeMonsters) {
      const bands = best.get(m.monsterId) ?? new Map<Band, number>();
      const current = bands.get(tier.band);
      if (current === undefined || tier.stars < current) bands.set(tier.band, tier.stars);
      best.set(m.monsterId, bands);
    }
  }
  return new Map(
    [...best].map(([emId, bands]) => [
      emId,
      BANDS.filter((b) => bands.has(b)).map((band) => ({ band, stars: bands.get(band)! })),
    ]),
  );
}

/**
 * Every item a crafting or upgrade recipe now uses, from the EBOOT as the
 * shuffles left it; null if the EBOOT wasn't loaded.
 */
export function recipeMaterials(game: GameData, edits: Edits): Set<number> | null {
  const eboot = edits.changedEboot() ?? game.eboot;
  if (!eboot) return null;
  return new Set(collectRecipeSlots(eboot, game.resolver).map((slot) => slot.itemId));
}
