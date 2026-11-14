/**
 * Where items come from, in the site's language: the English labels lib/
 * gives drop tables, gathering groups and maps, put through the messages
 * and the game's own names. Shared by the item pages and the wishlist.
 */
import type { GameText } from "@/lib/i18n/game-text";
import { isRank } from "@/lib/i18n/labels";
import type { Messages } from "@/lib/i18n/messages";
import type { DropSource } from "@/lib/monster-drops";
import { QUEST_HUBS } from "@/lib/quests";

/**
 * A drop table rank or a gathering group, as lib/ names them in English
 * ("Low Rank", "1-2 Star Guild", "Training School"), in the site's language.
 */
export function groupLabel(t: Messages, group: string): string {
  const hub = QUEST_HUBS.find((h) => h.label === group);
  if (hub) return t.quests.hubs[hub.slug];
  const id = group.trim().toLowerCase().replace(/\s+/g, "-");
  if (isRank(id)) return t.common.ranks[id];
  return t.monsters.drops.ranks[id] ?? group;
}

/** "Body carves ×3 · fished out, using frog as bait", in the site's language. */
export function dropSourceLabel(t: Messages, { title, count, note }: DropSource): string {
  const name = t.monsters.drops.sources[title] ?? title;
  return [
    count !== undefined ? `${name} ×${count}` : name,
    note && (t.monsters.drops.notes[note] ?? note),
  ]
    .filter(Boolean)
    .join(" · ");
}

const TIME_OF_DAY = / \((?:Day|Night)\)$/;

/**
 * A map as a hunting ground, without its time of day ("Desert (Night)" ->
 * "Desert"), in the site's language. The game names the day and night maps
 * apart, so the translated name drops its last bracket too.
 */
export function groundName(game: GameText, map: string): string {
  const name = game.name("map", map);
  return TIME_OF_DAY.test(map) ? name.replace(/\s*\([^()]*\)$/, "") : name;
}
