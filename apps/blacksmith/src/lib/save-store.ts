const KEY = "mhfu_save";

export interface ItemSlot {
  id: number;
  qty: number;
}

/** One used equipment box slot: `type` is the equip type code (0–6), `id` the equipment ID. */
export interface EquipSlot {
  type: number;
  id: number;
  /** Item IDs (data/items.json) of the attached decorations. Missing on saves stored before they were read. */
  decorations?: number[];
}

/**
 * One monster's records from the hunter's Guild Card tables, by the game's
 * monster ID (src/lib/monster-ids.ts). `largest`/`smallest` are the size
 * records, in percent of the monster's base size (src/lib/crowns.ts).
 */
export interface MonsterRecord {
  id: number;
  kills: number;
  captures: number;
  largest: number;
  smallest: number;
}

/** One of the hunter's Felyne Comrades. */
export interface Comrade {
  /** 7000 at full fondness. */
  fondness: number;
  /** How many of the 36 Comrade Skills it has. */
  skills: number;
  /** Raised by this hunter: its owner is the hunter's Guild Card name. */
  own: boolean;
}

/**
 * What the Guild Card award conditions read from a hunter's block, besides
 * the cleared quests and monster records (src/lib/awards.ts uses them;
 * packages/mhfu-extract/docs/awards.md has the offsets). Each is missing on
 * saves stored before it was read.
 */
export interface AwardRecords {
  /**
   * Training School quests cleared with each weapon set: bit
   * `(quest - 21001) * 5 + set`, for quests 21001-21023 and sets 0-4.
   */
  trainingSets?: number[];
  /** Pokke Farm levels: Field, Fishing Pier, Mining Area, Insect area. */
  farm?: number[];
  /** The level of each Felyne Chef hired, of five. */
  felyneChefs?: number[];
  comrades?: Comrade[];
  /** How many of the 172 combination recipes the hunter knows. */
  recipes?: number;
  guildPoints?: number;
  /** How many of the 35 gold-crown treasures the hunter has found. */
  goldTreasures?: number;
  /** The best score of each Treasure Hunt, quests 4001-4007. */
  treasureScores?: number[];
  /**
   * Quests done on each map: Forest and Hills, Jungle, Desert, Swamp,
   * Volcano, Snowy Mountains, Tower, Great Forest, Old Jungle, Old Volcano,
   * Old Desert, Old Swamp, Fortress, Town.
   */
  mapQuests?: number[];
  /** Times Trenya's most expensive trip was paid for. */
  trenyaTrips?: number;
  /** How many special weapons the hunter has forged. */
  specialWeapons?: number;
}

const AWARD_RECORD_KEYS = [
  "trainingSets",
  "farm",
  "felyneChefs",
  "comrades",
  "recipes",
  "guildPoints",
  "goldTreasures",
  "treasureScores",
  "mapQuests",
  "trenyaTrips",
  "specialWeapons",
] as const satisfies readonly (keyof AwardRecords)[];

export interface SaveData extends AwardRecords {
  name: string;
  region: string;
  /** Item box and pouch together. */
  items: ItemSlot[];
  /** Missing on saves stored before zenny was kept. */
  zenny?: number;
  /** Missing on saves stored before the equipment box was read. */
  equipment?: EquipSlot[];
  /** Missing on saves stored before these were kept. */
  sex?: string;
  /** Total play time in seconds. */
  playTime?: number;
  /** Missing on saves stored before it was read. */
  hunterRank?: number;
  /** 0-based character slot in the save file. Missing on saves stored before it was kept. */
  slot?: number;
  /** IDs of the quests the hunter has cleared. Missing on saves stored before they were read. */
  clearedQuests?: number[];
  /** Monsters with a record (kills, captures or sizes). Missing on saves stored before they were read. */
  monsters?: MonsterRecord[];
  /**
   * Indexes into AWARDS (src/lib/awards.ts) of the Guild Card awards the game
   * has given the hunter: its own award flags. Missing on saves stored before
   * they were read.
   */
  awards?: number[];
  savedAt: number;
}

/** The parts of a parsed hunter that get stored. */
export function saveFromCharacter(
  character: AwardRecords & {
    name: string;
    sex?: string;
    zenny: number;
    playTime?: number;
    hunterRank?: number;
    itemChest: ItemSlot[];
    itemPouch: ItemSlot[];
    equipBox: EquipSlot[];
    clearedQuests?: number[];
    monsters?: MonsterRecord[];
    awards?: number[];
  },
  region: string,
  slot?: number,
): Omit<SaveData, "savedAt"> {
  const records: AwardRecords = {};
  for (const key of AWARD_RECORD_KEYS) Object.assign(records, { [key]: character[key] });
  return {
    ...records,
    name: character.name,
    region,
    items: [...character.itemChest, ...character.itemPouch],
    zenny: character.zenny,
    equipment: character.equipBox,
    sex: character.sex,
    playTime: character.playTime,
    hunterRank: character.hunterRank,
    slot,
    clearedQuests: character.clearedQuests,
    monsters: character.monsters,
    awards: character.awards,
  };
}

export function setSave(data: Omit<SaveData, "savedAt">): void {
  localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
}

export function getSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(KEY);
}
