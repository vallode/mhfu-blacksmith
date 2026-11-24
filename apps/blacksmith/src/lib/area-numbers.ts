/**
 * The number the game's map art prints for an area. data/gathering.json
 * numbers areas by their place in the map's stage list, which isn't that
 * number on every map (the Jungle's 6th stage is its area 9). The table is
 * read off the textures by scripts/generate-area-numbers.ts; a map without
 * an entry keeps the stage index.
 */
import numbers from "./area-numbers.json";

const BY_TEXTURE: Record<string, number[] | undefined> = numbers;

/** The area number on the map for a stage index (0 is the Base Camp). */
export function areaNumber(texture: string | undefined, index: number): number {
  const table = texture ? BY_TEXTURE[texture] : undefined;
  return table?.[index] ?? index;
}
