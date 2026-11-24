/** The hunter's crown groups (lib/hunter-crowns.ts): pooling records the way the Guild Card does. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readData } from "game-data";
import { MONSTER_CATEGORIES } from "../src/lib/constants";
import { CROWN_GROUPS, cardSize, crownCutoff } from "../src/lib/crowns";
import { crownProgress, type CrownGroupMonster } from "../src/lib/hunter-crowns";
import { MONSTER_GAME_IDS } from "../src/lib/monster-ids";
import { DATA_DIR } from "../src/lib/paths";
import type { MonsterRecord } from "../src/lib/save-store";
import { slugify } from "../src/lib/slug";
import type { Monster } from "../src/lib/types";

const crowns = { mini: 90, silver: 114, gold: 127 };

function record(name: keyof typeof MONSTER_GAME_IDS, over: Partial<MonsterRecord>): MonsterRecord {
  return {
    id: MONSTER_GAME_IDS[name],
    kills: 0,
    captures: 0,
    largest: 0,
    smallest: 0,
    ...over,
  };
}

const RATHALOS_GROUP: CrownGroupMonster[] = [
  {
    name: "Rathalos",
    slug: "rathalos",
    category: "flying-wyvern",
    crowns,
    baseSize: 1629.4,
  },
  {
    name: "Silver Rathalos",
    slug: "silver-rathalos",
    category: "flying-wyvern",
    crowns,
    baseSize: 1629.4,
  },
  {
    name: "Azure Rathalos",
    slug: "azure-rathalos",
    category: "flying-wyvern",
    crowns,
    baseSize: 1629.4,
  },
];

function groupOf(records: MonsterRecord[], monsters: CrownGroupMonster[]) {
  const group = crownProgress(records, monsters).groups.find((g) => g.names[0] === "Rathalos");
  assert.ok(group);
  return group;
}

describe("crownProgress", () => {
  test("pools a group's hunts and takes its largest and smallest records", () => {
    const group = groupOf(
      [
        record("Rathalos", { kills: 2, captures: 1, largest: 128, smallest: 89 }),
        record("Silver Rathalos", { kills: 1, largest: 120, smallest: 95 }),
      ],
      RATHALOS_GROUP,
    );
    assert.equal(group.hunts, 4);
    assert.equal(group.largest, 128);
    assert.equal(group.smallest, 89);
    assert.equal(group.largestCrown, "gold");
    assert.equal(group.smallestCrown, "mini");
  });

  test("shows the card's sizes and crown cutoffs", () => {
    const group = groupOf(
      [record("Rathalos", { kills: 1, largest: 128, smallest: 89 })],
      RATHALOS_GROUP,
    );
    assert.equal(group.largestSize, cardSize(128, 1629.4));
    assert.equal(group.smallestSize, cardSize(89, 1629.4));
    assert.deepEqual(group.cutoffs, {
      gold: crownCutoff("gold", crowns, 1629.4),
      mini: crownCutoff("mini", crowns, 1629.4),
    });
  });

  test("keeps every group before the monsters load, with no sizes or crowns", () => {
    const progress = crownProgress([], []);
    assert.equal(progress.groups.length, CROWN_GROUPS.length);
    const group = progress.groups[0]!;
    assert.equal(group.names[0], "Rathian");
    assert.equal(group.largest, 0);
    assert.equal(group.largestSize, null);
    assert.equal(group.largestCrown, null);
    assert.equal(group.cutoffs, null);
    assert.deepEqual([progress.gold, progress.mini], [0, 0]);
  });

  test("counts gold and mini crowns once per group", () => {
    const progress = crownProgress(
      [record("Rathalos", { largest: 128 }), record("Rathian", { largest: 128, smallest: 89 })],
      [
        ...RATHALOS_GROUP,
        {
          name: "Rathian",
          slug: "rathian",
          category: "flying-wyvern",
          crowns,
          baseSize: 1645.6,
        },
      ],
    );
    assert.deepEqual([progress.gold, progress.mini], [2, 1]);
  });
});

describe("the crown groups against the site's monsters", () => {
  const monsters = MONSTER_CATEGORIES.flatMap((category) =>
    readData<{ monsters: Monster[] }>(DATA_DIR, "monsters", `${category}.json`).monsters.map(
      (monster) => ({
        name: monster.name,
        slug: slugify(monster.name),
        category,
        ...(monster.crowns && { crowns: monster.crowns }),
        ...(monster.base_size !== undefined && { baseSize: monster.base_size }),
      }),
    ),
  );

  test("every group has its monsters, crown thresholds and base size", () => {
    const progress = crownProgress([], monsters);
    assert.equal(progress.groups.length, 31);
    for (const group of progress.groups) {
      assert.equal(group.monsters.length, group.names.length, group.names[0]);
      assert.ok(group.cutoffs, group.names[0]);
    }
  });
});
