/**
 * Where the game keeps what the presence shows, and the pure parsing of it.
 * Everything here is relative to the loaded hunter's character block (the
 * site's `HUNTER_ADDRESSES`), so one snapshot read covers the stage, the
 * hunter and the quest object. docs/discord-rich-presence.md has how each
 * address was found.
 */
import { HUNTER_ADDRESSES, HUNTER_SIZE, looksLikeHunter } from "blacksmith/src/lib/ppsspp-link";

/** A release the reader knows, by PPSSPP's game ID. */
export interface Release {
  /** The loaded hunter's character block. */
  hunter: number;
  /**
   * game_sub's table of each quest map's stages: `{ u32 count, u32 pointer
   * to u16 stage IDs }` by map ID (mhfu-extract's `src/tables/map-layout.ts`,
   * `MAP_TABLES.stages`). A stage's index in its map's list is the area
   * number the game shows, 0 being the Base Camp.
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
 * zeroed in town; on a quest it holds the timer and the loaded quest file.
 */
export const QUEST_OFFSET = 0x6bcc0;
const QUEST_STATE = 0x00; // u8: 0 under way, 1 completed or timed out, 2 rewards
const QUEST_TIME_LEFT = 0x10; // u32: frames left, 30 a second
const QUEST_FILE = 0x4c; // u32: the loaded quest file (its header)
export const QUEST_OBJECT_SIZE = 0x50;
/** The equipped weapon: a copy of its equipment box slot (12 bytes, the save worker's `parseEquipSlot`). */
export const WEAPON_OFFSET = 0x20;

/** One read from `snapshotStart` covers the stage, the hunter block and the quest object. */
export const SNAPSHOT_SIZE = QUEST_OFFSET + QUEST_OBJECT_SIZE - STAGE_OFFSET;
export const snapshotStart = (release: Release) => release.hunter + STAGE_OFFSET;

/** The quest file's header (mhfu-extract's `readQuestHeader`). */
export const QUEST_HEADER_SIZE = 0x80;
const QUEST_MAGIC = [0x4c, 0x00, 0x00, 0x00, 0x32, 0x4e, 0x44, 0x47]; // VDatPTR 0x4C, "2NDG"
const QUEST_TYPE = 0x4c; // u32; low byte 2 is a delivery
const QUEST_TIME_LIMIT = 0x5c; // u32 frames
const QUEST_ID = 0x64; // u16
const QUEST_STARS = 0x66; // u8
const QUEST_MAP = 0x68; // u8
const QUEST_TARGET = 0x70; // u16 emID (an item ID on deliveries)
const QUEST_TARGET_COUNT = 0x72; // u16
const DELIVERY = 2;

/** Frames per second of the game's timers. */
export const FPS = 30;

export interface Weapon {
  /** 5 blademaster (the melee table), 6 gunner (the ranged table). */
  table: 5 | 6;
  id: number;
}

export interface Hunter {
  name: string;
  weapon: Weapon | null;
}

export interface QuestObject {
  state: number;
  timeLeft: number;
  file: number;
}

export interface QuestHeader {
  id: number;
  stars: number;
  map: number;
  timeLimit: number;
  /** The monster to hunt or capture, as an emID; null on deliveries and quests without one. */
  target: number | null;
  /** A delivery: every gathering quest, and the herb, mushroom and egg runs. */
  delivery: boolean;
}

export interface Snapshot {
  stage: number;
  /** Null until a hunter is loaded (the title screen, the save menus). */
  hunter: Hunter | null;
  quest: QuestObject;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** The hunter's name (UTF-16LE, up to 12 characters, zero-padded: the save worker's `readName`). */
export function hunterName(block: Uint8Array): string {
  const text = new TextDecoder("utf-16le").decode(block.subarray(0, 24));
  const end = text.indexOf("\0");
  return (end < 0 ? text : text.slice(0, end)).trim();
}

/** The equipped weapon, or null if the slot isn't a weapon. */
export function equippedWeapon(block: Uint8Array): Weapon | null {
  const slot = block.subarray(WEAPON_OFFSET, WEAPON_OFFSET + 12);
  const table = slot[1];
  if (slot[0] !== 1 || (table !== 5 && table !== 6)) return null;
  return { table, id: view(slot).getUint16(2, true) };
}

/** A snapshot read from `snapshotStart`. */
export function parseSnapshot(bytes: Uint8Array): Snapshot {
  if (bytes.length < SNAPSHOT_SIZE) throw new Error("short snapshot");
  const v = view(bytes);
  const block = bytes.subarray(-STAGE_OFFSET, -STAGE_OFFSET + HUNTER_SIZE);
  const quest = QUEST_OFFSET - STAGE_OFFSET;
  return {
    stage: v.getUint16(0, true),
    hunter: looksLikeHunter(block)
      ? { name: hunterName(block), weapon: equippedWeapon(block) }
      : null,
    quest: {
      state: v.getUint8(quest + QUEST_STATE),
      timeLeft: v.getUint32(quest + QUEST_TIME_LEFT, true),
      file: v.getUint32(quest + QUEST_FILE, true),
    },
  };
}

/** Whether the quest object points at a quest file, as it does from departure to the reward screen. */
export const onQuest = (quest: QuestObject) => quest.file >= 0x08800000 && quest.file < 0x0a000000;

/** The loaded quest's header, or null if `bytes` doesn't start with one. */
export function parseQuestHeader(bytes: Uint8Array): QuestHeader | null {
  if (bytes.length < QUEST_HEADER_SIZE || QUEST_MAGIC.some((b, i) => bytes[i] !== b)) return null;
  const v = view(bytes);
  const delivery = (v.getUint32(QUEST_TYPE, true) & 0xff) === DELIVERY;
  const count = v.getUint16(QUEST_TARGET_COUNT, true);
  return {
    id: v.getUint16(QUEST_ID, true),
    stars: v.getUint8(QUEST_STARS),
    map: v.getUint8(QUEST_MAP),
    timeLimit: v.getUint32(QUEST_TIME_LIMIT, true),
    target: delivery || count === 0 ? null : v.getUint16(QUEST_TARGET, true),
    delivery,
  };
}

/** Where a map's entry in the `mapStages` table is. */
export const mapStagesEntry = (release: Release, map: number) => release.mapStages + map * 8;

/** A `mapStages` entry: the stage count and where the u16 stage IDs are. */
export function parseMapStagesEntry(bytes: Uint8Array): { count: number; list: number } | null {
  const v = view(bytes);
  const count = v.getUint32(0, true);
  const list = v.getUint32(4, true);
  if (count === 0 || count > 32 || list < 0x08800000 || list >= 0x0a000000) return null;
  return { count, list };
}

export function parseStageList(bytes: Uint8Array, count: number): number[] {
  const v = view(bytes);
  return Array.from({ length: count }, (_, i) => v.getUint16(i * 2, true));
}

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
