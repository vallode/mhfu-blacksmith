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
  /** The Japanese name, from the disc. */
  jp?: string;
  rarity?: number;
  price?: number;
  slug: string;
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
}

export interface BotIndex {
  monsters: MonsterEntry[];
  items: ItemEntry[];
  weapons: WeaponEntry[];
  /** Every positive activation the set builder takes, in skills.json's order. */
  skills: SkillEntry[];
  armor: ArmorEntry[];
}
