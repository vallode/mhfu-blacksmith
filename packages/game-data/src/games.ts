/**
 * The games the data covers, and what each one has: the facts about a game
 * that the site and the extractor share. Display text and other UI-only
 * details (labels, icons, page layout) stay in the site.
 *
 * Pure (no fs), so the site's client code imports it too, as
 * `game-data/games`.
 *
 * MHFU is the only game with data so far. The shape is there for the others:
 * a game lists only the weapon classes, ranks, monster categories and quest
 * boards it has, and turns off the sections it doesn't (MHF1, for instance,
 * is expected to have no G rank and no decorations; check against its data
 * when it comes).
 */
import type { WeaponTable } from "./model.js";

/** Every game the site's URLs can name, in release order. */
export const GAME_CODES = ["mhf1", "mhf2", "mhfu"] as const;
export type GameCode = (typeof GAME_CODES)[number];

export interface WeaponClass<Slug extends string = string> {
  /** The weapon type's slug: its `data/<game>/weapons/<slug>.json` and its URL segment. */
  slug: Slug;
  table: WeaponTable;
  /** The game's class multiplier: displayed attack is true attack times this. */
  multiplier: number;
  /** The game's weapon class number: its motion file, `motion/wNN_tbl.bin`. */
  motionClass: number;
}

export interface QuestHub<Slug extends string = string> {
  /** The quest board's slug, in URLs. */
  slug: Slug;
  /** The `hub` of the board's quests in `data/<game>/quests`. */
  hub: string;
  /** The `rank` they have, for a board of one rank (the Guild's); null when any. */
  rank: string | null;
  /** Whether the board numbers its stars like the Guild's, ★9 and up showing as G★1-G★3. */
  guildStars: boolean;
  /**
   * Whether its quests are downloaded rather than on the disc (Event and
   * Challenge Quests): a save has no cleared bit for them, and no copy of the
   * game has them.
   */
  downloaded: boolean;
}

/** The sections of the site, which a game has or hasn't. */
export interface GameSections {
  /** Weapons and their upgrade trees. */
  blacksmith: boolean;
  /** Armor. */
  armorsmith: boolean;
  monsters: boolean;
  quests: boolean;
  items: boolean;
  /** The maps, with their gathering points. */
  maps: boolean;
  /** Decorations, and slots on equipment. */
  decorations: boolean;
  /** The Veggie Elder's trades. */
  veggieElder: boolean;
  /** Pokke Farm's gathering points, among an item's sources. */
  pokkeFarm: boolean;
  /** The armor set builder. */
  setBuilder: boolean;
  wishlist: boolean;
  /** Loading a hunter's save file. */
  hunterImport: boolean;
}

/** A game's save file, for the hunter import. */
export interface SaveFormat {
  /** The file's name on the memory stick. */
  fileName: string;
  /** Which parser reads it. */
  format: "mhp2g";
}

export interface GameConfig<
  Weapon extends string = string,
  Slot extends string = string,
  Rank extends string = string,
  Category extends string = string,
  Hub extends string = string,
> {
  code: GameCode;
  /** The game's name, in English. */
  title: string;
  /** Its short name ("MHFU"). */
  shortTitle: string;
  /** The weapon classes, in the game's menu order. */
  weaponClasses: readonly WeaponClass<Weapon>[];
  /** The armor slots, in the game's order. */
  armorSlots: readonly Slot[];
  /** The ranks armor and the Guild's quests come in, lowest first. */
  ranks: readonly Rank[];
  /** The monster categories, in the order the site lists them. */
  monsterCategories: readonly Category[];
  /** The quest boards, in the order the site lists them. */
  questHubs: readonly QuestHub<Hub>[];
  sections: GameSections;
  /** The save file the hunter import reads, or null when there is none. */
  save: SaveFormat | null;
}

const MHFU = {
  code: "mhfu",
  title: "Monster Hunter Freedom Unite",
  shortTitle: "MHFU",
  weaponClasses: [
    { slug: "great-sword", table: "melee", multiplier: 4.8, motionClass: 0 },
    { slug: "long-sword", table: "melee", multiplier: 4.8, motionClass: 7 },
    { slug: "sword-and-shield", table: "melee", multiplier: 1.4, motionClass: 4 },
    { slug: "dual-blades", table: "melee", multiplier: 1.4, motionClass: 6 },
    { slug: "hammer", table: "melee", multiplier: 5.2, motionClass: 2 },
    { slug: "hunting-horn", table: "melee", multiplier: 5.2, motionClass: 8 },
    { slug: "lance", table: "melee", multiplier: 2.3, motionClass: 3 },
    { slug: "gunlance", table: "melee", multiplier: 2.3, motionClass: 9 },
    { slug: "light-bowgun", table: "ranged", multiplier: 1.2, motionClass: 5 },
    { slug: "heavy-bowgun", table: "ranged", multiplier: 1.2, motionClass: 1 },
    { slug: "bow", table: "ranged", multiplier: 1.2, motionClass: 10 },
  ],
  armorSlots: ["helmet", "plate", "gauntlets", "waist", "leggings"],
  ranks: ["low-rank", "high-rank", "g-rank"],
  monsterCategories: [
    "lynian",
    "neopteron",
    "herbivore",
    "bird-wyvern",
    "flying-wyvern",
    "piscine-wyvern",
    "carapaceon",
    "pelagus",
    "elder-dragon",
  ],
  questHubs: [
    { slug: "village", hub: "village", rank: null, guildStars: false, downloaded: false },
    { slug: "low-rank", hub: "guild", rank: "low-rank", guildStars: true, downloaded: false },
    { slug: "high-rank", hub: "guild", rank: "high-rank", guildStars: true, downloaded: false },
    { slug: "g-rank", hub: "guild", rank: "g-rank", guildStars: true, downloaded: false },
    {
      slug: "training-school",
      hub: "training-school",
      rank: null,
      guildStars: false,
      downloaded: false,
    },
    {
      slug: "treasure-hunting",
      hub: "treasure-hunting",
      rank: null,
      guildStars: false,
      downloaded: false,
    },
    { slug: "event", hub: "event", rank: null, guildStars: true, downloaded: true },
    { slug: "challenge", hub: "challenge", rank: null, guildStars: false, downloaded: true },
  ],
  sections: {
    blacksmith: true,
    armorsmith: true,
    monsters: true,
    quests: true,
    items: true,
    maps: true,
    decorations: true,
    veggieElder: true,
    pokkeFarm: true,
    setBuilder: true,
    wishlist: true,
    hunterImport: true,
  },
  save: { fileName: "MHP2NDG.BIN", format: "mhp2g" },
} as const satisfies GameConfig;

/** The games that have data, by code. */
export const GAMES = { mhfu: MHFU } as const satisfies Partial<Record<GameCode, GameConfig>>;

/** The codes of the games that have data, in release order. */
export type DataGameCode = keyof typeof GAMES;
export const DATA_GAMES: readonly DataGameCode[] = GAME_CODES.filter(
  (code): code is DataGameCode => code in GAMES,
);

/** MHFU's config: the game the site has shown so far, and the default. */
export const MHFU_GAME: typeof MHFU = MHFU;

export function isGameCode(code: string): code is GameCode {
  return (GAME_CODES as readonly string[]).includes(code);
}

/** A game's config; throws for a game without data. */
export function gameConfig(code: string): GameConfig {
  const game = (GAMES as Partial<Record<string, GameConfig>>)[code];
  if (!game) throw new Error(`game-data: no game "${code}" (have ${DATA_GAMES.join(", ")})`);
  return game;
}

/** The slugs of a game's weapon types, in menu order. */
export function weaponTypesOf<W extends string>(game: GameConfig<W>): W[] {
  return game.weaponClasses.map((w) => w.slug);
}
