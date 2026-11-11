/**
 * Times the set builder's armor set search (src/lib/set-search.ts) on the
 * data the site ships: `pnpm --filter blacksmith bench-set-search`.
 *
 * Prints, per search, how long it took, how many sets it returned and the
 * best and worst defence among them. Run it before and after changing the
 * search.
 */
import { loadShippedSetData } from "../test/helpers/set-data";
import { searchSets, type SearchQuery } from "../src/lib/set-search";

const query = (skills: string[], extra: Partial<SearchQuery> = {}): SearchQuery => ({
  skills,
  hunterType: "Blademaster",
  sex: "Male",
  rank: "g-rank",
  weaponSlots: 1,
  allowBadSkills: false,
  ...extra,
});

const cases: SearchQuery[] = [
  query(["Attack Up (Small)"], { weaponSlots: 0 }),
  query(["Attack Up (Large)", "ESP"]),
  query(["Attack Up (Large)", "ESP"], { allowBadSkills: true }),
  query(["Evade +2", "Sharpness +1", "Attack Up (Small)"], { weaponSlots: 3 }),
  query(["Sharpness +1", "Art of Unsheathing", "Dragon Res +10"], { weaponSlots: 3 }),
  query(["Health +50", "Guard +2", "Auto-Guard", "Earplug"], {
    rank: "high-rank",
    weaponSlots: 2,
  }),
  query(["Reloading Speed +3", "Recoil Reduction +1"], { hunterType: "Gunner", sex: "Female" }),
  query(["Normal S All LV Add", "Reloading Speed +2", "Evade +1", "Attack Up (Small)"], {
    hunterType: "Gunner",
    weaponSlots: 2,
  }),
  query(["Earplug", "Guard +1"], { rank: "high-rank" }),
  query(["Attack Up (Large)", "ESP", "Evade +2", "Guard +2", "Earplug"], { rank: "low-rank" }),
];

const { data } = loadShippedSetData();
const rows = cases.map((q) => {
  const result = searchSets(data, q);
  const defence = result.sets.map((s) => s.defence);
  return {
    search: `${q.skills.join(" + ")} (${q.hunterType}, ${q.rank}, ${q.weaponSlots} slots${q.allowBadSkills ? ", bad skills" : ""})`,
    ms: result.elapsedMs,
    sets: result.sets.length,
    best: defence.length ? Math.max(...defence) : "-",
    worst: defence.length ? Math.min(...defence) : "-",
    timedOut: result.timedOut,
  };
});
console.table(rows);
console.log(`Total: ${rows.reduce((n, r) => n + r.ms, 0)} ms`);
