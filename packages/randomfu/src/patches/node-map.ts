/**
 * Gathering nodes on the area map: the map screen's textures
 * (`cockpit/map<N>.tmh`, 160x160, 8 bits a pixel with a 256-colour palette)
 * get a small marker where each gathering, mining and bug catching node is.
 *
 * Positions are worked out as the map screen works out the player's arrow
 * (`mhfu-extract/src/tables/map-layout.ts`), from the quests' own node
 * tables, so they are the EU disc's. A texture is shared by every quest on
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
import type { ShuffleReport } from "../shuffles/shuffle.js";

export type NodeKind = "gather" | "mine" | "bug";

/** Marker colours, RGB, as the Blacksmith site's map shows them. */
export const MARKER_COLORS: Record<NodeKind, [number, number, number]> = {
  gather: [60, 220, 90],
  mine: [255, 140, 30],
  bug: [250, 220, 40],
};

const SIZE = 160;
/** Marker width and height in pixels, odd so it has a centre. */
const MARKER = 3;
const TITLE = "Gathering nodes on the map";

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
}

/** The 160x160, 8-bit, swizzled, RGBA8888-palette texture this patch draws on, or null. */
function readArt(file: Buffer): MapArt | null {
  const found = locateIndexedImage(file);
  if (!found?.swizzled || found.paletteFormat !== 3) return null;
  if (found.width !== SIZE || found.height !== SIZE) return null;
  const raw = file.subarray(found.pixels, found.pixels + SIZE * SIZE);
  return { pixelsAt: found.pixels, paletteAt: found.palette, pixels: unswizzle(raw, SIZE, SIZE) };
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

  const half = (MARKER - 1) / 2;
  for (const { kind, x, y } of points) {
    for (let py = Math.round(y) - half; py <= Math.round(y) + half; py++) {
      for (let px = Math.round(x) - half; px <= Math.round(x) + half; px++) {
        if (px >= 0 && py >= 0 && px < SIZE && py < SIZE) pixels[py * SIZE + px] = index[kind];
      }
    }
  }
  swizzle(pixels, SIZE, SIZE).copy(out, art.pixelsAt);
  return out;
}

/**
 * The nodes on each map by texture name (`map2`), one per place, from the
 * quests a player can take. Nodes off the map's art are left out, as the
 * game doesn't draw those areas.
 */
export function collectNodePoints(
  game: GameData,
  geometry: ReadonlyMap<number, MapGeometry>,
  textures: ReadonlyMap<string, Buffer>,
): Map<string, NodePoint[]> {
  const byTexture = new Map<string, Map<string, NodePoint>>();
  const arts = new Map<string, MapArt | null>();
  for (const { parsed, file } of game.quests) {
    if (!questTier(parsed)) continue;
    const map = geometry.get(parsed.header.map);
    const name = mapTextureName(parsed.header.map);
    const texture = name && textures.get(name);
    if (!map || !name || !texture) continue;
    if (!arts.has(name)) arts.set(name, readArt(texture));
    const art = arts.get(name);
    const result = readGatheringItems(file.payload, parsed);
    if (!art || result.problem) continue;

    const points = byTexture.get(name) ?? new Map<string, NodePoint>();
    byTexture.set(name, points);
    for (const node of result.nodes) {
      const kind = NODE_KINDS[node.type];
      const pixel = projectToMap(map, node.area, node.x, node.z);
      if (!kind || !pixel) continue;
      const [x, y] = pixel;
      const opaque =
        texture[art.paletteAt + (art.pixels[Math.floor(y) * SIZE + Math.floor(x)] ?? 0) * 4 + 3]! >
        128;
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE && opaque) {
        points.set(`${kind}|${Math.round(x)}|${Math.round(y)}`, { kind, x, y });
      }
    }
  }
  return new Map(
    [...byTexture].map(([name, points]) => [
      name,
      [...points.values()].sort((a, b) => a.y - b.y || a.x - b.x),
    ]),
  );
}

/** Draws the nodes onto the map textures. Needs the EU disc and its EBOOT. */
export function addNodeMap(game: GameData, edits: Edits): ShuffleReport {
  const notWritten = (problem: string): ShuffleReport => ({
    title: TITLE,
    notes: [`Not written: ${problem}.`],
    lines: [],
  });
  if (game.region !== "eu") return notWritten("the map tables are only known on the EU disc");
  if (!game.eboot) return notWritten("the EBOOT wasn't loaded");

  let geometry: Map<number, MapGeometry>;
  try {
    geometry = readMapGeometry(new BinaryReader(game.eboot), game.gameSub.ovl);
  } catch (error) {
    return notWritten(error instanceof Error ? error.message : String(error));
  }

  const files = new Map<string, number>();
  const textures = new Map<string, Buffer>();
  for (const [index, path] of loadFileList(game.region)) {
    const name = /^cockpit\/(map\d+)\.tmh$/.exec(path)?.[1];
    if (!name || index >= game.dataBin.fileCount) continue;
    files.set(name, index);
    textures.set(name, game.dataBin.read(index));
  }
  const points = collectNodePoints(game, geometry, textures);

  let maps = 0;
  let nodes = 0;
  const left: string[] = [];
  for (const [name, list] of points) {
    const drawn = drawNodes(textures.get(name)!, list);
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
