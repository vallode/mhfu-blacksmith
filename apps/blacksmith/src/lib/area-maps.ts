/**
 * A quest's map and its gathering points: data/gathering.json's positions,
 * by quest ID, plus an empty map for a quest whose map has no points. Pure,
 * so scripts/generate-data.ts writes it into public/data/area-maps.json and
 * the tests build it from data/.
 */
import { areaNumber } from "./area-numbers";
import type { GatherKind, GatheringFile } from "./item-places";

/** The textures' width and height, in the pixels `x` and `y` count. */
export const AREA_MAP_SIZE = 160;

/**
 * Maps with a texture but no gathering points, so data/gathering.json has no
 * layout to name it by. Their quests still get a Map tab, and arena monsters
 * keep their markers.
 */
const UNGATHERED_TEXTURES: Record<string, string> = {
  "Arena (Small)": "map10",
  "Tower 2": "map14",
  "Tower 1": "map15",
};

export interface AreaMapPoint {
  /** 0 is the Base Camp, then the map's numbered areas. */
  area: number;
  kind: GatherKind;
  x: number;
  y: number;
  /** Fewest gathers before it runs out, or null if it never does. */
  gathers: number | null;
  mostGathers: number | null;
  items: { item: string; chance: number }[];
}

export interface AreaMap {
  /** `/images/area-maps/<texture>.png` */
  texture: string;
  points: AreaMapPoint[];
}

type EncodedItems = [name: number, chance: number][];
type EncodedPoint = [
  area: number,
  kind: number,
  x: number,
  y: number,
  gathers: number | null,
  mostGathers: number | null,
  items: number,
];

/** Points as tuples, sharing item names and lists, as most repeat across quests. */
export interface AreaMapsBundle {
  names: string[];
  lists: EncodedItems[];
  maps: [texture: string, points: EncodedPoint[]][];
  /** Quest ID -> index in `maps`. */
  quests: Record<string, number>;
}

const KINDS: GatherKind[] = ["gather", "mine", "bug"];

/** Each layout with positions, and which quests use it; maps without points get an empty entry. */
export function buildAreaMaps(
  gathering: GatheringFile,
  /** Every quest on a map, so one with no gathering points still gets its map. */
  quests: readonly { id: number; map: string | null }[] = [],
): AreaMapsBundle {
  const bundle: AreaMapsBundle = { names: [], lists: [], maps: [], quests: {} };
  const nameIndex = new Map<string, number>();
  const listIndex = new Map<string, number>();
  const name = (item: string) => {
    let i = nameIndex.get(item);
    if (i === undefined) nameIndex.set(item, (i = bundle.names.push(item) - 1));
    return i;
  };
  const list = (items: { item: string; chance: number }[]) => {
    const encoded: EncodedItems = items.map(({ item, chance }) => [name(item), chance]);
    const key = JSON.stringify(encoded);
    let i = listIndex.get(key);
    if (i === undefined) listIndex.set(key, (i = bundle.lists.push(encoded) - 1));
    return i;
  };
  /** A map name -> its texture, from the layouts (and the maps they don't cover). */
  const textures = new Map<string, string>();
  for (const layout of gathering.layouts) {
    if (layout.texture && !textures.has(layout.map)) textures.set(layout.map, layout.texture);
  }
  for (const [map, texture] of Object.entries(UNGATHERED_TEXTURES)) {
    if (!textures.has(map)) textures.set(map, texture);
  }
  for (const layout of gathering.layouts) {
    if (!layout.texture) continue;
    const points = layout.areas.flatMap(({ area, nodes }) =>
      nodes.flatMap((node) =>
        (node.positions ?? []).map(([x, y]): EncodedPoint => [
          areaNumber(layout.texture, area),
          KINDS.indexOf(node.kind),
          x,
          y,
          node.gathers ?? null,
          node.most_gathers ?? null,
          list(node.items),
        ]),
      ),
    );
    if (points.length === 0) continue;
    const index = bundle.maps.push([layout.texture, points]) - 1;
    for (const quest of layout.quests) bundle.quests[quest] = index;
  }

  // A quest on a map we have a texture for keeps its Map tab, even when no
  // gathering layout has points for it (the arena's own fights, the Tower).
  const emptyMaps = new Map<string, number>();
  for (const quest of quests) {
    if (quest.map === null || bundle.quests[quest.id] !== undefined) continue;
    const texture = textures.get(quest.map);
    if (!texture) continue;
    let index = emptyMaps.get(texture);
    if (index === undefined) {
      index = bundle.maps.push([texture, []]) - 1;
      emptyMaps.set(texture, index);
    }
    bundle.quests[quest.id] = index;
  }
  return bundle;
}

/** One quest's map, or null if it has none. */
export function decodeAreaMap(bundle: AreaMapsBundle, questId: number): AreaMap | null {
  const index = bundle.quests[questId];
  if (index === undefined) return null;
  const [texture, points] = bundle.maps[index]!;
  return {
    texture,
    points: points.map(([area, kind, x, y, gathers, mostGathers, items]) => ({
      area,
      kind: KINDS[kind]!,
      x,
      y,
      gathers,
      mostGathers,
      items: bundle.lists[items]!.map(([item, chance]) => ({
        item: bundle.names[item]!,
        chance,
      })),
    })),
  };
}

/**
 * What a click at (x, y) selects among the points within `reach` of it,
 * nearest first: each press moves on to the next, then to none, so points
 * that overlap can all be reached.
 */
export function nextSelection(
  points: readonly { x: number; y: number; index: number }[],
  x: number,
  y: number,
  reach: number,
  selected: number | null,
): number | null {
  const distance = (p: { x: number; y: number }) => Math.hypot(p.x - x, p.y - y);
  const under = points
    .filter((p) => Math.abs(p.x - x) <= reach && Math.abs(p.y - y) <= reach)
    .sort((a, b) => distance(a) - distance(b) || a.index - b.index)
    .map((p) => p.index);
  return under[(selected === null ? -1 : under.indexOf(selected)) + 1] ?? null;
}

export const areaMapSrc = (texture: string) => `/images/area-maps/${texture}.png`;

export const areaLabel = (area: number) => (area === 0 ? "Base Camp" : `Area ${area}`);
