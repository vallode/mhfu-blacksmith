/**
 * The Quality of life step's preview of "Gathering nodes on the area map"
 * (`mods.nodeMap`): one map's nodes, sorted as Whetstone's patch draws them.
 * build.mjs works this out from data/gathering.json and puts it in the page;
 * app.ts draws it on a canvas over the site's copy of the map's texture.
 */
import { DRAW_ORDER, type NodeKind } from "whetstone/src/patches/node-map.js";

/** A node, in pixels of the 160x160 texture. */
export type PreviewPoint = [kind: NodeKind, x: number, y: number];

/** The part of data/gathering.json this reads. */
export interface GatheringLayouts {
  layouts: {
    texture?: string | null;
    areas: { nodes: { kind: NodeKind; positions?: [number, number][] | null }[] }[];
  }[];
}

/**
 * Every node on a texture, once. A texture is shared by all the quests on its
 * map, as in the game, so this takes every layout that uses it.
 */
export function nodeMapPoints(gathering: GatheringLayouts, texture: string): PreviewPoint[] {
  const points = new Map<string, PreviewPoint>();
  for (const layout of gathering.layouts) {
    if (layout.texture !== texture) continue;
    for (const { kind, positions } of layout.areas.flatMap((a) => a.nodes)) {
      for (const [px, py] of positions ?? []) {
        const x = Math.round(px);
        const y = Math.round(py);
        points.set(`${kind}|${x}|${y}`, [kind, x, y]);
      }
    }
  }
  return [...points.values()].sort(
    (a, b) => DRAW_ORDER.indexOf(a[0]) - DRAW_ORDER.indexOf(b[0]) || a[2] - b[2] || a[1] - b[1],
  );
}
