/**
 * The pictures apps/rich-presence shows in a player's Discord status, which
 * Discord fetches from the site by URL. scripts/generate-embeds.ts writes
 * them into public/embed/presence/ (writePresenceIcons): square, on a
 * transparent background, the site's sprites scaled by whole numbers so
 * they stay crisp when Discord shrinks them.
 */
import { RARITY_COLORS } from "./embed-format";

export const PRESENCE_ICON_DIR = "/embed/presence";

/** A weapon class's mini icon (`great-sword-mini.png`), tinted for its rarity as the site tints it. */
export function presenceWeaponIcon(type: string, rarity: number | null | undefined): string {
  const tint = rarity && RARITY_COLORS[rarity] ? `rarity-${rarity}` : "plain";
  return `${PRESENCE_ICON_DIR}/${type}-${tint}.png`;
}

/** A monster's portrait (its category's icon where it has none), by the monster page's slug. */
export const presenceMonsterIcon = (slug: string) => `${PRESENCE_ICON_DIR}/monster-${slug}.png`;

/** The Herb's icon (item icon 15 in its colour 2), for gathering and delivery quests. */
export const PRESENCE_HERB_ICON = `${PRESENCE_ICON_DIR}/herb.png`;
export const HERB_SPRITE = "item-15";
export const HERB_COLOR = "#73cb8d";

/** The pictures' size: a 16px mini at 8×, a 36px portrait at 4× with room around it. */
export const PRESENCE_ICON_SIZE = 160;
