/**
 * The decoration list's filters: the selector bar under the list, which steps
 * through slot counts and (with a hunter loaded) the weapon tree's hunter
 * filters, and a search box that matches a jewel's name or the name of a
 * skill it gives points to.
 */
import { searchKey } from "./items";
import { matchesTreeFilter, type RowStatus } from "./tree-filter";
import type { Decoration } from "./types";

export const DECORATION_FILTERS = [
  { id: "all", label: "All" },
  { id: "slots-1", label: "1 slot", slots: 1 },
  { id: "slots-2", label: "2 slots", slots: 2 },
  { id: "slots-3", label: "3 slots", slots: 3 },
  // Only with a hunter loaded; as in the weapon tree (lib/tree-filter.ts).
  { id: "owned", label: "Owned", hunter: true },
  { id: "not-owned", label: "Not owned", hunter: true },
  { id: "craftable", label: "Craftable", hunter: true },
  { id: "within-one", label: "Within 1 material", hunter: true },
] as const;

export type DecorationFilter = (typeof DECORATION_FILTERS)[number];
export type DecorationFilterId = DecorationFilter["id"];

/** The filters on offer: the hunter ones only with a hunter loaded. */
export const decorationFilters = (hunter: boolean): readonly DecorationFilter[] =>
  hunter ? DECORATION_FILTERS : DECORATION_FILTERS.filter((f) => !("hunter" in f));

/** The filter `by` places after (1) or before (-1) `current`, wrapping around. */
export function cycleDecorationFilter(
  current: DecorationFilterId,
  by: 1 | -1,
  hunter: boolean,
): DecorationFilterId {
  const filters = decorationFilters(hunter);
  const i = Math.max(
    0,
    filters.findIndex((f) => f.id === current),
  );
  return filters[(i + by + filters.length) % filters.length]!.id;
}

/** "Attack +1" → "Attack". */
export const skillName = (skill: string) => skill.slice(0, skill.lastIndexOf(" "));

/**
 * Whether a jewel passes the selector's filter and the search box. `query`
 * matches anywhere in its name or a skill's name, ignoring case, spacing and
 * accents ("attack" finds Attack Jewel and every jewel with Attack points).
 * `status` is the jewel's row status for the loaded hunter (null without
 * one). `localName`, if given, names the jewel and its skills in the site's
 * language too (lib/i18n/game-text), so the query matches either.
 */
export function matchesDecoration(
  deco: Pick<Decoration, "name" | "slots" | "skills">,
  filterId: DecorationFilterId,
  query: string,
  status: RowStatus | null,
  localName?: (kind: "decoration" | "skill", english: string) => string,
): boolean {
  const filter = DECORATION_FILTERS.find((f) => f.id === filterId);
  if (filter && "slots" in filter && deco.slots !== filter.slots) return false;
  if (filter && "hunter" in filter && !(status && matchesTreeFilter(filter.id, status))) {
    return false;
  }
  const q = searchKey(query);
  if (!q) return true;
  const skills = (deco.skills ?? []).map(skillName);
  const names = [deco.name, ...skills];
  if (localName) {
    names.push(localName("decoration", deco.name), ...skills.map((s) => localName("skill", s)));
  }
  return names.some((s) => searchKey(s).includes(q));
}
