/**
 * Remembers the armor page last visited (slot and rank), so the main menu's
 * "Armor" entry can open it directly. Kept across sessions.
 */
import { ARMOR_RANKS, ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "./constants";

const KEY = "last-armor";

export interface LastArmor {
  slot: ArmorSlot;
  rank: ArmorRank;
}

const DEFAULT: LastArmor = { slot: ARMOR_SLOTS[0], rank: ARMOR_RANKS[0] };

export function readLastArmor(): LastArmor {
  try {
    const [slot, rank] = (localStorage.getItem(KEY) ?? "").split("/");
    if (
      (ARMOR_SLOTS as readonly string[]).includes(slot) &&
      (ARMOR_RANKS as readonly string[]).includes(rank)
    ) {
      return { slot: slot as ArmorSlot, rank: rank as ArmorRank };
    }
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return DEFAULT;
}

export function writeLastArmor({ slot, rank }: LastArmor): void {
  try {
    localStorage.setItem(KEY, `${slot}/${rank}`);
  } catch {
    // Ignore storage errors (e.g. private browsing quota).
  }
}
