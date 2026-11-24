/**
 * The hunter section (/hunter/): its pages, in the order its list shows
 * them, and the numbers they show from the loaded save.
 */
import {
  DOWNLOADED_QUEST_HUBS,
  QUEST_HUBS,
  questsOnHub,
  questStarLevels,
  type Quest,
  type QuestHubSlug,
} from "./quests";
import type { SaveData } from "./save-store";

export type HunterPageId =
  "guild-card" | "awards" | "quests" | "monsters" | "crowns" | "collection" | "save";

export interface HunterPage {
  id: HunterPageId;
  /** Nav icon sprite, from /images/<icon>.png. */
  icon: string;
  /** Built yet; the others are listed, dimmed, to show where they will go. */
  ready: boolean;
}

/** The hunter's pages, then the save file (listed apart, under a divider). */
export const HUNTER_PAGES: readonly HunterPage[] = [
  { id: "guild-card", icon: "coin", ready: true },
  { id: "awards", icon: "heavenly", ready: true },
  { id: "quests", icon: "ticket", ready: true },
  { id: "monsters", icon: "claw", ready: true },
  { id: "crowns", icon: "scale", ready: false },
  { id: "collection", icon: "great-sword", ready: false },
];
export const SAVE_PAGE: HunterPage = { id: "save", icon: "note", ready: true };

const PAGE_IDS: readonly HunterPageId[] = [...HUNTER_PAGES, SAVE_PAGE].map((p) => p.id);

export function hunterPageHref(id: HunterPageId): string {
  return `/hunter/${id}/`;
}

/** The page in /hunter/<page>/, or null on /hunter/ itself (or elsewhere). */
export function hunterPageFromPath(pathname: string): HunterPageId | null {
  const [section, page] = pathname.split("/").filter(Boolean);
  if (section !== "hunter" || !page) return null;
  return PAGE_IDS.includes(page as HunterPageId) ? (page as HunterPageId) : null;
}

/** Play time as the game shows it: hours and zero-padded minutes. */
export function formatPlayTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/** Cleared and total quests: overall, per board, and per star level of each board. */
export interface QuestProgress {
  done: number;
  total: number;
  boards: {
    hub: QuestHubSlug;
    done: number;
    total: number;
    levels: { stars: number; done: number; total: number }[];
  }[];
}

/**
 * How many of the boards' quests the hunter has cleared (none without
 * cleared quests read). The downloaded quests' boards are left out: the save
 * has no cleared bits for them.
 */
export function questProgress(quests: Quest[], save: SaveData | null): QuestProgress {
  const cleared = new Set(save?.clearedQuests ?? []);
  const count = (qs: Quest[]) => qs.filter((q) => cleared.has(q.id)).length;
  const onDisc = QUEST_HUBS.filter(({ slug }) => !DOWNLOADED_QUEST_HUBS.has(slug));
  const boards = onDisc.map(({ slug }) => {
    const onHub = questsOnHub(quests, slug);
    const levels = questStarLevels(onHub).map((stars) => {
      const atLevel = onHub.filter((q) => q.stars === stars);
      return { stars, done: count(atLevel), total: atLevel.length };
    });
    return { hub: slug, done: count(onHub), total: onHub.length, levels };
  });
  return {
    done: boards.reduce((n, b) => n + b.done, 0),
    total: boards.reduce((n, b) => n + b.total, 0),
    boards,
  };
}
