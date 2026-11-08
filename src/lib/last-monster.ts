/**
 * The monster type the user last viewed, kept in localStorage so the main
 * menu's "Monsters" entry can open it directly instead of a list of types.
 */
import { MONSTER_CATEGORIES, type MonsterCategory } from "./constants";

export const LAST_MONSTER_KEY = "mhfu_last_monster";
export const DEFAULT_MONSTER: MonsterCategory = MONSTER_CATEGORIES[0];

export function readLastMonster(): MonsterCategory {
  try {
    const value = localStorage.getItem(LAST_MONSTER_KEY);
    return MONSTER_CATEGORIES.find((c) => c === value) ?? DEFAULT_MONSTER;
  } catch {
    return DEFAULT_MONSTER;
  }
}

export function writeLastMonster(category: MonsterCategory): void {
  try {
    localStorage.setItem(LAST_MONSTER_KEY, category);
  } catch {
    // Ignore storage errors; the menu falls back to the default type.
  }
}
