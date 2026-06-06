export const WEAPON_TYPES = [
  "great-sword",
  "long-sword",
  "sword-and-shield",
  "dual-blades",
  "hammer",
  "hunting-horn",
  "lance",
  "gunlance",
  "light-bowgun",
  "heavy-bowgun",
  "bow",
] as const;

export const ARMOR_SLOTS = [
  "helmet",
  "plate",
  "gauntlets",
  "waist",
  "leggings",
] as const;

export const ARMOR_RANKS = ["low-rank", "high-rank", "g-rank"] as const;

export const MONSTER_CATEGORIES = [
  "lynian",
  "neopteron",
  "herbivore",
  "bird-wyvern",
  "flying-wyvern",
  "piscine-wyvern",
  "carapaceon",
  "pelagus",
  "elder-dragon",
] as const;

export type WeaponType = (typeof WEAPON_TYPES)[number];
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];
export type ArmorRank = (typeof ARMOR_RANKS)[number];
export type MonsterCategory = (typeof MONSTER_CATEGORIES)[number];

export const WEAPON_CLASS_MULTIPLIER: Record<string, number> = {
  "great-sword": 4.8,
  "long-sword": 4.8,
  "sword-and-shield": 1.4,
  "dual-blades": 1.4,
  hammer: 5.2,
  "hunting-horn": 5.2,
  lance: 2.3,
  gunlance: 2.3,
  "light-bowgun": 1.2,
  "heavy-bowgun": 1.2,
  bow: 1.2,
};
