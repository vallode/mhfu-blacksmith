/**
 * The monster list's filter: the selector bar under a monster type's list,
 * shown with a hunter loaded, which picks out the monsters they have captured
 * or hunted (by their Guild Card counts, lib/monster-ids), or whose largest or
 * smallest size record is a gold or mini crown (lib/crowns). The rest stay in
 * the list, dimmed.
 */
import { crownFor, type Crown, type Crowns } from "./crowns";
import type { MonsterRecord } from "./save-store";

export const MONSTER_FILTERS = ["all", "captured", "hunted", "gold-crown", "mini-crown"] as const;

export type MonsterFilterId = (typeof MONSTER_FILTERS)[number];

/** What a monster type has for the filters to pick out. */
export interface MonsterFilterAvailability {
  /** Some monster of the type can be captured. */
  capturable: boolean;
  /** Some monster of the type has crown sizes. */
  crowns: boolean;
}

/** The crown a crown filter picks out, or null for the other filters. */
export const filterCrown = (filter: MonsterFilterId): Crown | null =>
  filter === "gold-crown" ? "gold" : filter === "mini-crown" ? "mini" : null;

/**
 * The filters on offer: Captured only for a type with a monster to capture,
 * the crown filters only for a type with crown sizes.
 */
export const monsterFilters = (avail: MonsterFilterAvailability): readonly MonsterFilterId[] =>
  MONSTER_FILTERS.filter(
    (f) => (f !== "captured" || avail.capturable) && (!filterCrown(f) || avail.crowns),
  );

/** The filter `by` places after (1) or before (-1) `current`, wrapping around. */
export function cycleMonsterFilter(
  current: MonsterFilterId,
  by: 1 | -1,
  avail: MonsterFilterAvailability,
): MonsterFilterId {
  const filters = monsterFilters(avail);
  const i = Math.max(0, filters.indexOf(current));
  return filters[(i + by + filters.length) % filters.length]!;
}

/** The monster fields the filters read (a list row's). */
export interface FilterableMonster {
  capturable: boolean;
  crowns?: Crowns;
}

/**
 * Whether a monster passes the filter. Captured only takes monsters that can
 * be captured (lib/monster-drops' canCapture). The crown filters take a
 * monster whose largest (gold) or smallest (mini) size record earns that
 * crown; a size of 0 is no record. None takes a monster the save has no
 * record for (`record` null: no game ID, or a save from before records).
 */
export function matchesMonster(
  filter: MonsterFilterId,
  monster: FilterableMonster,
  record: Pick<MonsterRecord, "kills" | "captures" | "largest" | "smallest"> | null,
): boolean {
  if (filter === "all") return true;
  if (!record) return false;
  switch (filter) {
    case "captured":
      return monster.capturable && record.captures > 0;
    case "hunted":
      return record.kills > 0;
    case "gold-crown":
      return earnsCrown(record.largest, monster.crowns, "gold");
    case "mini-crown":
      return earnsCrown(record.smallest, monster.crowns, "mini");
  }
}

/** Whether a recorded size earns the crown; a size of 0 is no record. */
const earnsCrown = (size: number, crowns: Crowns | undefined, crown: Crown): boolean =>
  !!crowns && size > 0 && crownFor(size, crowns) === crown;

/** The filter in force: the selected one if on offer for the type, else All. */
export const activeMonsterFilter = (
  selected: MonsterFilterId,
  avail: MonsterFilterAvailability,
): MonsterFilterId => (monsterFilters(avail).includes(selected) ? selected : "all");

/**
 * The monsters a filter's match count is out of: Captured counts out of those
 * there are to capture, a crown filter out of those with crown sizes.
 */
export function filterPool<T extends FilterableMonster>(filter: MonsterFilterId, rows: T[]): T[] {
  if (filter === "captured") return rows.filter((m) => m.capturable);
  if (filterCrown(filter)) return rows.filter((m) => m.crowns);
  return rows;
}

/** The count a row shows under the filter: its captures or kills, none under All or a crown filter (which shows the crown). */
export function filterCount(
  filter: MonsterFilterId,
  record: Pick<MonsterRecord, "kills" | "captures"> | null,
): number | null {
  if (!record || (filter !== "captured" && filter !== "hunted")) return null;
  return filter === "captured" ? record.captures : record.kills;
}
