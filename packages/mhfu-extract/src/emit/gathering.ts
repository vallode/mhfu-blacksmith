/**
 * Maps each quest's gathering points (`quests/gathering.ts`) onto
 * `data/gathering.json` (schema: `data/schemas/gathering.schema.json`).
 *
 * Quests on one map and rank almost always share their points: the 551 EU
 * quests have about a hundred different sets. So the file holds each
 * distinct set once, with its map and the quests that use it, rather than a
 * copy per quest. Within an area, nodes with the same kind, gather counts
 * and item table are one entry with a `count`.
 */
import type { ParsedQuest } from "../quests/parser.js";
import { NODE_KINDS, readGatheringItems, type GatheringNode } from "../quests/gathering.js";
import { getNameResolver } from "../strings/names.js";
import { resolveMapName } from "../tables/quest-maps.js";
import { isPlaceholderQuest, questHub } from "./quests.js";

/** A node gathered this many times never runs out. */
const ENDLESS = 0xff;

export interface EmittedGatheringItem {
  item: string;
  /** Percent; a table's chances can add up to less than 100 when a draw can give nothing. */
  chance: number;
}

export interface EmittedGatheringNode {
  kind: "gather" | "mine" | "bug";
  /** How many such nodes the area has. */
  count: number;
  /** Fewest gathers before it runs out, or null if it never does. */
  gathers: number | null;
  /** Most gathers before it runs out, or null if it never does. */
  most_gathers: number | null;
  items: EmittedGatheringItem[];
}

export interface EmittedGatheringArea {
  /** 0 is the Base Camp, then the map's numbered areas. */
  area: number;
  nodes: EmittedGatheringNode[];
}

export interface EmittedGatheringLayout {
  map: string;
  /** IDs of the quests that use these points. */
  quests: number[];
  areas: EmittedGatheringArea[];
}

export interface GatheringQuestInput {
  parsed: ParsedQuest;
  /** The decrypted quest file. */
  payload: Buffer;
}

export interface GatheringEmitResult {
  layouts: EmittedGatheringLayout[];
  /** Quests whose points didn't fit the layout, with why. */
  problems: { questId: number; problem: string }[];
}

function counts(n: number): number | null {
  return n === ENDLESS ? null : n;
}

export function emitGathering(quests: GatheringQuestInput[]): GatheringEmitResult {
  const names = getNameResolver();
  const problems: GatheringEmitResult["problems"] = [];
  const byKey = new Map<string, { mapId: number; layout: EmittedGatheringLayout }>();

  for (const { parsed, payload } of quests) {
    const questId = parsed.header.questId;
    if (isPlaceholderQuest(parsed) || questHub(questId) === null) continue;
    const result = readGatheringItems(payload, parsed);
    if (result.problem) {
      problems.push({ questId, problem: result.problem });
      continue;
    }
    if (result.nodes.length === 0) continue;

    const tableItems = (table: number): EmittedGatheringItem[] =>
      (result.tables.get(table) ?? []).flatMap((at) => {
        const id = payload.readUInt16LE(at + 2);
        if (id === 0) return [];
        const item = names.resolve("ItemID", id) ?? `Item ${id}`;
        return [{ item, chance: payload.readUInt16LE(at) }];
      });

    const areas = new Map<number, Map<string, EmittedGatheringNode>>();
    const nodeKey = (n: GatheringNode) => `${n.type}|${n.gathers}|${n.mostGathers}|${n.table}`;
    for (const node of result.nodes) {
      const kind = NODE_KINDS[node.type];
      if (!kind) {
        problems.push({ questId, problem: `unknown node type ${node.type}` });
        continue;
      }
      const area = areas.get(node.area) ?? new Map<string, EmittedGatheringNode>();
      areas.set(node.area, area);
      const key = nodeKey(node);
      const seen = area.get(key);
      if (seen) {
        seen.count++;
        continue;
      }
      area.set(key, {
        kind,
        count: 1,
        gathers: counts(node.gathers),
        most_gathers: counts(node.mostGathers),
        items: tableItems(node.table),
      });
    }

    const mapId = parsed.header.map;
    const emittedAreas = [...areas]
      .sort(([a], [b]) => a - b)
      .map(([area, nodes]) => ({ area, nodes: [...nodes.values()] }));
    if (emittedAreas.length === 0) continue;
    const key = JSON.stringify([mapId, emittedAreas]);
    const known = byKey.get(key);
    if (known) {
      known.layout.quests.push(questId);
      continue;
    }
    byKey.set(key, {
      mapId,
      layout: {
        map: resolveMapName(mapId) ?? `Map ${mapId}`,
        quests: [questId],
        areas: emittedAreas,
      },
    });
  }

  const layouts = [...byKey.values()]
    .map(({ mapId, layout }) => ({
      mapId,
      layout: { ...layout, quests: layout.quests.sort((a, b) => a - b) },
    }))
    .sort((a, b) => a.mapId - b.mapId || a.layout.quests[0]! - b.layout.quests[0]!)
    .map(({ layout }) => layout);
  return { layouts, problems };
}
