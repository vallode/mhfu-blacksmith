/**
 * The armor set search (lib/set-search.ts): small hand-made sets for the
 * decoration and Torso Up rules, and real searches over data/ that check
 * every returned set actually activates what was asked for.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { ARMOR_RANKS, ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "../src/lib/constants";
import { armorSlugs, slugify } from "../src/lib/slug";
import {
  activeSkill,
  cantWear,
  evaluateSet,
  mergeResults,
  parseDecorationSkill,
  prepareSearch,
  prepareSearchData,
  SEARCH_ROUNDS,
  searchSets,
  setScore,
  treeNameIndex,
  type ArmorInput,
  type ArmorSet,
  type DecorationInput,
  type SearchData,
  type SearchQuery,
  type SearchResult,
  type SkillTreeData,
} from "../src/lib/set-search";
import { DATA_DIR } from "../src/lib/paths";
import { loadShippedSetData } from "./helpers/set-data";

const dataDir = DATA_DIR;
const readJson = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8")) as T;

const trees = readJson<{ skills: SkillTreeData[] }>("skills.json").skills;

function realData(): SearchData {
  const armor: ArmorInput[] = [];
  for (const slot of ARMOR_SLOTS) {
    type Raw = {
      name: string;
      rank: ArmorRank;
      defence?: number;
      slots?: number;
      sex?: string;
      hunter_type?: string;
      skills?: { name: string; amount: number }[];
    };
    const all = readJson<{ armor: Raw[] }>(`armor/${slot}.json`).armor;
    for (const rank of ARMOR_RANKS) {
      const pieces = all.filter((p) => p.rank === rank);
      const slugs = armorSlugs(pieces);
      pieces.forEach((p, i) =>
        armor.push({
          slot,
          rank,
          name: p.name,
          slug: slugs[i],
          defence: p.defence,
          slots: p.slots,
          sex: p.sex,
          hunterType: p.hunter_type,
          skills: p.skills,
        }),
      );
    }
  }
  const decorations = readJson<{ decorations: (DecorationInput & { name: string })[] }>(
    "decorations.json",
  ).decorations.map((d) => ({ ...d, slug: slugify(d.name) }));
  return prepareSearchData(trees, armor, decorations);
}

/**
 * Every wanted skill is active, the decorations fit their slots, and so do
 * the set's alternatives (each swapped in on its own).
 */
function assertValid(data: SearchData, set: ArmorSet, query: SearchQuery) {
  assertSetValid(data, set, query);
  set.alternatives.forEach((alts, i) => {
    for (const alt of alts) {
      const pieces = set.pieces.map((p, j) => (j === i ? alt : p));
      assertSetValid(data, { ...set, pieces }, query);
    }
  });
}

function assertSetValid(
  data: SearchData,
  set: Pick<ArmorSet, "pieces" | "decorations">,
  query: SearchQuery,
) {
  const again = evaluateSet(data, set.pieces, set.decorations, query.weaponSlots);
  for (const name of query.skills) {
    assert.ok(
      again.skills.some((s) => {
        const tree = data.trees.find((t) => t.tree === s.tree)!;
        const want = tree.skills.find((x) => x.name === name);
        return want !== undefined && s.points >= want.points;
      }),
      `${name} not active in ${set.pieces.map((p) => p.name).join(", ")}`,
    );
  }
  const capacity: Record<string, number> = { weapon: query.weaponSlots };
  for (const p of set.pieces) capacity[p.slot] = p.slots;
  for (const d of set.decorations) capacity[d.bin] -= d.deco.slots;
  for (const [bin, free] of Object.entries(capacity)) {
    assert.ok(free >= 0, `too many decorations in ${bin}`);
  }
  if (!query.allowBadSkills) {
    assert.ok(
      again.skills.every((s) => s.threshold > 0),
      "has a bad skill",
    );
  }
  for (const p of set.pieces) {
    assert.ok(p.sex === "Both" || p.sex === query.sex);
    assert.ok(p.hunterType === "Both" || p.hunterType === query.hunterType);
    assert.ok(ARMOR_RANKS.indexOf(p.rank) <= ARMOR_RANKS.indexOf(query.rank));
  }
}

describe("skill table", () => {
  test("every armor and decoration skill tree is in data/skills.json", () => {
    const names = treeNameIndex(trees);
    const missing = new Set<string>();
    for (const slot of ARMOR_SLOTS) {
      for (const p of readJson<{ armor: { skills?: { name: string }[] }[] }>(`armor/${slot}.json`)
        .armor) {
        for (const s of p.skills ?? []) if (!names.has(s.name)) missing.add(s.name);
      }
    }
    for (const d of readJson<{ decorations: { skills: string[] }[] }>("decorations.json")
      .decorations) {
      for (const s of d.skills) {
        const parsed = parseDecorationSkill(s);
        if (parsed && !names.has(parsed.name)) missing.add(parsed.name);
      }
    }
    assert.deepEqual([...missing], []);
  });

  test("activeSkill picks the strongest threshold reached", () => {
    const attack = trees.find((t) => t.tree === "Attack")!;
    assert.equal(activeSkill(attack, 9), null);
    assert.equal(activeSkill(attack, 10)?.name, "Attack Up (Small)");
    assert.equal(activeSkill(attack, 24)?.name, "Attack Up (Large)");
    assert.equal(activeSkill(attack, -15)?.name, "Attack Down (Medium)");
  });
});

// ---------------------------------------------------------------------------
// Hand-made sets
// ---------------------------------------------------------------------------
const tiny: SkillTreeData[] = [
  { tree: "Attack", skills: [{ name: "Attack Up (Small)", points: 10 }] },
  { tree: "Guard", skills: [{ name: "Guard +1", points: 10 }] },
  { tree: "Torso Inc", skills: [{ name: "Torso Inc", points: 10 }] },
];

function piece(slot: ArmorSlot, name: string, extra: Partial<ArmorInput> = {}): ArmorInput {
  return { slot, rank: "low-rank", name, slug: slugify(name), defence: 1, ...extra };
}

const filler = (slots = 0): ArmorInput[] =>
  (["helmet", "plate", "gauntlets", "waist", "leggings"] as const).map((s) =>
    piece(s, `Plain ${s}`, { slots }),
  );

const query = (skills: string[], extra: Partial<SearchQuery> = {}): SearchQuery => ({
  skills,
  hunterType: "Blademaster",
  sex: "Male",
  rank: "g-rank",
  weaponSlots: 0,
  allowBadSkills: true,
  ...extra,
});

describe("searchSets (hand-made)", () => {
  test("fills slots with decorations, largest piece slots first", () => {
    const data = prepareSearchData(tiny, filler(3), [
      { name: "Attack Jewel", slug: "attack-jewel", slots: 1, skills: ["Attack +1"] },
      { name: "Fierce Jewel", slug: "fierce-jewel", slots: 2, skills: ["Attack +3"] },
    ]);
    // 5 pieces x 3 slots: five Fierce + five Attack = 20 points; 10 needs
    // three Fierce + one Attack.
    const result = searchSets(data, query(["Attack Up (Small)"]));
    assert.equal(result.sets.length, 1);
    const points = result.sets[0].totals.Attack;
    assert.ok(points >= 10, `got ${points}`);
  });

  test("a decoration must fit in one piece's slots", () => {
    const data = prepareSearchData(tiny, filler(1), [
      { name: "Big Jewel", slug: "big-jewel", slots: 2, skills: ["Attack +10"] },
    ]);
    // Five free slots but no piece with two of them.
    assert.equal(searchSets(data, query(["Attack Up (Small)"])).sets.length, 0);
    // A two-slot weapon can hold it.
    const withWeapon = searchSets(data, query(["Attack Up (Small)"], { weaponSlots: 2 }));
    assert.equal(withWeapon.sets.length, 1);
    assert.deepEqual(
      withWeapon.sets[0].decorations.map((d) => d.bin),
      ["weapon"],
    );
  });

  test("Torso Up pieces copy the torso, decorations included", () => {
    const armor = [
      ...filler(0).filter((p) => p.slot !== "plate" && p.slot !== "helmet"),
      piece("plate", "Strong Mail", { slots: 1, skills: [{ name: "Attack", amount: 3 }] }),
      piece("helmet", "Belt Helm", { skills: [{ name: "Torso Inc", amount: 1 }] }),
      piece("helmet", "Plain helmet"),
    ];
    const data = prepareSearchData(tiny, armor, [
      { name: "Attack Jewel", slug: "attack-jewel", slots: 1, skills: ["Attack +2"] },
    ]);
    // (3 + 2) x 2 = 10 only with the Torso Up helmet.
    const result = searchSets(data, query(["Attack Up (Small)"]));
    assert.equal(result.sets.length, 1);
    const [set] = result.sets;
    assert.equal(set.pieces[0].name, "Belt Helm");
    assert.equal(set.totals.Attack, 10);
    assert.deepEqual(
      set.decorations.map((d) => d.bin),
      ["plate"],
    );
  });

  test("rejects sets with bad skills unless allowed", () => {
    const tree: SkillTreeData[] = [
      ...tiny,
      { tree: "Defense", skills: [{ name: "Defense -20", points: -10 }] },
    ];
    const data = prepareSearchData(
      tree,
      [
        ...filler(0).filter((p) => p.slot !== "helmet"),
        piece("helmet", "Sharp Helm", {
          skills: [
            { name: "Attack", amount: 10 },
            { name: "Defense", amount: -10 },
          ],
        }),
      ],
      [],
    );
    assert.equal(searchSets(data, query(["Attack Up (Small)"])).sets.length, 1);
    assert.equal(
      searchSets(data, query(["Attack Up (Small)"], { allowBadSkills: false })).sets.length,
      0,
    );
  });

  test("leaves out pieces beyond the quest progress", () => {
    const armor = [
      ...filler(0).filter((p) => p.slot !== "helmet"),
      piece("helmet", "Early Helm", {
        skills: [{ name: "Attack", amount: 10 }],
        minRank: { rank: "low-rank", stars: 2 },
      }),
      piece("helmet", "Late Helm", {
        defence: 50,
        skills: [{ name: "Attack", amount: 10 }],
        minRank: { rank: "high-rank", stars: 6 },
      }),
    ];
    const data = prepareSearchData(tiny, armor, []);
    const names = (progress: SearchQuery["progress"]) =>
      searchSets(data, query(["Attack Up (Small)"], { progress })).sets.flatMap((s) => [
        s.pieces[0].name,
        ...s.alternatives[0].map((p) => p.name),
      ]);
    assert.deepEqual(names(null), ["Late Helm", "Early Helm"]);
    assert.deepEqual(names({ rank: "high-rank", stars: 6 }), ["Late Helm", "Early Helm"]);
    assert.deepEqual(names({ rank: "low-rank", stars: 3 }), ["Early Helm"]);
    assert.deepEqual(names({ rank: "low-rank", stars: 1 }), []);
  });

  test("leaves out decorations beyond the quest progress", () => {
    const decos: DecorationInput[] = [
      {
        name: "Late Jewel",
        slug: "late-jewel",
        slots: 1,
        skills: ["Attack +10"],
        minRank: { rank: "g-rank", stars: 8 },
      },
    ];
    const data = prepareSearchData(tiny, filler(1), decos);
    const found = (progress: SearchQuery["progress"]) =>
      searchSets(data, query(["Attack Up (Small)"], { progress })).sets.length;
    assert.equal(found(null), 1);
    assert.equal(found({ rank: "g-rank", stars: 8 }), 1);
    assert.equal(found({ rank: "high-rank", stars: 9 }), 0);
  });

  test("keeps a higher-defence piece with fewer points that still does the job", () => {
    const armor = [
      ...filler(0).filter((p) => p.slot !== "helmet"),
      piece("helmet", "Sharp Helm", { defence: 1, skills: [{ name: "Attack", amount: 12 }] }),
      piece("helmet", "Sturdy Helm", { defence: 50, skills: [{ name: "Attack", amount: 10 }] }),
    ];
    const data = prepareSearchData(tiny, armor, []);
    const result = searchSets(data, query(["Attack Up (Small)"]));
    assert.deepEqual(
      result.sets.map((s) => s.pieces[0].name),
      ["Sturdy Helm", "Sharp Helm"],
    );
  });

  test("uses a piece's points to cancel a decoration's bad skill", () => {
    const tree: SkillTreeData[] = [
      ...tiny,
      { tree: "Defense", skills: [{ name: "Defense -20", points: -10 }] },
    ];
    const armor = [
      ...filler(1).filter((p) => p.slot !== "helmet"),
      piece("helmet", "Plain Helm", { defence: 10, slots: 1 }),
      piece("helmet", "Guarded Helm", {
        defence: 5,
        slots: 1,
        skills: [{ name: "Defense", amount: 2 }],
      }),
    ];
    const decos: DecorationInput[] = [
      { name: "Rash Jewel", slug: "rash-jewel", slots: 1, skills: ["Attack +2", "Defense -2"] },
    ];
    const data = prepareSearchData(tree, armor, decos);
    // Five Rash Jewels: Defense -10 unless the Guarded Helm brings it to -8.
    const result = searchSets(data, query(["Attack Up (Small)"], { allowBadSkills: false }));
    assert.equal(result.sets.length, 1);
    assert.equal(result.sets[0].pieces[0].name, "Guarded Helm");
    assert.equal(result.sets[0].totals.Defense, -8);
    // With bad skills allowed, the Plain Helm's defence wins.
    const anyway = searchSets(data, query(["Attack Up (Small)"]));
    assert.equal(anyway.sets[0].pieces[0].name, "Plain Helm");
  });

  test("locks and excludes pieces", () => {
    const armor = [
      ...filler(0).filter((p) => p.slot !== "helmet"),
      piece("helmet", "Sharp Helm", { defence: 1, skills: [{ name: "Attack", amount: 10 }] }),
      piece("helmet", "Sturdy Helm", { defence: 50, skills: [{ name: "Attack", amount: 10 }] }),
      piece("helmet", "Late Helm", {
        defence: 5,
        rank: "g-rank",
        skills: [{ name: "Attack", amount: 10 }],
      }),
    ];
    const data = prepareSearchData(tiny, armor, []);
    const id = (name: string) => data.pieces.find((p) => p.name === name)!.id;
    const helms = (extra: Partial<SearchQuery>) =>
      searchSets(data, query(["Attack Up (Small)"], extra)).sets.flatMap((s) => [
        s.pieces[0].name,
        ...s.alternatives[0].map((p) => p.name),
      ]);
    assert.deepEqual(helms({}), ["Sturdy Helm", "Late Helm", "Sharp Helm"]);
    assert.deepEqual(helms({ excludePieces: [id("Sturdy Helm")] }), ["Late Helm", "Sharp Helm"]);
    assert.deepEqual(helms({ lockPieces: [id("Sharp Helm")] }), ["Sharp Helm"]);
    // A locked piece is used whatever the rank.
    assert.deepEqual(helms({ lockPieces: [id("Late Helm")], rank: "low-rank" }), ["Late Helm"]);
    assert.deepEqual(helms({ rank: "low-rank" }), ["Sturdy Helm", "Sharp Helm"]);
  });

  test("says why a hunter can't wear a piece", () => {
    const gunner = { hunterType: "Gunner", sex: "Female" } as const;
    assert.equal(cantWear({ hunterType: "Both", sex: "Both" }, gunner), null);
    assert.equal(cantWear({ hunterType: "Gunner", sex: "Female" }, gunner), null);
    assert.equal(cantWear({ hunterType: "Blademaster", sex: "Both" }, gunner), "Blademaster only");
    assert.equal(cantWear({ hunterType: "Both", sex: "Male" }, gunner), "Male only");
  });

  test("ignores a locked piece the hunter can't wear", () => {
    const armor = [
      ...filler(0).filter((p) => p.slot !== "helmet"),
      piece("helmet", "Blade Helm", {
        hunterType: "Blademaster",
        skills: [{ name: "Attack", amount: 10 }],
      }),
      piece("helmet", "Any Helm", { skills: [{ name: "Attack", amount: 10 }] }),
    ];
    const data = prepareSearchData(tiny, armor, []);
    const blade = data.pieces.find((p) => p.name === "Blade Helm")!.id;
    const helms = (extra: Partial<SearchQuery>) =>
      searchSets(data, query(["Attack Up (Small)"], { lockPieces: [blade], ...extra })).sets.map(
        (s) => s.pieces[0].name,
      );
    assert.deepEqual(helms({}), ["Blade Helm"]);
    // A Gunner can't wear it: the slot is open again.
    assert.deepEqual(helms({ hunterType: "Gunner" }), ["Any Helm"]);
  });

  test("decoration negatives count against other wanted skills", () => {
    const armor = [
      ...filler(0).filter((p) => p.slot !== "plate"),
      piece("plate", "Guard Mail", { slots: 3, skills: [{ name: "Guard", amount: 10 }] }),
    ];
    const decos: DecorationInput[] = [
      { name: "Fierce Jewel", slug: "fierce-jewel", slots: 3, skills: ["Attack +10", "Guard -1"] },
    ];
    const data = prepareSearchData(tiny, armor, decos);
    assert.equal(searchSets(data, query(["Attack Up (Small)"])).sets.length, 1);
    assert.equal(searchSets(data, query(["Attack Up (Small)", "Guard +1"])).sets.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Brute force: on small random inputs, the search finds a set exactly when
// trying every piece combination and decoration placement does.
// ---------------------------------------------------------------------------
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// A, B and C can be wanted; D only ever hurts. Each has a bad skill at -10.
const randomTrees: SkillTreeData[] = ["A", "B", "C", "D"].map((t) => ({
  tree: t,
  skills: [10, 15, -10].map((points) => ({ name: `${t}${points}`, points })),
}));
randomTrees.push({ tree: "Torso Inc", skills: [{ name: "Torso Inc", points: 10 }] });
const RANDOM_TREES = ["A", "B", "C", "D"];

/**
 * Every points vector the decorations can add to these bins; with
 * `withSlots`, each followed by minus the slots it takes. `cache` keeps the
 * vectors for each run of bins seen, for the next call.
 */
function decoVectors(
  data: SearchData,
  bins: { size: number; mult: number }[],
  trees: string[],
  withSlots: boolean,
  cache = new Map<string, number[][]>(),
) {
  const zero = () => [...trees.map(() => 0), ...(withSlots ? [0] : [])];
  const fills = (size: number): number[][] => {
    // Multisets of decorations that fit in `size` slots.
    const out: number[][] = [zero()];
    const go = (from: number, left: number, acc: number[]) => {
      for (let d = from; d < data.decorations.length; d++) {
        const deco = data.decorations[d];
        if (deco.slots > left) continue;
        const next = [
          ...trees.map((t, i) => acc[i] + (deco.points[t] ?? 0)),
          ...(withSlots ? [acc[trees.length] - deco.slots] : []),
        ];
        out.push(next);
        go(d, left - deco.slots, next);
      }
    };
    go(0, size, zero());
    return out;
  };
  let reach = [zero()];
  let key = "";
  for (const bin of bins) {
    key += `${bin.size}x${bin.mult},`;
    const cached = cache.get(key);
    if (cached) {
      reach = cached;
      continue;
    }
    const next = new Map<string, number[]>();
    for (const v of reach) {
      for (const f of fills(bin.size)) {
        const w = v.map((x, i) => x + f[i] * (i < trees.length ? bin.mult : 1));
        // For the same points, fewer slots is all that matters.
        const key = w.slice(0, trees.length).join();
        const seen = next.get(key);
        if (!seen || (withSlots && seen[trees.length] < w[trees.length])) next.set(key, w);
      }
    }
    reach = [...next.values()];
    cache.set(key, reach);
  }
  return reach;
}

/**
 * The best score (setScore, for the query's sort) of any set that answers
 * the query, trying every piece combination and decoration placement;
 * -Infinity when there is none.
 */
function bruteForce(data: SearchData, q: SearchQuery): number {
  const need = new Map(
    q.skills.map((s) => {
      const tree = randomTrees.find((t) => t.skills.some((x) => x.name === s))!;
      return [tree.tree, tree.skills.find((x) => x.name === s)!.points] as const;
    }),
  );
  // With bad skills allowed, only the wanted trees matter.
  const trees = q.allowBadSkills ? [...need.keys()] : RANDOM_TREES;
  const ok = (tree: string, points: number) =>
    need.has(tree) ? points >= need.get(tree)! : points > -10;
  type P = (typeof data.pieces)[number];
  const score = (combo: P[], freeSlots: number) =>
    setScore(
      {
        defence: combo.reduce((n, p) => n + p.defence, 0),
        res: [0, 1, 2, 3, 4].map((i) => combo.reduce((n, p) => n + p.res[i], 0)),
        freeSlots,
      },
      q.sort,
    );
  const capacity = (combo: P[]) => combo.reduce((n, p) => n + p.slots, q.weaponSlots);

  const bySlot = ARMOR_SLOTS.map((slot) => data.pieces.filter((p) => p.slot === slot));
  let combos: P[][] = [[]];
  for (const pieces of bySlot) combos = combos.flatMap((c) => pieces.map((p) => [...c, p]));
  // Best possible first: with every slot free.
  const bound = (c: P[]) => score(c, capacity(c));
  combos.sort((a, b) => bound(b) - bound(a));

  const fills = new Map<string, number[][]>();
  const slotFills = new Map<string, number[][]>();
  const bySlots = new WeakSet<number[][]>();
  // The most decorations in one piece of each size can add to each tree.
  const most = [0, 1, 2, 3].map((size) => {
    const all = decoVectors(data, [{ size, mult: 1 }], trees, false);
    return trees.map((_, k) => Math.max(...all.map((v) => v[k])));
  });
  let best = -Infinity;
  for (const combo of combos) {
    if (bound(combo) <= best) break;
    const plate = combo[1];
    const torsoUps = combo.filter((p) => p.torsoUp && p.slot !== "plate").length;
    const armor = trees.map((t) =>
      combo.reduce(
        (sum, p) =>
          sum + (p.torsoUp ? 0 : (p.points[t] ?? 0) * (p.slot === "plate" ? 1 + torsoUps : 1)),
        0,
      ),
    );
    const bins = [
      { size: q.weaponSlots, mult: 1 },
      ...combo.map((p) => ({ size: p.slots, mult: p === plate ? 1 + torsoUps : 1 })),
    ];
    const works = (v: number[]) => trees.every((t, k) => ok(t, armor[k] + v[k]));
    // Skip the combination when even the most each tree can get isn't enough.
    const ceiling = trees.map((_, k) => bins.reduce((n, b) => n + b.mult * most[b.size][k], 0));
    if (!works(ceiling)) continue;
    if (q.sort !== "slots") {
      // The score doesn't depend on the decorations.
      if (decoVectors(data, bins, trees, false, fills).some(works)) return score(combo, 0);
      continue;
    }
    // Fewest slots first: the first that works leaves the most free.
    const vectors = decoVectors(data, bins, trees, true, slotFills);
    if (!bySlots.has(vectors)) {
      vectors.sort((x, y) => y[trees.length] - x[trees.length]);
      bySlots.add(vectors);
    }
    const v = vectors.find(works);
    if (v) best = Math.max(best, score(combo, capacity(combo) + v[trees.length]));
  }
  return best;
}

describe("searchSets (brute force)", () => {
  const random = rng(42);
  const outcomes = new Set<boolean>();
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  for (let trial = 0; trial < 60; trial++) {
    const armor: ArmorInput[] = [];
    for (const slot of ARMOR_SLOTS) {
      for (let i = 0; i < 4; i++) {
        const torsoUp = slot !== "plate" && random() < 0.15;
        armor.push(
          piece(slot, `${slot} ${i}`, {
            defence: int(1, 30),
            res: [0, 1, 2, 3, 4].map(() => int(-3, 3)),
            slots: torsoUp ? 0 : int(0, 3),
            skills: torsoUp
              ? [{ name: "Torso Inc", amount: 1 }]
              : [
                  ...["A", "B", "C"].map((t) => ({ name: t, amount: int(-2, 5) })),
                  { name: "D", amount: int(-4, 3) },
                ],
          }),
        );
      }
    }
    const decorations: DecorationInput[] = [
      ...[1, 2, 3].flatMap((size) =>
        ["A", "B"].map((t) => ({
          name: `${t}${size}`,
          slug: `${t}${size}`,
          slots: size,
          skills: [
            `${t} +${size + int(0, 2)}`,
            `${random() < 0.5 ? "D" : t === "A" ? "B" : "C"} -${int(0, 2)}`,
          ],
        })),
      ),
      { name: "D1", slug: "d1", slots: 1, skills: ["D +2", "C -1"] },
    ];
    const data = prepareSearchData(randomTrees, armor, decorations);
    const skills = ["A", "B", "C"]
      .filter(() => random() < 0.7)
      .map((t) => `${t}${random() < 0.5 ? 10 : 15}`);
    if (skills.length === 0) continue;
    const weaponSlots = int(0, 3);
    const sort = (["defence", "fire", "slots"] as const)[trial % 3];
    const best = (r: SearchResult) => (r.sets[0] ? setScore(r.sets[0], sort) : -Infinity);

    for (const allowBadSkills of [true, false]) {
      const q = query(skills, { weaponSlots, allowBadSkills, sort });
      const name = `trial ${trial}: ${skills.join(" + ")} by ${sort}`;
      test(`${name}${allowBadSkills ? "" : ", no bad skills"}`, () => {
        const expected = bruteForce(data, q);
        outcomes.add(expected > -Infinity);
        const result = searchSets(data, q);
        assert.equal(best(result), expected, "best set");
        for (const set of result.sets) assertValid(data, set, q);
        // Best first.
        for (let i = 1; i < result.sets.length; i++) {
          assert.ok(setScore(result.sets[i - 1], sort) >= setScore(result.sets[i], sort));
        }
        // Keeping only the best set still finds it.
        const top = searchSets(data, { ...q, limit: 1 });
        assert.equal(best(top), expected, "best set, limit 1");
        // So do three workers with a shard each.
        const shards = [0, 1, 2].map((index) =>
          searchSets(data, { ...q, limit: 3 }, { shard: { index, count: 3 } }),
        );
        assert.deepEqual(
          mergeResults(shards, 3, sort).sets.map((s) => setScore(s, sort)),
          searchSets(data, { ...q, limit: 3 }).sets.map((s) => setScore(s, sort)),
          "shards",
        );
      });
    }
  }

  test("the trials include sets that exist and sets that don't", () => {
    assert.deepEqual([...outcomes].sort(), [false, true]);
  });
});

// ---------------------------------------------------------------------------
// Real data
// ---------------------------------------------------------------------------
describe("searchSets (data/)", () => {
  const data = realData();

  const cases: SearchQuery[] = [
    query(["Attack Up (Large)", "ESP"], { weaponSlots: 1 }),
    query(["Evade +2", "Sharpness +1", "Attack Up (Small)"], { weaponSlots: 3, limit: 50 }),
    query(["Reloading Speed +3", "Recoil Reduction +1"], {
      hunterType: "Gunner",
      sex: "Female",
      limit: 50,
    }),
    query(["Earplug", "Guard +1"], { rank: "high-rank", allowBadSkills: false, limit: 50 }),
  ];

  for (const q of cases) {
    test(`${q.skills.join(" + ")} (${q.hunterType}, ${q.rank})`, () => {
      const result = searchSets(data, q);
      assert.equal(result.timedOut, false, "timed out");
      assert.deepEqual(result.unknownSkills, []);
      assert.ok(result.sets.length > 0, "found no sets");
      for (const set of result.sets) assertValid(data, set, q);
      const shards = [0, 1, 2, 3].map((index) =>
        searchSets(data, q, { shard: { index, count: 4 } }),
      );
      assert.deepEqual(
        mergeResults(shards, q.limit).sets.map((s) => s.defence),
        result.sets.map((s) => s.defence),
        "shards",
      );
      // Sorted by defence.
      for (let i = 1; i < result.sets.length; i++) {
        assert.ok(result.sets[i - 1].defence >= result.sets[i].defence);
      }
    });
  }

  test("sorts by a resistance", () => {
    const shipped = loadShippedSetData().data;
    const q = query(["Attack Up (Large)", "ESP"], { weaponSlots: 1, sort: "fire", limit: 20 });
    const result = searchSets(shipped, q);
    assert.equal(result.sets.length, 20);
    for (const set of result.sets) assertValid(shipped, set, q);
    for (let i = 1; i < result.sets.length; i++) {
      assert.ok(setScore(result.sets[i - 1], "fire") >= setScore(result.sets[i], "fire"));
    }
    const byDefence = searchSets(shipped, { ...q, sort: "defence" });
    assert.ok(result.sets[0].res[0] >= Math.max(...byDefence.sets.map((s) => s.res[0])));
    assert.ok(result.sets[0].res[0] > byDefence.sets[0].res[0], "fire res should beat defence");
  });

  test("sorts by free slots", () => {
    const shipped = loadShippedSetData().data;
    // The bounds count the slots the decorations need: without that, this
    // ran out of time with no sets.
    const q = query(["Attack Up (Large)", "ESP"], {
      weaponSlots: 1,
      sort: "slots",
      limit: 20,
      timeLimitMs: 5_000,
    });
    const result = searchSets(shipped, q);
    assert.equal(result.timedOut, false, "timed out");
    assert.equal(result.sets.length, 20);
    for (const set of result.sets) assertValid(shipped, set, q);
    for (let i = 1; i < result.sets.length; i++) {
      assert.ok(setScore(result.sets[i - 1], "slots") >= setScore(result.sets[i], "slots"));
    }
    const byDefence = searchSets(shipped, { ...q, sort: "defence" });
    assert.ok(result.sets[0].freeSlots >= Math.max(...byDefence.sets.map((s) => s.freeSlots)));
  });

  test("a round that runs out of time keeps the last round's sets", (t) => {
    const q = query(["Attack Up (Large)", "ESP"], { weaponSlots: 1, limit: 1000 });
    const search = prepareSearch(data, q);
    // The first round that finds any sets (but not all of them).
    let round = 0;
    let first = search.run(round);
    while (first.sets.length === 0) first = search.run(++round);
    assert.ok(round + 1 < SEARCH_ROUNDS && first.sets.length < 1000, `round ${round}`);
    // Past the deadline from here on.
    const now = Date.now();
    t.mock.method(Date, "now", () => now + 3_600_000);
    const second = search.run(round + 1);
    assert.equal(second.timedOut, true);
    const ids = (r: SearchResult) => r.sets.map((s) => s.pieces.map((p) => p.id).join());
    assert.deepEqual(ids(second), ids(first));
  });

  test("an impossible request finds nothing quickly", () => {
    const q = query(["Attack Up (Large)", "ESP", "Evade +2", "Guard +2", "Earplug"], {
      rank: "low-rank",
    });
    const result = searchSets(data, q);
    assert.equal(result.timedOut, false);
    assert.equal(result.sets.length, 0);
  });
});
