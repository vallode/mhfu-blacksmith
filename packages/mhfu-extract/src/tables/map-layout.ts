/**
 * Where a point in a stage sits on the game's area map, read from the tables
 * the map screen draws the player's arrow with (EU disc; see the README's
 * "Area maps").
 *
 * Each stage has its own coordinates. The game adds the stage's origin
 * (`Gamestage::stage_world_tbl`) to get a position on the whole locale, then
 * scales that by the map's world size and zoom:
 *
 *   pixel = (local + origin) * zoom / size * 150 + (1 - zoom) * 76
 *
 * 150 and 76 are constants in that code (`lui 0x4316`, and half of 152).
 * Addresses are virtual; only the EU disc's have been worked out.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BinaryReader } from "../binary/reader.js";
import type { OvlFile } from "../container/ovl.js";
import { readTmh, type TmhImage } from "../models/tmh.js";
import { JP_BASE_ADDRESS } from "./offsets.js";

/** `{ f32 width, f32 depth }` by quest map ID, in the EBOOT. */
const MAP_SIZES = 0x0893887c;
/** `f32` zoom by quest map ID, in the EBOOT. */
const MAP_ZOOMS = 0x08938a7c;
/** `{ u32 count, u32 pointer to u16 stage IDs }` by quest map ID, in game_sub. */
const MAP_STAGES = 0x09ce4708;
/** 32 bytes per stage ID, starting `f32 x, f32 z`, in game_sub. */
const STAGE_ORIGINS = 0x09cdef40;
const STAGE_ORIGIN_SIZE = 32;

const MAP_COUNT = 32;
/** Night maps with no texture of their own use the day map's. */
const SHARED_TEXTURE: Readonly<Record<number, number>> = { 16: 2, 18: 4, 21: 11, 31: 30 };
/** The Tower's maps draw its floors on separate pages this formula doesn't place. */
const UNMAPPED = new Set([14, 15]);

const SCALE = 150;
const ZOOM_CENTER = 76;

export interface MapGeometry {
  width: number;
  depth: number;
  zoom: number;
  /** Stage origin by area index (the index gathering points use), as `[x, z]`. */
  origins: [number, number][];
}

export interface MapLayout extends MapGeometry {
  /** Texture name, without extension: `map2`. */
  texture: string;
  /** Whether the texture has art at this pixel. */
  onArt(u: number, v: number): boolean;
}

export type MapLayouts = ReadonlyMap<number, MapLayout>;

/** A point's pixel on its map's texture, or null for an area the map has no stage for. */
export function projectToMap(
  map: MapGeometry,
  area: number,
  x: number,
  z: number,
): [number, number] | null {
  const origin = map.origins[area];
  if (!origin) return null;
  const axis = (local: number, offset: number, size: number) =>
    ((local + offset) * map.zoom * SCALE) / size + (1 - map.zoom) * ZOOM_CENTER;
  return [axis(x, origin[0], map.width), axis(z, origin[1], map.depth)];
}

/** Each map's size, zoom and stage origins, or throws if the tables aren't where they should be. */
export function readMapGeometry(eboot: BinaryReader, gameSub: OvlFile): Map<number, MapGeometry> {
  const out = new Map<number, MapGeometry>();
  const sizes = MAP_SIZES - JP_BASE_ADDRESS;
  const zooms = MAP_ZOOMS - JP_BASE_ADDRESS;
  const sub = gameSub.reader;
  const lists = gameSub.vaddrToOffset(MAP_STAGES);
  const origins = gameSub.vaddrToOffset(STAGE_ORIGINS);
  for (let map = 1; map < MAP_COUNT; map++) {
    const count = sub.u32(lists + map * 8);
    if (count === 0) continue;
    const stages = gameSub.vaddrToOffset(sub.u32(lists + map * 8 + 4));
    out.set(map, {
      width: eboot.f32(sizes + map * 8),
      depth: eboot.f32(sizes + map * 8 + 4),
      zoom: eboot.f32(zooms + map * 4),
      origins: Array.from({ length: count }, (_, i) => {
        const at = origins + sub.u16(stages + i * 2) * STAGE_ORIGIN_SIZE;
        return [sub.f32(at), sub.f32(at + 4)] as [number, number];
      }),
    });
  }
  // Forest and Hills' size, zoom and Base Camp, and the Swamp's zoom.
  const forest = out.get(2);
  const camp = forest?.origins[0];
  if (
    forest?.width !== 45000 ||
    forest.depth !== 50000 ||
    forest.zoom !== 1 ||
    forest.origins.length !== 13 ||
    camp?.[0] !== 11400 ||
    camp[1] !== 37000 ||
    out.get(4)?.zoom !== Math.fround(0.9)
  ) {
    throw new Error("the map tables aren't at their EU addresses");
  }
  return out;
}

function hasArt(image: TmhImage, u: number, v: number): boolean {
  const x = Math.floor(u);
  const y = Math.floor(v);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
  return image.rgba[(y * image.width + x) * 4 + 3]! > 128;
}

/** The texture file for a map, or null for a map with none the formula can place points on. */
export function mapTextureName(map: number): string | null {
  return UNMAPPED.has(map) ? null : `map${SHARED_TEXTURE[map] ?? map}`;
}

export const mapTextureFile = (name: string) => path.join("data-bin", "cockpit", `${name}.tmh`);

/** Every map that has a texture and stages, ready to place points on. */
export async function loadMapLayouts(
  unpackedDir: string,
  eboot: BinaryReader,
  gameSub: OvlFile,
): Promise<Map<number, MapLayout>> {
  const out = new Map<number, MapLayout>();
  for (const [map, geometry] of readMapGeometry(eboot, gameSub)) {
    const texture = mapTextureName(map);
    if (!texture) continue;
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(unpackedDir, mapTextureFile(texture)));
    } catch (error) {
      // No texture for this map (the map menu's own pictures).
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const [art] = readTmh(bytes);
    if (!art) throw new Error(`${texture} has no image.`);
    out.set(map, { ...geometry, texture, onArt: (u, v) => hasArt(art, u, v) });
  }
  if (!out.has(2)) throw new Error(`no ${mapTextureFile("map2")} in ${unpackedDir}`);
  return out;
}
