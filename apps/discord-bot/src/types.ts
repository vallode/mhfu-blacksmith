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
  /** Its page's large card (hitzones, status, crowns, quest stars), a path on the site. */
  card?: string;
  /** Its portrait on the scroll, a path on the site. */
  icon?: string;
  /** Its drops card at each rank it has a drop table for, in rank order. */
  dropRanks: { rank: string; label: string; card: string }[];
  /** The quests it's hunted in, by board and star level. */
  quests: MonsterQuest[];
}

export interface MonsterQuest {
  /** "Village", "Guild LR", "Guild HR", "Guild G", "Training School" */
  board: string;
  /** "★5", "G★2" */
  stars: string;
  title: string;
  /** Its page, a path on the site. */
  path: string;
}

export interface ItemEntry {
  id: number;
  name: string;
  aliases: string[];
  rarity?: number;
  price?: number;
  slug: string;
  /** Its icon, tinted, on the site (blacksmith's itemEmbedIcon): `/embed/icons/…png`. */
  icon?: string;
  /** The embed's colour: the site's rarity colour, from rarity 4. */
  color?: number;
  /** The monsters that drop it, best chance first (at most ITEM_SOURCES). */
  drops: ItemDrop[];
  /** How many monsters (at a set of ranks) drop it in all. */
  dropCount: number;
  /** The best quest rewards for it, highest chance first (at most ITEM_SOURCES). */
  rewards: ItemReward[];
  /** How many quest reward tables give it in all. */
  rewardCount: number;
  /** Its card (sources at a glance), a path on the site. */
  card?: string;
}

/** How many of an item's drops and rewards the index keeps. */
export const ITEM_SOURCES = 3;

/** One monster's drops of an item, at the ranks those drops share. */
export interface ItemDrop {
  monster: string;
  /** Short drop table ranks: "LR ★1-2", "LR, HR", "G". */
  ranks: string;
  /** How it drops there, highest chance first. */
  ways: ItemDropWay[];
}

export interface ItemDropWay {
  /** "Body carves", "Break head", "Capture". */
  how: string;
  /** Percent per attempt. */
  chance: number;
  /** How many each success gives, when more than one. */
  quantity?: number;
}

export interface ItemReward {
  /** The quest's title. */
  quest: string;
  /** "Guild G★3", "Guild LR ★5", "Village ★5". */
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
  /** Its card, a path on the site. */
  card?: string;
  /** Its framed icon in its rarity's colour, a path on the site. */
  icon?: string;
  /** The embed's colour: the site's rarity colour, from rarity 4. */
  color?: number;
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
