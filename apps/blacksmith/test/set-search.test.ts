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
  evaluateSet,
  parseDecorationSkill,
  prepareSearchData,
  searchSets,
  treeNameIndex,
  type ArmorInput,
  type ArmorSet,
  type DecorationInput,
  type SearchData,
  type SearchQuery,
  type SkillTreeData,
} from "../src/lib/set-search";
import { DATA_DIR } from "../src/lib/paths";

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
 * Every points vector the decorations can add to these bins. `cache` keeps
 * the vectors for each run of bins seen, for the next call.
 */
function decoVectors(
  data: SearchData,
  bins: { size: number; mult: number }[],
  trees: string[],
  cache = new Map<string, number[][]>(),
) {
  const fills = (size: number): number[][] => {
    // Multisets of decorations that fit in `size` slots.
    const out: number[][] = [trees.map(() => 0)];
    const go = (from: number, left: number, acc: number[]) => {
      for (let d = from; d < data.decorations.length; d++) {
        const deco = data.decorations[d];
        if (deco.slots > left) continue;
        const next = acc.map((v, i) => v + (deco.points[trees[i]] ?? 0));
        out.push(next);
        go(d, left - deco.slots, next);
      }
    };
    go(
      0,
      size,
      trees.map(() => 0),
    );
    return out;
  };
  let reach = [trees.map(() => 0)];
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
        const w = v.map((x, i) => x + f[i] * bin.mult);
        next.set(w.join(), w);
      }
    }
    reach = [...next.values()];
    cache.set(key, reach);
  }
  return reach;
}

/**
 * The highest defence of any set that answers the query, trying every piece
 * combination and decoration placement; -Infinity when there is none.
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

  const bySlot = ARMOR_SLOTS.map((slot) => data.pieces.filter((p) => p.slot === slot));
  let combos: (typeof data.pieces)[number][][] = [[]];
  for (const pieces of bySlot) combos = combos.flatMap((c) => pieces.map((p) => [...c, p]));
  const defence = (c: (typeof data.pieces)[number][]) => c.reduce((n, p) => n + p.defence, 0);
  combos.sort((a, b) => defence(b) - defence(a));

  const fills = new Map<string, number[][]>();
  for (const combo of combos) {
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
    const vectors = decoVectors(data, bins, trees, fills);
    if (vectors.some((v) => trees.every((t, k) => ok(t, armor[k] + v[k])))) return defence(combo);
  }
  return -Infinity;
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

    for (const allowBadSkills of [true, false]) {
      const q = query(skills, { weaponSlots, allowBadSkills });
      test(`trial ${trial}: ${skills.join(" + ")}${allowBadSkills ? "" : ", no bad skills"}`, () => {
        const expected = bruteForce(data, q);
        outcomes.add(expected > -Infinity);
        const result = searchSets(data, q);
        assert.equal(result.sets[0]?.defence ?? -Infinity, expected, "best defence");
        for (const set of result.sets) assertValid(data, set, q);
        // Defence first.
        for (let i = 1; i < result.sets.length; i++) {
          assert.ok(result.sets[i - 1].defence >= result.sets[i].defence);
        }
        // Keeping only the best set still finds it.
        const top = searchSets(data, { ...q, limit: 1 });
        assert.equal(top.sets[0]?.defence ?? -Infinity, expected, "best defence, limit 1");
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
      // Sorted by defence.
      for (let i = 1; i < result.sets.length; i++) {
        assert.ok(result.sets[i - 1].defence >= result.sets[i].defence);
      }
    });
  }

  test("an impossible request finds nothing quickly", () => {
    const q = query(["Attack Up (Large)", "ESP", "Evade +2", "Guard +2", "Earplug"], {
      rank: "low-rank",
    });
    const result = searchSets(data, q);
    assert.equal(result.timedOut, false);
    assert.equal(result.sets.length, 0);
  });
});
