/**
 * The monster list's filter: the selector bar under a monster type's list,
 * shown with a hunter loaded, which picks out the monsters they have captured
 * or hunted (by their Guild Card counts, lib/monster-ids). The rest stay in
 * the list, dimmed.
 */
import type { MonsterRecord } from "./save-store";

export const MONSTER_FILTERS = ["all", "captured", "hunted"] as const;

export type MonsterFilterId = (typeof MONSTER_FILTERS)[number];

/** The filters on offer: Captured only for a type with a monster to capture. */
export const monsterFilters = (anyCapturable: boolean): readonly MonsterFilterId[] =>
  anyCapturable ? MONSTER_FILTERS : MONSTER_FILTERS.filter((f) => f !== "captured");

/** The filter `by` places after (1) or before (-1) `current`, wrapping around. */
export function cycleMonsterFilter(
  current: MonsterFilterId,
  by: 1 | -1,
  anyCapturable: boolean,
): MonsterFilterId {
  const filters = monsterFilters(anyCapturable);
  const i = Math.max(0, filters.indexOf(current));
  return filters[(i + by + filters.length) % filters.length]!;
}

/**
 * Whether a monster passes the filter. Captured only takes monsters that can
 * be captured (lib/monster-drops' canCapture); neither takes one the save has
 * no record for (`record` null: no game ID, or a save from before records).
 */
export function matchesMonster(
  filter: MonsterFilterId,
  capturable: boolean,
  record: Pick<MonsterRecord, "kills" | "captures"> | null,
): boolean {
  if (filter === "all") return true;
  if (!record) return false;
  return filter === "captured" ? capturable && record.captures > 0 : record.kills > 0;
}

/** The count a row shows under the filter: its captures or kills, none under All. */
export function filterCount(
  filter: MonsterFilterId,
  record: Pick<MonsterRecord, "kills" | "captures"> | null,
): number | null {
  if (!record || filter === "all") return null;
  return filter === "captured" ? record.captures : record.kills;
}
