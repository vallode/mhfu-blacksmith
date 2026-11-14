/**
 * Words used across the site: section names, the game's equipment and rank
 * vocabulary, and generic controls. Game terms follow the game's own text.
 */
export const common = {
  sections: {
    weapons: "Weapons",
    armor: "Armor",
    decorations: "Decorations",
    setBuilder: "Set Builder",
    monsters: "Monsters",
    quests: "Quests",
    hunter: "Hunter Profile",
    options: "Options",
  },
  weaponTypes: {
    "great-sword": "Great Sword",
    "long-sword": "Long Sword",
    "sword-and-shield": "Sword and Shield",
    "dual-blades": "Dual Blades",
    hammer: "Hammer",
    "hunting-horn": "Hunting Horn",
    lance: "Lance",
    gunlance: "Gunlance",
    "light-bowgun": "Light Bowgun",
    "heavy-bowgun": "Heavy Bowgun",
    bow: "Bow",
  },
  armorSlots: {
    helmet: "Head",
    plate: "Chest",
    gauntlets: "Arms",
    waist: "Waist",
    leggings: "Legs",
  },
  ranks: {
    "low-rank": "Low Rank",
    "high-rank": "High Rank",
    "g-rank": "G Rank",
  },
  monsterCategories: {
    lynian: "Lynian",
    neopteron: "Neopteron",
    herbivore: "Herbivore",
    "bird-wyvern": "Bird Wyvern",
    "flying-wyvern": "Flying Wyvern",
    "piscine-wyvern": "Piscine Wyvern",
    carapaceon: "Carapaceon",
    pelagus: "Pelagus",
    "elder-dragon": "Elder Dragon",
  },
  elements: {
    Fire: "Fire",
    Water: "Water",
    Thunder: "Thunder",
    Ice: "Ice",
    Dragon: "Dragon",
    Poison: "Poison",
    Paralysis: "Paralysis",
    Sleep: "Sleep",
  } as Record<string, string>,
  on: "On",
  off: "Off",
  loading: "Loading…",
  close: "Close",
  back: "Back",
  /** "4,500z" */
  zenny: (amount: string) => `${amount}z`,
};
