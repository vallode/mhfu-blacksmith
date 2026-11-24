/**
 * Build-time list for the Maps page, read from data/mhfu/gathering.json: each map
 * that the game draws, with the layouts (item sets, which differ by rank and
 * quest board) it has. Pages render the points from public/data/area-maps.json.
 */
import { DATA_DIR, GAME } from "./paths";
import { readData } from "game-data";
import type { GatheringFile } from "./item-places";
import { DOWNLOADED_QUEST_HUBS, QUEST_HUBS, type QuestHubSlug } from "./quests";
import { getQuestSummaries } from "./quests-data";

export interface MapEntry {
  /** The map's name as data/ spells it: "Snowy Mountains (Day)". */
  map: string;
  /**
   * One entry per layout: the first quest to use it, how many quests share it,
   * and the boards (in board order) those quests are on. Downloaded quests are left out.
   */
  layouts: { questId: number; quests: number; hubs: QuestHubSlug[] }[];
}

let cache: MapEntry[] | null = null;

export function getMapEntries(): MapEntry[] {
  if (cache) return cache;
  const { layouts } = readData<GatheringFile>(DATA_DIR, GAME, "gathering.json");
  const hubOf = new Map(getQuestSummaries().map((q) => [q.id, q.hub]));
  const byMap = new Map<string, MapEntry>();
  for (const layout of layouts) {
    const first = layout.quests[0];
    if (!layout.texture || first === undefined) continue;
    const hasPoints = layout.areas.some((a) => a.nodes.some((n) => (n.positions ?? []).length > 0));
    if (!hasPoints) continue;
    let entry = byMap.get(layout.map);
    if (!entry) byMap.set(layout.map, (entry = { map: layout.map, layouts: [] }));
    const boards = new Set(layout.quests.map((id) => hubOf.get(id)));
    entry.layouts.push({
      questId: first,
      quests: layout.quests.length,
      hubs: QUEST_HUBS.map((h) => h.slug).filter(
        (slug) => boards.has(slug) && !DOWNLOADED_QUEST_HUBS.has(slug),
      ),
    });
  }
  cache = [...byMap.values()];
  return cache;
}
