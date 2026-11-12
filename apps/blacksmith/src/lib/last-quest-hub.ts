/**
 * The quest board the user last viewed, kept in localStorage so the main
 * menu's "Quests" entry (and /quests/) can open it directly instead of a list
 * of boards.
 */
import { QUEST_HUB_SLUGS, type QuestHubSlug } from "./quests";

export const LAST_QUEST_HUB_KEY = "mhfu_last_quest_hub";
export const DEFAULT_QUEST_HUB: QuestHubSlug = QUEST_HUB_SLUGS[0]!;

export function readLastQuestHub(): QuestHubSlug {
  try {
    const value = localStorage.getItem(LAST_QUEST_HUB_KEY);
    return QUEST_HUB_SLUGS.find((h) => h === value) ?? DEFAULT_QUEST_HUB;
  } catch {
    return DEFAULT_QUEST_HUB;
  }
}

export function writeLastQuestHub(hub: QuestHubSlug): void {
  try {
    localStorage.setItem(LAST_QUEST_HUB_KEY, hub);
  } catch {
    // Ignore storage errors; the menu falls back to the default board.
  }
}
