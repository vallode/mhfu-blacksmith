/**
 * Build-time list for the Maps page, read from data/mhfu/gathering.json: each map
 * that the game draws, with the layouts (item sets, which differ by rank and
 * quest board) it has. A day and night the game draws alike are one map. Pages
 * render the points from public/data/area-maps.json.
 */
import { DATA_DIR, GAME } from "./paths";
import { readData } from "game-data";
import type { GatheringFile } from "./item-places";
import { groupBy } from "./item-sources";
import { buildAreaMaps, mapTextures } from "./area-maps";
import { DOWNLOADED_QUEST_HUBS, isHiddenQuest, QUEST_HUBS, type QuestHubSlug } from "./quests";
import { getQuestSummaries, type QuestSummary } from "./quests-data";

export interface MapEntry {
  /**
   * The map's name as data/ spells it: "Jungle (Day)". Where day and night are
   * one map, the name of the one the game introduces first.
   */
  map: string;
  /** Day and night as one map, which is named without the time of day. */
  bothTimes?: true;
  /**
   * One entry per layout: the first quest to use it, every quest to choose
   * from, how many there are, and the boards (in board order) those quests
   * are on. Downloaded quests are left out of the boards, and the copies the
   * site hides (`isHiddenQuest`) are left out altogether.
   */
  layouts: { questId: number; questIds: number[]; quests: number; hubs: QuestHubSlug[] }[];
}

/** The boards a hunter meets the maps on, in the order they play them. */
const CAMPAIGN_HUBS: QuestHubSlug[] = ["village", "low-rank", "high-rank", "g-rank"];

/**
 * The maps in the order the game introduces them: by each map's first quest,
 * taking the Village's star levels and then the Guild's (rank by rank) for the
 * maps the Village never visits.
 */
function appearanceOrder(summaries: QuestSummary[]): string[] {
  const order = summaries
    .filter((q) => CAMPAIGN_HUBS.includes(q.hub))
    .sort(
      (a, b) =>
        CAMPAIGN_HUBS.indexOf(a.hub) - CAMPAIGN_HUBS.indexOf(b.hub) ||
        a.stars - b.stars ||
        a.id - b.id,
    )
    .flatMap((q) => q.map ?? []);
  return [...new Set(order)];
}

type Layout = MapEntry["layouts"][number];

/**
 * Joins a day and night that share a texture, and then those of their layouts that put
 * the same items on the same points. `maps` keeps its order, each joined map
 * taking its first one's place.
 */
function mergeIdentical(
  maps: MapEntry[],
  textureOf: (map: string) => string,
  pointsOf: (layout: Layout) => string,
  boardsOf: (ids: number[]) => QuestHubSlug[],
): MapEntry[] {
  const ground = (map: string) => map.replace(/ \((?:Day|Night)\)$/, "");
  return groupBy(maps, (m) => `${textureOf(m.map)} ${ground(m.map)}`).map(([, group]) => {
    const first = group[0]!;
    if (group.length === 1) return first;
    const layouts = groupBy(
      group.flatMap((m) => m.layouts),
      pointsOf,
    );
    return {
      map: first.map,
      bothTimes: true,
      layouts: layouts.map(([, same]) => {
        const questIds = same.flatMap((l) => l.questIds).sort((a, b) => a - b);
        return {
          questId: questIds[0]!,
          questIds,
          quests: questIds.length,
          hubs: boardsOf(questIds),
        };
      }),
    };
  });
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
    const questIds = layout.quests.filter((id) => !isHiddenQuest(id));
    const first = questIds[0];
    if (!layout.texture || first === undefined) continue;
    const hasPoints = layout.areas.some((a) => a.nodes.some((n) => (n.positions ?? []).length > 0));
    if (!hasPoints) continue;
    for (const id of layout.quests) covered.add(id);
    entryOf(layout.map).layouts.push({
      questId: first,
      questIds,
      quests: questIds.length,
      hubs: boardsOf(questIds),
    });
  }
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
  const order = appearanceOrder(summaries);
  // A map no campaign quest visits goes last.
  const rank = (map: string) => (order.includes(map) ? order.indexOf(map) : order.length);
  const sorted = [...byMap.values()].sort((a, b) => rank(a.map) - rank(b.map));
  const areaMaps = buildAreaMaps(gathering);
  cache = mergeIdentical(
    sorted,
    (map) => textures.get(map)!,
    // A layout of spawns alone has no points.
    (layout) => JSON.stringify(areaMaps.maps[areaMaps.quests[layout.questId] ?? -1]?.[1] ?? []),
    boardsOf,
  );
  return cache;
}
