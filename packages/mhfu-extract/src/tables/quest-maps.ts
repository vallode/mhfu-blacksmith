/**
 * Quest `Map` ID -> display name. Transcribed from the inline comments on
 * `quest.hexpat`'s `GatherNodes` map-based conditional (the only place any
 * vendored source names these IDs) — see
 * vendor/mhp2g-patterns/patterns/quest.hexpat, MIT, ../../NOTICE.md.
 *
 * "(Day)"/"(Night)" are MHFU's day/night variants of the same five base
 * locales; the "Old ___" locations (26-29) and "Great Forest" (30/31) are
 * separate legacy-style maps MHFU carries over for specific quests, distinct
 * from their "(Day)"/"(Night)" counterparts of the same name.
 */
export const MAP_NAMES: Record<number, string> = {
  1: "Fortress",
  2: "Forest and Hills (Day)",
  3: "Desert (Day)",
  4: "Swamp (Day)",
  5: "Volcano (Day)",
  6: "Jungle (Day)",
  7: "Castle Schrade",
  8: "Battleground",
  9: "Arena (Large)",
  10: "Arena (Small)",
  11: "Snowy Mountains (Day)",
  12: "Town",
  13: "Tower 3",
  14: "Tower 2",
  15: "Tower 1",
  16: "Forest and Hills (Night)",
  17: "Desert (Night)",
  18: "Swamp (Night)",
  19: "Volcano (Night)",
  20: "Jungle (Night)",
  21: "Snowy Mountains (Night)",
  22: "Moat Arena",
  23: "Snowy Mountains Peak",
  26: "Old Jungle",
  27: "Old Desert",
  28: "Old Swamp",
  29: "Old Volcano",
  30: "Great Forest (Day)",
  31: "Great Forest (Night)",
};

/** Resolves a quest header's `map` byte to a display name, or null if unrecognized. */
export function resolveMapName(map: number): string | null {
  return MAP_NAMES[map] ?? null;
}
