/**
 * The bot's search index: what its commands show and match names against,
 * cut down from data/ by scripts/index-data.ts. The Worker bundles it as
 * JSON, so it holds only what a reply or a match needs; the rest is a link
 * to the site's page away.
 */

export type ArmorSlot = "helmet" | "plate" | "gauntlets" | "waist" | "leggings";
export type ArmorRank = "low-rank" | "high-rank" | "g-rank";
export type HunterType = "Blademaster" | "Gunner";

export interface MonsterEntry {
  /** The game's `emID`. */
  id: number;
  name: string;
  /** Other spellings: the data's own, then the community's nicknames (nicknames.ts). */
  aliases: string[];
  /** data/monsters/<category>.json, and the page's path segment. */
  category: string;
  slug: string;
  small: boolean;
  hp?: number;
  /** Elements its hitzones take best, best first (at most two). */
  weak: string[];
  /** Parts that break. */
  breaks: string[];
  description?: string;
  crowns?: { mini: number; silver: number; gold: number };
}

export interface ItemEntry {
  id: number;
  name: string;
  aliases: string[];
  rarity?: number;
  price?: number;
  slug: string;
  /** The best monster drops for it, highest chance first (at most ITEM_SOURCES). */
  drops: ItemDrop[];
  /** How many monster drops give it in all. */
  dropCount: number;
  /** The best quest rewards for it, highest chance first (at most ITEM_SOURCES). */
  rewards: ItemReward[];
  /** How many quest reward tables give it in all. */
  rewardCount: number;
}

/** How many of an item's drops and rewards the index keeps. */
export const ITEM_SOURCES = 5;

export interface ItemDrop {
  monster: string;
  /** "Low Rank", "G Rank", "1-2 Star" (the drop table's rank). */
  rank: string;
  /** "Body carves ×3", "Break head", "Capture". */
  how: string;
  /** Percent per attempt. */
  chance: number;
  /** How many each success gives, when more than one. */
  quantity?: number;
}

export interface ItemReward {
  /** The quest's title. */
  quest: string;
  /** "Guild G Rank ★3", "Village ★5". */
  where: string;
  /** Percent per draw. */
  chance: number;
  /** How many each draw gives, when more than one. */
  amount?: number;
}

export interface WeaponEntry {
  /** data/weapons/<type>.json, and the page's path segment ("long-sword"). */
  type: string;
  name: string;
  slug: string;
  attack?: number;
  affinity?: string;
  slots?: number;
  rarity?: number;
  /** "Thunder 180", "Poison 200" */
  elements: string[];
}

export interface SkillEntry {
  /** The activation's name ("Evade +2"). */
  name: string;
  tree: string;
  points: number;
  /** The tree's other spellings in data/ ("Defence"). */
  aliases: string[];
}

export interface ArmorEntry {
  slot: ArmorSlot;
  rank: ArmorRank;
  name: string;
  slug: string;
  hunterType: HunterType | "Both";
  sex: "Male" | "Female" | "Both";
}

export interface BotIndex {
  monsters: MonsterEntry[];
  items: ItemEntry[];
  weapons: WeaponEntry[];
  /** Every positive activation the set builder takes, in skills.json's order. */
  skills: SkillEntry[];
  armor: ArmorEntry[];
}
