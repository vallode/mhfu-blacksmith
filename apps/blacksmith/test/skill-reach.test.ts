/**
 * Skills within reach (lib/skill-reach.ts), on the data the site ships:
 * what it reports agrees with full searches (lib/set-search.ts).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { prepareSearch, SEARCH_ROUNDS, searchSets, type SearchQuery } from "../src/lib/set-search";
import { reachableSkills, reachCandidates } from "../src/lib/skill-reach";
import { loadShippedSetData } from "./helpers/set-data";

const query = (skills: string[], extra: Partial<SearchQuery> = {}): SearchQuery => ({
  skills,
  hunterType: "Blademaster",
  sex: "Male",
  rank: "g-rank",
  weaponSlots: 3,
  allowBadSkills: false,
  ...extra,
});

/** Does a full search find a set for `skills`? */
const hasSet = (q: SearchQuery, skills: string[]) =>
  searchSets(loadShippedSetData().data, { ...q, skills, limit: 1 }).sets.length > 0;

describe("skill reach", () => {
  test("a first-only search stops at a set that activates the skills", () => {
    const { data } = loadShippedSetData();
    const q = query(["Attack Up (Large)", "ESP"]);
    const result = prepareSearch(data, { ...q, limit: 5 }).run(SEARCH_ROUNDS - 1, {
      firstOnly: true,
    });
    assert.equal(result.sets.length, 1);
    assert.equal(result.timedOut, false);
    const names = result.sets[0].skills.map((s) => s.name);
    assert.ok(names.includes("Attack Up (Large)") && names.includes("ESP"));
    assert.ok(
      result.sets[0].skills.every((s) => s.threshold > 0),
      "no bad skill",
    );
  });

  test("agrees with full searches, level by level", () => {
    const { data } = loadShippedSetData();
    const q = query(["Evade +2", "Sharpness +1", "Attack Up (Small)"]);
    const reach = reachableSkills(data, q);
    assert.equal(reach.base, "ok");
    assert.ok(reach.trees.length > 0);
    const byTree = new Map(reach.trees.map((t) => [t.tree, t.skills]));
    for (const { tree, levels } of reachCandidates(data.trees, q.skills)) {
      const others = q.skills.filter((n) => !tree.skills.some((s) => s.name === n));
      const found = byTree.get(tree.tree) ?? [];
      assert.deepEqual(found, levels.slice(0, found.length), `${tree.tree}: weakest first`);
      for (const level of found) assert.ok(hasSet(q, [...others, level]), level);
      // The next level up has no set, or every level was within reach.
      const next = levels[found.length];
      if (next) assert.ok(!hasSet(q, [...others, next]), `${next} should be out of reach`);
    }
  });

  test("raises a wanted skill when a set has the stronger level", () => {
    const { data } = loadShippedSetData();
    const reach = reachableSkills(data, query(["Attack Up (Small)"]));
    const attack = reach.trees.find((t) => t.skills.includes("Attack Up (Medium)"));
    assert.ok(attack, "Attack Up (Medium) is within reach of Attack Up (Small)");
    assert.ok(!attack.skills.includes("Attack Up (Small)"), "the wanted level isn't listed");
  });

  test("nothing is within reach of skills no set activates", () => {
    const { data } = loadShippedSetData();
    const q = query(["Health +50", "Guard +2", "Auto-Guard", "Earplug"], {
      rank: "high-rank",
      weaponSlots: 2,
    });
    assert.ok(!hasSet(q, q.skills));
    assert.deepEqual(reachableSkills(data, q), { base: "none", trees: [] });
  });

  test("with no skills chosen, lists what any set can activate", () => {
    const { data } = loadShippedSetData();
    const reach = reachableSkills(data, query([], { rank: "low-rank", weaponSlots: 0 }));
    assert.equal(reach.base, "ok");
    assert.ok(reach.trees.some((t) => t.skills.includes("Attack Up (Small)")));
  });
});
