/**
 * Monster names into `data/strings`. `extract` writes the site's monster
 * names (`strings/monster-names.ts`: the disc's, and the overlay's for the
 * few it doesn't tell apart) to `monster-names.json` by emID; this renames
 * each monster `data/strings/en.json` has to them. Names are strings by ID,
 * so records, quests and drops that refer to a monster by ID follow.
 */
import { writeFileSync } from "node:fs";
import { clearStringsCache, readStringsDoc, serializeStrings, stringsPath } from "game-data";

export interface MonsterNameChange {
  id: number;
  before: string;
  after: string;
}

/** Renames `data/strings` monsters to `names` (emID -> name); returns what changed. */
export function renameMonsters(
  dataDir: string,
  names: Record<string, string>,
  dryRun = false,
): MonsterNameChange[] {
  const doc = structuredClone(readStringsDoc(dataDir));
  const monsters = (doc.monster ?? {}) as Record<string, string>;
  const changes: MonsterNameChange[] = [];
  for (const [id, before] of Object.entries(monsters)) {
    const after = names[id];
    if (after === undefined || after === before) continue;
    monsters[id] = after;
    changes.push({ id: Number(id), before, after });
  }
  if (changes.length > 0 && !dryRun) {
    writeFileSync(stringsPath(dataDir), serializeStrings(doc));
    clearStringsCache();
  }
  return changes;
}
