import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dropRank,
  GATHER_TIERS,
  isAvailable,
  isStage,
  STAGES,
  tierLabel,
  earliestSources,
  weaponKey,
  weaponProgress,
  type MonsterLike,
  type QuestLike,
} from "../src/lib/min-rank";

const key = (n: string) => n.toLowerCase();
const quest = (
  hub: string,
  rank: string | null,
  stars: number,
  items: string[],
  monsters: string[] = [],
): QuestLike => ({
  hub,
  rank,
  stars,
  large_monsters: monsters.map((monster) => ({ monster })),
  reward_tables: [{ items: items.map((item) => ({ item })) }],
});

describe("dropRank", () => {
  it("normalises the rank headings in the monster data", () => {
    assert.equal(dropRank("low rank"), "low-rank");
    assert.equal(dropRank("high-rank"), "high-rank");
    assert.equal(dropRank("g rank"), "g-rank");
    assert.equal(dropRank("1-2 star guild"), "low-rank");
    assert.equal(dropRank("capture"), null);
  });
});

describe("earliestSources", () => {
  const monsters: MonsterLike[] = [
    { name: "Tigrex", drops: { "high rank": { carve: [{ name: "Tigrex Fang x1" }] } } },
  ];

  it("takes the earliest quest and counts village as low rank", () => {
    const s = earliestSources(
      [quest("guild", "high-rank", 7, ["Gem"]), quest("village", null, 3, ["Gem"])],
      [],
      key,
    );
    assert.deepEqual(s.get("gem"), { rank: "low-rank", stars: 3 });
  });

  it("sources monster drops from the first quest that has the monster at that rank", () => {
    const s = earliestSources(
      [
        quest("guild", "high-rank", 8, [], ["Tigrex"]),
        quest("guild", "high-rank", 6, [], ["Tigrex"]),
        quest("guild", "low-rank", 2, [], ["Tigrex"]),
      ],
      monsters,
      (n) => n.toLowerCase().replace(/ x\d+$/, ""),
    );
    assert.deepEqual(s.get("tigrex fang"), { rank: "high-rank", stars: 6 });
  });

  it("ignores gathered items", () => {
    const s = earliestSources(
      [quest("guild", "low-rank", 2, ["Iron Ore"])],
      [],
      key,
      new Set(["iron ore"]),
      {},
    );
    assert.equal(s.has("iron ore"), false);
  });
});

describe("gather tiers", () => {
  it("gate ore by where it can be mined, not by quest rewards", () => {
    const s = earliestSources(
      [quest("guild", "low-rank", 2, ["Carbalite Ore"])],
      [],
      key,
      new Set(["carbalite ore"]),
      { "Carbalite Ore": { rank: "high-rank", stars: 0 } },
    );
    assert.deepEqual(s.get("carbalite ore"), { rank: "high-rank", stars: 0 });
  });

  it("covers the ores with a known tier", () => {
    assert.equal(GATHER_TIERS["Iron Ore"].rank, "low-rank");
    assert.equal(GATHER_TIERS["Union Ore"].rank, "high-rank");
    assert.equal(GATHER_TIERS["Pure Crystal"].rank, "g-rank");
  });
});

describe("weaponProgress", () => {
  const sources = earliestSources(
    [
      quest("guild", "low-rank", 2, ["a"]),
      quest("guild", "high-rank", 7, ["b"]),
      quest("guild", "g-rank", 10, ["c"]),
    ],
    [],
    key,
  );
  const mats = (...names: string[]) => names.map((name) => ({ name }));

  it("needs the latest material and the parent, and takes the earliest route", () => {
    const p = weaponProgress(
      [
        { type: "t", name: "Root", create_mats: mats("a") },
        { type: "t", name: "Child", improve_from: "Root", improve_mats: mats("b") },
        { type: "t", name: "Grand", improve_from: "Child", improve_mats: mats("a") },
        {
          type: "t",
          name: "Alt",
          improve_from: "Child",
          improve_mats: mats("c"),
          alternative_create_mats: mats("a"),
        },
      ],
      sources,
      key,
    );
    assert.deepEqual(p.get(weaponKey("t", "Root")), { rank: "low-rank", stars: 2 });
    assert.deepEqual(p.get(weaponKey("t", "Child")), { rank: "high-rank", stars: 7 });
    assert.deepEqual(p.get(weaponKey("t", "Grand")), { rank: "high-rank", stars: 7 });
    assert.deepEqual(p.get(weaponKey("t", "Alt")), { rank: "low-rank", stars: 2 });
  });

  it("finds a parent in another weapon type", () => {
    const p = weaponProgress(
      [
        { type: "x", name: "Sns", create_mats: mats("c") },
        { type: "y", name: "Dual", improve_from: "Sns", improve_mats: mats("a") },
      ],
      sources,
      key,
    );
    assert.deepEqual(p.get(weaponKey("y", "Dual")), { rank: "g-rank", stars: 10 });
  });

  it("is null when the parent is missing and starts roots with no recipe at the start", () => {
    const p = weaponProgress(
      [
        { type: "t", name: "Orphan", improve_from: "Ghost", improve_mats: mats("a") },
        { type: "t", name: "Free" },
      ],
      sources,
      key,
    );
    assert.equal(p.get(weaponKey("t", "Orphan")), null);
    assert.deepEqual(p.get(weaponKey("t", "Free")), { rank: "low-rank", stars: 0 });
  });
});

describe("stages and availability", () => {
  it("lists every stage earliest first, with the shared stars on both ranks", () => {
    assert.equal(STAGES.length, 6 + 4 + 3);
    assert.deepEqual(STAGES[0], { rank: "low-rank", stars: 1 });
    assert.deepEqual(STAGES.at(-1), { rank: "g-rank", stars: 11 });
    assert.ok(isStage({ rank: "low-rank", stars: 6 }));
    assert.ok(isStage({ rank: "high-rank", stars: 6 }));
    assert.ok(!isStage({ rank: "low-rank", stars: 7 }));
    assert.ok(!isStage(null) && !isStage("g-rank") && !isStage({}));
    assert.equal(tierLabel({ rank: "high-rank", stars: 7 }), "High Rank ★7");
  });

  it("hides gear that needs a later tier and never hides unknowns", () => {
    const high7 = { rank: "high-rank", stars: 7 } as const;
    assert.equal(isAvailable(high7, null), true);
    assert.equal(isAvailable(undefined, STAGES[0]), true);
    assert.equal(isAvailable(high7, { rank: "low-rank", stars: 6 }), false);
    assert.equal(isAvailable(high7, { rank: "high-rank", stars: 6 }), false);
    assert.equal(isAvailable(high7, high7), true);
    assert.equal(isAvailable(high7, { rank: "g-rank", stars: 9 }), true);
    // Ungated gear is available to everyone.
    assert.equal(isAvailable({ rank: "low-rank", stars: 0 }, STAGES[0]), true);
  });
});
