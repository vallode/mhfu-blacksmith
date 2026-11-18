/**
 * Map icons: the game's locale icons, at /images/maps/<icon>.png (64×64).
 * Pure, so the pages and tests share it.
 */

/**
 * A map's base name (no "(Day)"/"(Night)" or tower floor) -> its icon. The
 * game has thirteen locale icons; the arena's flag stands for the other
 * set-piece maps too (Fortress, Town, Castle Schrade, …).
 */
const MAP_ICONS: Record<string, string> = {
  "Snowy Mountains": "snowy-mountains",
  "Snowy Mountains Peak": "snowy-mountains",
  "Forest and Hills": "forest-and-hills",
  Jungle: "jungle",
  Tower: "tower",
  Swamp: "swamp",
  Volcano: "volcano",
  Desert: "desert",
  "Great Forest": "great-forest",
  "Old Volcano": "old-volcano",
  "Old Jungle": "old-jungle",
  "Old Swamp": "old-swamp",
  "Old Desert": "old-desert",
  Arena: "arena",
  "Moat Arena": "arena",
  Battleground: "arena",
  Fortress: "arena",
  Town: "arena",
  "Castle Schrade": "arena",
};

/** A map name without its time of day, size or floor: "Jungle (Night)" -> "Jungle". */
function baseMapName(map: string): string {
  return map.replace(/ \((?:Day|Night|Large|Small)\)$/, "").replace(/ \d+$/, "");
}

/** The icon's URL for a map name as data/ spells it, or null for a map without one. */
export function mapIconSrc(map: string): string | null {
  const icon = MAP_ICONS[baseMapName(map)];
  return icon ? `/images/maps/${icon}.png` : null;
}
