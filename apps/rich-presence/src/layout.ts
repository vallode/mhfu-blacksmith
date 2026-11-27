/**
 * Where the game keeps what the presence shows, relative to the loaded
 * hunter's character block (the site's `HUNTER_ADDRESSES`), for the plugin's
 * script. docs/discord-rich-presence.md has how each address was found; the
 * quest file's header and the stage lists are read at the offsets given
 * there, in the script itself.
 */
import { HUNTER_ADDRESSES } from "blacksmith/src/lib/ppsspp-link";

/**
 * Where both releases' EBOOT loads: the start of the game's main module,
 * which the plugin's addresses are relative to (PPSSPP's `mem.main()`).
 */
export const MAIN_MODULE = 0x08804000;

/** A release the plugin knows, by PPSSPP's game ID. */
export interface Release {
  /** The loaded hunter's character block. */
  hunter: number;
  /**
   * game_sub's table of each quest map's stages: `{ u32 count, u32 pointer
   * to u16 stage IDs }` by map ID (mhfu-extract's `src/tables/map-layout.ts`,
   * `MAP_TABLES.stages`). A stage's place in its map's list gives the area
   * number the game's map prints, through the site's `area-numbers.json`.
   */
  mapStages: number;
}

export const RELEASES: Readonly<Record<string, Release>> = {
  ULES01213: { hunter: HUNTER_ADDRESSES.ULES01213!, mapStages: 0x09ce4708 },
  // JP, and FUComplete, which reports the JP ID.
  ULJM05500: { hunter: HUNTER_ADDRESSES.ULJM05500!, mapStages: 0x09cdf678 },
};

/** u16: the stage the hunter is on, numbered across the whole game. */
export const STAGE_OFFSET = -0x4a4;
/**
 * The quest object (EU 0x09A05DC0, what `*0x08A62C7C` points at). It's
 * zeroed in town; on a quest +0x10 is the frames left and +0x4C the loaded
 * quest file.
 */
export const QUEST_OFFSET = 0x6bcc0;
/** The equipped weapon: a copy of its equipment box slot (`01 05` melee or `01 06` ranged, then a u16 ID). */
export const WEAPON_OFFSET = 0x20;

/** Frames per second of the game's timers. */
export const FPS = 30;

/**
 * The town's stages (map 0's list: 66, 139, 13, 46, 85, 17), walked to on
 * EU. The Training School has no stage of its own: the stage reads 0 there.
 */
export const TOWN_STAGES: Readonly<Record<number, TownPlace>> = {
  0: "training-school",
  13: "kitchen",
  46: "farm",
  66: "house",
  85: "gathering-hall",
  139: "village",
};
export type TownPlace =
  "village" | "house" | "kitchen" | "farm" | "gathering-hall" | "training-school";

/**
 * The map art a quest map draws (mhfu-extract's `mapTextureName`), which
 * `area-numbers.json` is keyed by: night maps without their own use the day
 * map's.
 */
const NIGHT_TEXTURES: Readonly<Record<number, number>> = { 16: 2, 18: 4, 21: 11, 31: 30 };
export const mapTexture = (map: number) => `map${NIGHT_TEXTURES[map] ?? map}`;
