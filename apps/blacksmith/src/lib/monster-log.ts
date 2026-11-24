/**
 * The hunter's monster log (/hunter/monsters/): the monsters the save keeps a
 * record for (kills, captures or sizes), split the way the Guild Card splits
 * its hunts into large and small monsters, with each group's totals.
 */
import type { Crowns } from "./crowns";
import type { MonsterCategory } from "./constants";
import { MONSTER_GAME_IDS, monsterGameId } from "./monster-ids";
import type { MonsterRecord } from "./save-store";

/** A monster as the log lists it: enough to name it, link to it and read its sizes. */
export interface MonsterLogMonster {
  name: string;
  slug: string;
  category: MonsterCategory;
  /** The game's small monsters (data/mhfu/monsters' `small`). */
  small: boolean;
  /** The size at 100 percent, as the Guild Card shows sizes. Absent without one. */
  baseSize?: number;
  /** Guild Card crown thresholds. Absent without them. */
  crowns?: Crowns;
}

/** One monster's record in the log. */
export interface MonsterLogRow {
  monster: MonsterLogMonster;
  /** Times slain (the Guild Card's hunts, less captures). */
  kills: number;
  captures: number;
  /** Size records, in percent of `monster.baseSize`; 0 without one. */
  largest: number;
  smallest: number;
}

/** The large or small monsters in the log, and their totals. */
export interface MonsterLogGroup {
  small: boolean;
  rows: MonsterLogRow[];
  kills: number;
  captures: number;
}

/** The game IDs of the monsters the site has a page for. */
const SITE_MONSTER_IDS = new Set(Object.values(MONSTER_GAME_IDS));

/** Whether a record says anything: a hunt, a capture or a size. */
function hasRecord(record: MonsterRecord): boolean {
  return record.kills > 0 || record.captures > 0 || record.largest > 0 || record.smallest > 0;
}

/**
 * The hunter's monster log from the save's records: every monster the save
 * keeps a record for, the large monsters first, each group in the data's
 * order (`monsters`: the bestiary's types and their families). Records the
 * site has no monster for are left out, as are records that say nothing. A
 * group with no rows comes back empty.
 */
export function monsterLog(
  monsters: readonly MonsterLogMonster[],
  records: readonly MonsterRecord[] | undefined,
): MonsterLogGroup[] {
  const groups: MonsterLogGroup[] = [
    { small: false, rows: [], kills: 0, captures: 0 },
    { small: true, rows: [], kills: 0, captures: 0 },
  ];
  const byId = new Map(records?.map((record) => [record.id, record]));
  for (const monster of monsters) {
    const id = monsterGameId(monster.name);
    const record = id === undefined ? undefined : byId.get(id);
    if (!record || !hasRecord(record)) continue;
    const group = groups[monster.small ? 1 : 0]!;
    group.rows.push({
      monster,
      kills: record.kills,
      captures: record.captures,
      largest: record.largest,
      smallest: record.smallest,
    });
    group.kills += record.kills;
    group.captures += record.captures;
  }
  return groups;
}

/**
 * How many monsters the log lists: the save's records of monsters the site
 * has a page for, each with something to show. Null when the save has no
 * monster tables at all (a save stored before they were read).
 */
export function loggedMonsterCount(records: readonly MonsterRecord[] | undefined): number | null {
  if (!records) return null;
  return records.filter((record) => SITE_MONSTER_IDS.has(record.id) && hasRecord(record)).length;
}
