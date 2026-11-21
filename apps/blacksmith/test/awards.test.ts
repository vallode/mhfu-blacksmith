/** Guild Card awards (lib/awards.ts): their rules and the hunter's progress towards them. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readData } from "game-data";
import {
  AWARDS,
  CROWN_GROUPS,
  awardProgress,
  awardTotals,
  selectQuests,
  type Award,
  type AwardContext,
  type CrownMonster,
} from "../src/lib/awards";
import { ARTISAN_WEAPONS } from "../src/lib/award-weapons";
import { MONSTER_GAME_IDS } from "../src/lib/monster-ids";
import { DATA_DIR, GAME } from "../src/lib/paths";
import { questHubSlug, type Quest } from "../src/lib/quests";
import type { MonsterRecord, SaveData } from "../src/lib/save-store";
import type { EquipmentIds } from "../src/lib/schema";

function quest(id: number, hub: Quest["hub"], stars: number, urgent = false): Quest {
  return { id, hub, stars, urgent } as Quest;
}

function save(over: Partial<SaveData>): SaveData {
  return { name: "Gideon", region: "us", items: [], savedAt: 0, ...over };
}

function record(name: string, over: Partial<MonsterRecord>): MonsterRecord {
  return { id: MONSTER_GAME_IDS[name]!, kills: 0, captures: 0, largest: 0, smallest: 0, ...over };
}

const award = (id: string): Award => AWARDS.find((a) => a.id === id)!;

const QUESTS = [
  quest(10001, "village", 1),
  quest(10101, "village", 2),
  quest(10104, "village", 2, true),
  quest(10201, "village", 3),
  quest(1, "low-rank", 1),
];

describe("AWARDS", () => {
  test("lists the game's 48 awards, each once, with their text in data/mhfu/awards.json", () => {
    assert.equal(AWARDS.length, 48);
    assert.equal(new Set(AWARDS.map((a) => a.id)).size, 48);
    const { awards } = readData(DATA_DIR, GAME, "awards.json") as {
      awards: { id: number; name: string; description: string }[];
    };
    assert.deepEqual(
      awards.map((a) => a.id),
      AWARDS.map((_, i) => i),
    );
    for (const a of awards) assert.ok(a.name && a.description, String(a.id));
    // The game's order: the Glove is bit 0, the Miracle bit 47.
    assert.equal(awards[0]!.name, "Village Chief's Glove");
    assert.equal(awards[47]!.name, "Hunter's Miracle");
  });

  test("names only monsters the save keeps records for", () => {
    for (const a of AWARDS) {
      if (a.rule.kind === "monsters")
        for (const m of a.rule.monsters)
          assert.ok(MONSTER_GAME_IDS[m] !== undefined, `${a.id} ${m}`);
    }
    for (const m of CROWN_GROUPS.flat()) assert.ok(MONSTER_GAME_IDS[m] !== undefined, m);
  });

  test("has the game's monster lists and crown groups", () => {
    const monsters = (id: string) => {
      const rule = award(id).rule;
      return rule.kind === "monsters" ? rule : null;
    };
    assert.equal(monsters("rare-species")?.monsters.length, 16);
    assert.equal(monsters("rare-species")?.need, "hunt");
    assert.equal(monsters("ecology-report")?.monsters.length, 43);
    assert.equal(monsters("ecology-report")?.need, "capture");
    assert.equal(CROWN_GROUPS.length, 31);
    assert.equal(new Set(CROWN_GROUPS.flat()).size, CROWN_GROUPS.flat().length);
  });
});

/** The site's quests, from data/: enough of each for selectQuests. */
function siteQuests(): Quest[] {
  return ["village", "guild", "training-school", "treasure-hunting"].flatMap((file) => {
    const { quests } = readData(DATA_DIR, GAME, `quests/${file}.json`) as {
      quests: { id: number; hub: string; rank: string | null; stars: number }[];
    };
    return quests.map((q) => quest(q.id, questHubSlug(q.hub, q.rank)!, q.stars));
  });
}

/** Quest IDs `from` to `to`, inclusive. */
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("the quest awards against the game's quest lists", () => {
  // The lists the EU EBOOT checks (0x089B1EBC Village, 0x089B1E90 Gathering Hall), by star level.
  const VILLAGE = [
    [10001, 10005],
    [10101, 10118],
    [10201, 10218],
    [10301, 10319],
    [10401, 10418],
    [10501, 10511],
    [11001, 11014],
    [11101, 11119],
    [11201, 11226],
  ].map(([a, b]) => ids(a!, b!));
  const GUILD = [
    [1, 10],
    [101, 109],
    [1001, 1022],
    [1101, 1126],
    [1201, 1220],
    [2001, 2013],
    [2101, 2127],
    [2201, 2236],
    [3001, 3025],
    [3101, 3127],
    [3201, 3233],
  ].map(([a, b]) => ids(a!, b!));
  const all = siteQuests();
  const select = (id: string) => {
    const rule = award(id).rule;
    assert.equal(rule.kind, "quests", id);
    if (rule.kind !== "quests") return [];
    return selectQuests(all, rule.select)
      .map((q) => q.id)
      .sort((a, b) => a - b);
  };
  const sorted = (lists: number[][]) => lists.flat().sort((a, b) => a - b);
  const cases: [string, number[]][] = [
    ["chief-glove", sorted(VILLAGE.slice(0, 2))],
    ["chief-hat", sorted(VILLAGE.slice(2, 4))],
    ["chief-scarf", sorted(VILLAGE.slice(4, 5))],
    ["chief-coat", sorted(VILLAGE.slice(0, 6))],
    ["nekoht-whiskers", VILLAGE[6]!],
    ["nekoht-bell", VILLAGE[7]!],
    ["nekoht-coat", VILLAGE[8]!],
    ["bronze-medal", sorted(GUILD.slice(0, 2))],
    ["silver-medal", sorted(GUILD.slice(2, 5))],
    ["gold-medal", sorted(GUILD.slice(5, 8))],
    ["orichalcum-shield", GUILD[8]!],
    ["platinum-shield", GUILD[9]!],
    ["gold-shield", GUILD[10]!],
    ["supreme-crest", sorted([...GUILD, ...VILLAGE])],
    ["legend-badge", ids(22001, 22006)],
    ["pokke-gourd", [11225]],
    ["gold-snowshoes", [3212]],
    ["igneous-ring", [3230]],
    ["ring-of-fire", [3231]],
    ["powder-white-crown", [3232]],
  ];
  for (const [id, want] of cases)
    test(id, () => {
      assert.deepEqual(select(id), want);
    });

  test("epic-hunts", () => {
    assert.equal(select("epic-hunts").length, 29);
    assert.deepEqual(select("epic-hunts").slice(0, 3), [2125, 2126, 2127]);
  });
});

describe("selectQuests", () => {
  test("narrows a board by star levels and to its urgent quests", () => {
    const ids = (qs: Quest[]) => qs.map((q) => q.id);
    assert.deepEqual(
      ids(selectQuests(QUESTS, { hubs: ["village"], stars: [1, 2] })),
      [10001, 10101, 10104],
    );
    assert.deepEqual(ids(selectQuests(QUESTS, { hubs: ["village"], urgent: true })), [10104]);
  });
});

describe("awardProgress", () => {
  const ctx = (s: SaveData | null, monsters: CrownMonster[] | null = []): AwardContext => ({
    save: s,
    quests: QUESTS,
    monsters,
  });

  test("counts a quest award's cleared quests and lists the rest", () => {
    const p = awardProgress(award("chief-glove"), ctx(save({ clearedQuests: [10001, 10104] })));
    assert.equal(p.status, "progress");
    if (p.status !== "progress") return;
    assert.deepEqual([p.done, p.total], [2, 3]);
    assert.deepEqual(
      p.todo.map((t) => t.kind === "quest" && t.quest.id),
      [10101],
    );
  });

  test("earns a quest award once every quest is cleared", () => {
    const p = awardProgress(
      award("chief-glove"),
      ctx(save({ clearedQuests: [10001, 10101, 10104] })),
    );
    assert.deepEqual(p, { status: "earned", done: 3, total: 3 });
  });

  test("can't tell without the save's cleared quests", () => {
    assert.equal(awardProgress(award("chief-glove"), ctx(save({}))).status, "untracked");
  });

  test("earns a hunt award for a kill or a capture", () => {
    const hunted = (r: Partial<MonsterRecord>) =>
      awardProgress(award("ukanlos-bead"), ctx(save({ monsters: [record("Ukanlos", r)] }))).status;
    assert.equal(hunted({ kills: 1 }), "earned");
    assert.equal(hunted({ captures: 2 }), "earned");
    assert.equal(hunted({}), "progress");
    assert.equal(
      awardProgress(award("ukanlos-bead"), ctx(save({ monsters: [] }))).status,
      "progress",
    );
    assert.equal(awardProgress(award("ukanlos-bead"), ctx(save({}))).status, "untracked");
  });

  test("needs captures, not kills, for the Ecology Research Report", () => {
    const p = awardProgress(
      award("ecology-report"),
      ctx(
        save({
          monsters: [record("Rathian", { captures: 1 }), record("Rathalos", { kills: 5 })],
        }),
      ),
    );
    assert.equal(p.status, "progress");
    if (p.status !== "progress") return;
    assert.deepEqual([p.done, p.total], [1, 43]);
    assert.equal(p.todo[0]?.kind === "monster" && p.todo[0].monster.name, "Yian Kut-Ku");
  });

  test("links a monster still to hunt to its page once the monsters load", () => {
    const kirin: CrownMonster = { name: "Kirin", slug: "kirin", category: "elder-dragon" };
    const p = awardProgress(award("mane-necklace"), ctx(save({ monsters: [] }), [kirin]));
    assert.equal(p.status, "progress");
    if (p.status !== "progress") return;
    assert.deepEqual(p.todo, [{ kind: "monster", monster: kirin }]);
  });

  test("pools a crown group's records for the King's Crown and Miniature Crown", () => {
    const crowns = { mini: 90, silver: 114, gold: 127 };
    const monsters: CrownMonster[] = [
      { name: "Rathalos", slug: "rathalos", category: "flying-wyvern", crowns },
      { name: "Azure Rathalos", slug: "azure-rathalos", category: "flying-wyvern", crowns },
      { name: "Rathian", slug: "rathian", category: "flying-wyvern", crowns },
      { name: "Kelbi", slug: "kelbi", category: "herbivore" },
    ];
    const s = save({
      monsters: [
        // Rathalos's group: a gold crown on the Azure, a mini on the Rathalos.
        record("Rathalos", { kills: 1, largest: 100, smallest: 89 }),
        record("Azure Rathalos", { kills: 1, largest: 128, smallest: 101 }),
        // Rathian's: silver at best, and no small record.
        record("Rathian", { kills: 1, largest: 120 }),
      ],
    });
    const left = (id: string) => {
      const p = awardProgress(award(id), ctx(s, monsters));
      assert.equal(p.status, "progress");
      if (p.status !== "progress") return [];
      assert.deepEqual([p.done, p.total], [1, 2]);
      return p.todo.map((t) => t.kind === "monster" && t.monster.name);
    };
    assert.deepEqual(left("kings-crown"), ["Rathian"]);
    assert.deepEqual(left("miniature-crown"), ["Rathian"]);
  });

  test("leaves the awards the save can't show untracked", () => {
    // A save stored before the farm was read, and an award no rule follows.
    assert.equal(
      awardProgress(award("azure-stone"), ctx(save({ clearedQuests: [] }))).status,
      "untracked",
    );
    assert.equal(
      awardProgress(award("hunters-progress"), ctx(save({ farm: [0, 0, 0, 0] }))).status,
      "untracked",
    );
  });
});

describe("awardTotals", () => {
  test("counts earned awards out of those the save can show", () => {
    const totals = awardTotals({
      save: save({
        clearedQuests: [10001, 10101, 10104],
        monsters: [record("Kirin", { kills: 1 })],
      }),
      quests: QUESTS,
      monsters: [],
    });
    // This save has no award records, so only the quest, monster and crown rules count.
    const tracked = AWARDS.filter((a) =>
      ["quests", "monsters", "crowns"].includes(a.rule.kind),
    ).length;
    assert.equal(totals.tracked, tracked);
    // The Glove and the Mane Necklace: an award with nothing to do here isn't earned.
    assert.equal(totals.earned, 2);
  });
});

describe("awardProgress with the save's award flags", () => {
  const index = (id: string) => AWARDS.findIndex((a) => a.id === id);
  const flagged = (over: Partial<SaveData>, ...ids: string[]): AwardContext => ({
    save: save({ clearedQuests: [], monsters: [], awards: ids.map(index), ...over }),
    quests: QUESTS,
    monsters: [],
  });

  test("a flagged award is earned, whatever its rule says", () => {
    assert.deepEqual(awardProgress(award("mane-necklace"), flagged({}, "mane-necklace")), {
      status: "earned",
      done: 1,
      total: 1,
    });
    assert.equal(awardProgress(award("azure-stone"), flagged({}, "azure-stone")).status, "earned");
  });

  test("a met rule without the flag isn't earned yet", () => {
    const p = awardProgress(
      award("mane-necklace"),
      flagged({ monsters: [record("Kirin", { kills: 1 })] }),
    );
    assert.deepEqual(p, { status: "progress", done: 1, total: 1, todo: [] });
  });

  test("keeps the rule's progress for awards not given", () => {
    const p = awardProgress(award("chief-glove"), flagged({ clearedQuests: [10001] }));
    assert.equal(p.status, "progress");
    assert.equal(p.status === "progress" && p.done, 1);
  });

  test("awards the rules can't follow are not earned rather than untracked", () => {
    assert.deepEqual(awardProgress(award("hunters-progress"), flagged({})), {
      status: "notEarned",
    });
  });

  test("every award counts towards the totals", () => {
    const totals = awardTotals(flagged({}, "chief-glove", "azure-stone", "hunters-miracle"));
    assert.deepEqual(totals, { earned: 3, tracked: 48 });
  });
});

describe("the awards counted from the save's other records", () => {
  const TRAINING = ids(21001, 21023).map((id) => quest(id, "training-school", 1));
  const TREASURE = ids(4001, 4007).map((id) => quest(id, "treasure-hunting", 1));
  const ctx = (over: Partial<SaveData>, extra: Partial<AwardContext> = {}): AwardContext => ({
    save: save(over),
    quests: [...TRAINING, ...TREASURE],
    monsters: [],
    ...extra,
  });
  const count = (id: string, over: Partial<SaveData>, extra?: Partial<AwardContext>) => {
    const p = awardProgress(award(id), ctx(over, extra));
    return p.status === "earned" || p.status === "progress" ? [p.done, p.total] : p.status;
  };
  const todo = (id: string, over: Partial<SaveData>) => {
    const p = awardProgress(award(id), ctx(over));
    return p.status === "progress" ? p.todo.map((t) => t.kind === "quest" && t.quest.id) : [];
  };

  test("training badges need every weapon set of each quest", () => {
    // 21001 with all five sets, 21002 with four.
    const trainingSets = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    assert.deepEqual(count("black-belt", { trainingSets }), [1, 10]);
    assert.deepEqual(todo("black-belt", { trainingSets }), ids(21002, 21010));
    assert.deepEqual(count("expert-badge", { trainingSets }), [0, 5]);
    const all = ids(0, 23 * 5 - 1);
    assert.deepEqual(count("warriors-medal", { trainingSets: all }), [8, 8]);
    assert.equal(count("black-belt", {}), "untracked");
    assert.equal(count("black-belt", { trainingSets }, { quests: null }), "loading");
  });

  test("farm awards follow each area's level", () => {
    const farm = [2, 1, 3, 4]; // Field, Fishing Pier, Mining Area, Insect area
    assert.deepEqual(count("dosbiscus", { farm }), [2, 2]);
    assert.deepEqual(count("springnight-carp", { farm }), [1, 2]);
    assert.deepEqual(count("azure-stone", { farm }), [3, 4]);
    assert.deepEqual(count("great-hornfly", { farm }), [4, 4]);
  });

  test("the Grateful Letter needs five chefs at level 9", () => {
    assert.deepEqual(count("grateful-letter", { felyneChefs: [9, 12, 9, 8] }), [3, 5]);
    assert.deepEqual(count("grateful-letter", { felyneChefs: [9, 9, 9, 9, 10] }), [5, 5]);
  });

  test("Comrades: the closest of your own to all skills, and fondness at exactly 7000", () => {
    const comrades = [
      { fondness: 7000, skills: 36, own: false },
      { fondness: 7000, skills: 30, own: true },
      { fondness: 9999, skills: 12, own: true },
    ];
    assert.deepEqual(count("ultimate-catnip", { comrades }), [30, 36]);
    assert.deepEqual(count("ultimate-catnip", { comrades: [] }), [0, 36]);
    assert.deepEqual(count("fearless-leader", { comrades }), [2, 5]);
  });

  test("counts against a mark are capped there", () => {
    assert.deepEqual(count("flower-bouquet", { guildPoints: 1_007_759 }), [1_000_000, 1_000_000]);
    assert.deepEqual(count("trenyas-flag", { trenyaTrips: 40 }), [40, 100]);
    assert.deepEqual(count("members-card", { specialWeapons: 51 }), [50, 50]);
    assert.deepEqual(count("sages-bracelet", { recipes: 100 }), [100, 172]);
    assert.deepEqual(count("sages-bracelet", { recipes: 0 }), [0, 172]);
  });

  test("the Guardian's Award counts up to 20 quests each in the Fortress and the Town", () => {
    const mapQuests = Array<number>(14).fill(0);
    mapQuests[12] = 25;
    mapQuests[13] = 5;
    assert.deepEqual(count("guardians-award", { mapQuests }), [25, 40]);
  });

  test("the Hunter's Miracle needs five maps at 20 quests, and the Hunter's Progress", () => {
    const mapQuests = [0, 0, 0, 0, 0, 0, 0, 20, 20, 20, 20, 19, 0, 0];
    assert.deepEqual(count("hunters-miracle", { mapQuests, awards: [] }), [4, 6]);
    assert.deepEqual(count("hunters-miracle", { mapQuests, awards: [23] }), [5, 6]);
    // Without the award flags, the Hunter's Progress can't be told.
    assert.equal(count("hunters-miracle", { mapQuests }), "untracked");
  });

  test("the Adventurer's Helm counts treasures and lists the hunts short of their mark", () => {
    const treasureScores = [30000, 34999, 35000, 40000, 0, 45000, 50000];
    assert.deepEqual(count("adventurers-helm", { goldTreasures: 35, treasureScores }), [40, 42]);
    assert.deepEqual(todo("adventurers-helm", { goldTreasures: 35, treasureScores }), [4002, 4005]);
  });

  test("the Artisan's Hammer counts box slots of each class's listed weapons", () => {
    const [type, listed] = ARTISAN_WEAPONS[0]!;
    // Four slots of the first class (one weapon twice), three of the second.
    const equipment = [
      ...[listed[0]!, listed[0]!, listed[1]!, listed[2]!].map((id) => ({ type, id })),
      ...ARTISAN_WEAPONS[1]![1].slice(0, 3).map((id) => ({ type: ARTISAN_WEAPONS[1]![0], id })),
    ];
    assert.deepEqual(count("artisans-hammer", { equipment }), [1, 11]);
  });

  test("the Artisan's Mitten counts five pieces of rarity 9 or more per armor slot", () => {
    // Helmets (type 1): ID 1 at rarity 9, ID 2 at 8.
    const equipmentIds: EquipmentIds = [[], [null, [0, "A", 9], [0, "B", 8]], [], [], []];
    const helmets = (id: number, n: number) => Array.from({ length: n }, () => ({ type: 1, id }));
    assert.deepEqual(
      count("artisans-mitten", { equipment: helmets(1, 5) }, { equipmentIds }),
      [1, 5],
    );
    assert.deepEqual(
      count(
        "artisans-mitten",
        { equipment: [...helmets(1, 4), ...helmets(2, 3)] },
        { equipmentIds },
      ),
      [0, 5],
    );
    assert.equal(count("artisans-mitten", { equipment: [] }), "loading");
    // Without the table there's no rarity to go on.
    assert.equal(
      count("artisans-mitten", { equipment: [] }, { equipmentIdsFailed: true }),
      "untracked",
    );
  });
});
