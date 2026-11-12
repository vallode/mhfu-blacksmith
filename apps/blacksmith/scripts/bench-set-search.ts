/**
 * Times the set builder's armor set search (src/lib/set-search.ts) on the
 * data the site ships: `pnpm --filter blacksmith bench-set-search`.
 *
 * Prints, per search, how long it took, how many sets it returned and the
 * best and worst defence among them. "4 workers" is how long it takes split
 * into four shards, as the page runs it on a machine with eight cores or
 * more: round by round, the slowest shard (they run at once). Run it before
 * and after changing the search.
 */
import { loadShippedSetData } from "../test/helpers/set-data";
import {
  mergeResults,
  prepareSearch,
  searchSets,
  SEARCH_ROUNDS,
  type SearchQuery,
  type SearchResult,
} from "../src/lib/set-search";

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
  // As useSetSearch runs it.
  const shards = [0, 1, 2, 3].map((index) => ({ index, search: prepareSearch(data, q) }));
  let parts: SearchResult[] = [];
  let parallelMs = 0;
  for (let round = 0; round < SEARCH_ROUNDS; round++) {
    parts = shards.map(({ index, search }) => {
      const started = Date.now();
      const r = search.run(round, { shard: { index, count: shards.length } });
      return { ...r, elapsedMs: Date.now() - started };
    });
    parallelMs += Math.max(...parts.map((r) => r.elapsedMs));
    if (parts.reduce((n, r) => n + r.sets.length, 0) >= (q.limit ?? 200)) break;
  }
  const merged = mergeResults(parts).sets.map((s) => s.defence);
  if (merged.join() !== defence.join()) throw new Error(`Shards disagree: ${q.skills.join(", ")}`);
  return {
    search: `${q.skills.join(" + ")} (${q.hunterType}, ${q.rank}, ${q.weaponSlots} slots${q.allowBadSkills ? ", bad skills" : ""})`,
    ms: result.elapsedMs,
    "4 workers": parallelMs,
    sets: result.sets.length,
    best: defence.length ? Math.max(...defence) : "-",
    worst: defence.length ? Math.min(...defence) : "-",
    timedOut: result.timedOut,
  };
});
console.table(rows);
console.log(`Total: ${rows.reduce((n, r) => n + r.ms, 0)} ms`);
