/**
 * Build-time list for the Maps page, read from data/mhfu/gathering.json: each map
 * that the game draws, with the layouts (item sets, which differ by rank and
 * quest board) it has. Pages render the points from public/data/area-maps.json.
 */
import { DATA_DIR, GAME } from "./paths";
import { readData } from "game-data";
import type { GatheringFile } from "./item-places";
import { mapTextures } from "./area-maps";
import { DOWNLOADED_QUEST_HUBS, QUEST_HUBS, type QuestHubSlug } from "./quests";
import { getQuestSummaries } from "./quests-data";

export interface MapEntry {
  /** The map's name as data/ spells it: "Snowy Mountains (Day)". */
  map: string;
  /**
   * One entry per layout: the first quest to use it, every quest to choose
   * from, how many there are, and the boards (in board order) those quests
   * are on. Downloaded quests are left out of the boards.
   */
  layouts: { questId: number; questIds: number[]; quests: number; hubs: QuestHubSlug[] }[];
}

let cache: MapEntry[] | null = null;

export function getMapEntries(): MapEntry[] {
  if (cache) return cache;
  const gathering = readData<GatheringFile>(DATA_DIR, GAME, "gathering.json");
  const summaries = getQuestSummaries();
  const hubOf = new Map(summaries.map((q) => [q.id, q.hub]));
  const boardsOf = (ids: number[]): QuestHubSlug[] => {
    const boards = new Set(ids.map((id) => hubOf.get(id)));
    return QUEST_HUBS.map((h) => h.slug).filter(
      (slug) => boards.has(slug) && !DOWNLOADED_QUEST_HUBS.has(slug),
    );
  };
  const textures = mapTextures(gathering);
  const byMap = new Map<string, MapEntry>();
  const entryOf = (map: string) => {
    let entry = byMap.get(map);
    if (!entry) byMap.set(map, (entry = { map, layouts: [] }));
    return entry;
  };
  const covered = new Set<number>();
  for (const layout of gathering.layouts) {
    const first = layout.quests[0];
    if (!layout.texture || first === undefined) continue;
    const hasPoints = layout.areas.some((a) => a.nodes.some((n) => (n.positions ?? []).length > 0));
    if (!hasPoints) continue;
    for (const id of layout.quests) covered.add(id);
    entryOf(layout.map).layouts.push({
      questId: first,
      questIds: layout.quests,
      quests: layout.quests.length,
      hubs: boardsOf(layout.quests),
    });
  }
  // The game's map order, as the gathering layouts already list it.
  const mapOrder = [...byMap.keys()];
  // Quests with monster spawns but no gathering layout (Arena (Small), say)
  // get one layout per map, so their spawns have a map to show.
  const spawnOnly = new Map<string, number[]>();
  for (const quest of summaries) {
    if (!quest.hasSpawns || !quest.map || covered.has(quest.id)) continue;
    if (!textures.has(quest.map)) continue;
    const ids = spawnOnly.get(quest.map) ?? [];
    ids.push(quest.id);
    spawnOnly.set(quest.map, ids);
  }
  for (const [map, ids] of spawnOnly) {
    ids.sort((a, b) => a - b);
    entryOf(map).layouts.push({
      questId: ids[0]!,
      questIds: ids,
      quests: ids.length,
      hubs: boardsOf(ids),
    });
  }
  // Put each spawn-only map where its texture number belongs, keeping the
  // existing list's order (day maps, then the rest) untouched.
  const textureOrder = (map: string) => Number(textures.get(map)?.replace(/\D/g, "")) || 0;
  for (const map of spawnOnly.keys()) {
    const at = mapOrder.findIndex((other) => textureOrder(other) > textureOrder(map));
    if (at < 0) mapOrder.push(map);
    else mapOrder.splice(at, 0, map);
  }
  cache = mapOrder.map((map) => byMap.get(map)!);
  return cache;
}
