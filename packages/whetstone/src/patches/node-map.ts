/**
 * Gathering nodes on the area map: the map screen's textures
 * (`cockpit/map<N>.tmh`, 160x160, 8 bits a pixel with a 256-colour palette)
 * get a small marker where each gathering, mining and bug catching node is.
 *
 * Positions are worked out as the map screen works out the player's arrow
 * (`mhfu-extract/src/tables/map-layout.ts`), from the quests' own node
 * tables, on the EU and JP discs. A texture is shared by every quest on
 * its map (and by the night map), and the nodes of every quest on one map
 * sit in the same places, so each texture gets one set. Markers use palette
 * entries the art leaves unused, so nothing else changes colour, and the
 * files keep their size.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { loadFileList } from "mhfu-extract/src/container/filelist.js";
import { locateIndexedImage, swizzle, unswizzle } from "mhfu-extract/src/models/tmh.js";
import { NODE_KINDS, readGatheringItems } from "mhfu-extract/src/quests/gathering.js";
import {
  mapTextureName,
  projectToMap,
  readMapGeometry,
  type MapGeometry,
} from "mhfu-extract/src/tables/map-layout.js";
import type { Edits } from "../edits.js";
import type { GameData } from "../game/load.js";
import { questTier } from "../game/tiers.js";
import type { Report } from "../report.js";

export type NodeKind = "gather" | "mine" | "bug";

/** Marker colours, RGB, as the Blacksmith site's map shows them. */
export const MARKER_COLORS: Record<NodeKind, [number, number, number]> = {
  gather: [60, 220, 90],
  mine: [255, 140, 30],
  bug: [250, 220, 40],
};

/** The textures' width and height in pixels. */
export const MAP_SIZE = 160;
/** Marker width and height in pixels, odd so it has a centre. */
export const MARKER_SIZE = 3;
const TITLE = "Gathering nodes on the map";
/** A node is drawn only where the art's alpha is above this: the game leaves the rest blank. */
export const ON_ART_ALPHA = 128;
/**
 * How many pixels off the art a node may land and still be drawn, moved onto
 * the nearest pixel of art. Mining spots in walls land just past an area's
 * outline (Snowy Mountains area 3); an area the map doesn't draw is further.
 */
export const SNAP_TO_ART = 1;
/** Draw order: later kinds cover earlier ones where markers overlap. */
export const DRAW_ORDER: readonly NodeKind[] = ["bug", "gather", "mine"];

export interface NodePoint {
  kind: NodeKind;
  /** Pixels on the 160x160 texture. */
  x: number;
  y: number;
}

/** A texture this patch can draw on: where its pixels and palette are, and the pixels unswizzled. */
interface MapArt {
  pixelsAt: number;
  paletteAt: number;
  pixels: Buffer;
  /** The alpha of each palette entry. */
  alphas: number[];
}

/** The 160x160, 8-bit, swizzled, RGBA8888-palette texture this patch draws on, or null. */
function readArt(file: Buffer): MapArt | null {
  const found = locateIndexedImage(file);
  if (!found?.swizzled || found.paletteFormat !== 3) return null;
  if (found.width !== MAP_SIZE || found.height !== MAP_SIZE) return null;
  const raw = file.subarray(found.pixels, found.pixels + MAP_SIZE * MAP_SIZE);
  const pixels = unswizzle(raw, MAP_SIZE, MAP_SIZE);
  return {
    pixelsAt: found.pixels,
    paletteAt: found.palette,
    pixels,
    alphas: Array.from({ length: 256 }, (_, i) => file[found.palette + i * 4 + 3]!),
  };
}

/** The pixel of art nearest to (x, y), at most `SNAP_TO_ART` away, or null. */
function nearestArt(art: MapArt, x: number, y: number): [number, number] | null {
  let best: [number, number] | null = null;
  let bestDistance = Infinity;
  for (let dy = -SNAP_TO_ART; dy <= SNAP_TO_ART; dy++) {
    for (let dx = -SNAP_TO_ART; dx <= SNAP_TO_ART; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= MAP_SIZE || py >= MAP_SIZE) continue;
      if (art.alphas[art.pixels[py * MAP_SIZE + px]!]! <= ON_ART_ALPHA) continue;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        best = [px, py];
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * The texture with its markers drawn, or null if it isn't the layout this
 * expects or the art uses so many colours there are none to spare. Points
 * are drawn in `points` order; a later one covers an earlier one.
 */
export function drawNodes(file: Buffer, points: readonly NodePoint[]): Buffer | null {
  const art = readArt(file);
  if (!art) return null;
  const pixels = Buffer.from(art.pixels);

  const used = new Set(pixels);
  const spare = Array.from({ length: 256 }, (_, i) => i).filter((i) => !used.has(i));
  const kinds = Object.keys(MARKER_COLORS) as NodeKind[];
  if (spare.length < kinds.length) return null;
  const index = Object.fromEntries(kinds.map((kind, i) => [kind, spare[i]!])) as Record<
    NodeKind,
    number
  >;

  const out = Buffer.from(file);
  for (const kind of kinds) out.set([...MARKER_COLORS[kind], 255], art.paletteAt + index[kind] * 4);

  const half = (MARKER_SIZE - 1) / 2;
  for (const { kind, x, y } of points) {
    for (let py = Math.round(y) - half; py <= Math.round(y) + half; py++) {
      for (let px = Math.round(x) - half; px <= Math.round(x) + half; px++) {
        if (px >= 0 && py >= 0 && px < MAP_SIZE && py < MAP_SIZE)
          pixels[py * MAP_SIZE + px] = index[kind];
      }
    }
  }
  swizzle(pixels, MAP_SIZE, MAP_SIZE).copy(out, art.pixelsAt);
  return out;
}

/**
 * The nodes on each map by texture name (`map2`), one per place, from the
 * quests a player can take. A node just off the art is moved onto it;
 * nodes further off are left out, as the game doesn't draw those areas.
 */
export function collectNodePoints(
  game: GameData,
  geometry: ReadonlyMap<number, MapGeometry>,
  texture: (name: string) => Buffer | undefined,
): Map<string, NodePoint[]> {
  const byTexture = new Map<string, Map<string, NodePoint>>();
  const arts = new Map<string, MapArt | null>();
  for (const { parsed, file } of game.quests) {
    if (!questTier(parsed)) continue;
    const map = geometry.get(parsed.header.map);
    const name = mapTextureName(parsed.header.map);
    if (!map || !name) continue;
    if (!arts.has(name)) {
      const file = texture(name);
      arts.set(name, file ? readArt(file) : null);
    }
    const art = arts.get(name);
    if (!art) continue;
    // Quests on one map share their nodes, so this mostly re-finds the same
    // points; taking every quest's keeps a node only some quests have.
    const result = readGatheringItems(file.payload, parsed);
    if (result.problem) continue;

    const points = byTexture.get(name) ?? new Map<string, NodePoint>();
    byTexture.set(name, points);
    for (const node of result.nodes) {
      const kind = NODE_KINDS[node.type];
      const pixel = projectToMap(map, node.area, node.x, node.z);
      if (!kind || !pixel) continue;
      const at = nearestArt(art, Math.round(pixel[0]), Math.round(pixel[1]));
      if (at) points.set(`${kind}|${at[0]}|${at[1]}`, { kind, x: at[0], y: at[1] });
    }
  }
  return new Map(
    [...byTexture].map(([name, points]) => [
      name,
      [...points.values()].sort(
        (a, b) => DRAW_ORDER.indexOf(a.kind) - DRAW_ORDER.indexOf(b.kind) || a.y - b.y || a.x - b.x,
      ),
    ]),
  );
}

/** Draws the nodes onto the map textures. */
export function addNodeMap(game: GameData, edits: Edits): Report {
  const notWritten = (problem: string): Report => ({
    title: TITLE,
    notes: [`Not written: ${problem}.`],
    lines: [],
  });
  let geometry: Map<number, MapGeometry>;
  try {
    geometry = readMapGeometry(new BinaryReader(game.eboot), game.gameSub.ovl, game.region);
  } catch (error) {
    return notWritten(error instanceof Error ? error.message : String(error));
  }

  const files = new Map<string, number>();
  for (const [index, path] of loadFileList(game.region)) {
    const name = /^cockpit\/(map\d+)\.tmh$/.exec(path)?.[1];
    if (name && index < game.dataBin.fileCount) files.set(name, index);
  }
  const cache = new Map<string, Buffer>();
  const read = (name: string) => {
    const index = files.get(name);
    if (index === undefined) return undefined;
    if (!cache.has(name)) cache.set(name, game.dataBin.read(index));
    return cache.get(name);
  };
  const points = collectNodePoints(game, geometry, read);

  let maps = 0;
  let nodes = 0;
  const left: string[] = [];
  for (const [name, list] of points) {
    const drawn = drawNodes(read(name)!, list);
    if (!drawn) {
      left.push(name);
      continue;
    }
    drawn.copy(edits.dataFile(files.get(name)!));
    maps++;
    nodes += list.length;
  }

  return {
    title: TITLE,
    notes: [
      "Gathering (green), mining (orange) and bug catching (yellow) nodes are marked on the area maps.",
      "Every quest on a map shares its picture, so the marks are the map's nodes wherever the quest.",
      ...(left.length > 0
        ? [`Not drawn on ${left.join(", ")}: not the texture layout expected.`]
        : []),
    ],
    lines: [],
    summary: `${TITLE}: ${nodes} nodes on ${maps} maps`,
  };
}
