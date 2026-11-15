/**
 * Where an item comes from, in the site's language: lib/item-places names
 * its groups and points in English, keyed by the English rank or board.
 */
import type { GatherPlace } from "../item-places";
import { QUEST_HUBS } from "../quests";
import { isRank } from "./labels";
import type { Messages } from "./messages";

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

/** "Mining: areas 2, 5 · Gathering: Base Camp, area 3", in the site's language. */
export function gatherPointsLabel(
  t: Messages["items"]["gathering"],
  points: GatherPlace["points"],
): string {
  return points
    .map(({ kind, areas }) => {
      const numbered = areas.filter((a) => a > 0);
      const places = [
        ...(areas.includes(0) ? [t.baseCamp] : []),
        ...(numbered.length > 0 ? [t.areas(numbered)] : []),
      ];
      return t.points(t.kinds[kind], places.join(", "));
    })
    .join(" · ");
}
