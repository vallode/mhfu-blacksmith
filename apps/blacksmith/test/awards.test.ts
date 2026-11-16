/** Guild Card awards (lib/awards.ts): their rules and the hunter's progress towards them. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AWARDS,
  awardProgress,
  awardTotals,
  selectQuests,
  type Award,
  type AwardContext,
  type CrownMonster,
} from "../src/lib/awards";
import { MESSAGES } from "../src/lib/i18n/messages";
import { MONSTER_GAME_IDS } from "../src/lib/monster-ids";
import type { Quest } from "../src/lib/quests";
import type { MonsterRecord, SaveData } from "../src/lib/save-store";

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
  test("lists the game's 48 awards in its order, each once", () => {
    assert.equal(AWARDS.length, 48);
    assert.equal(new Set(AWARDS.map((a) => a.id)).size, 48);
    assert.equal(AWARDS[0].name, "Village Chief's Glove");
    assert.equal(AWARDS[47].name, "Hunter's Miracle");
  });

  test("has a requirement for every award in every language", () => {
    for (const messages of Object.values(MESSAGES)) {
      for (const a of AWARDS) assert.ok(messages.site.hunter.awards.requirements[a.id], a.id);
    }
  });

  test("hunts only monsters the save keeps records for", () => {
    for (const a of AWARDS) {
      if (a.rule.kind === "hunt") assert.ok(MONSTER_GAME_IDS[a.rule.monster] !== undefined, a.id);
    }
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
      awardProgress(award("gold-snowshoes"), ctx(save({ monsters: [record("Rajang", r)] }))).status;
    assert.equal(hunted({ kills: 1 }), "earned");
    assert.equal(hunted({ captures: 2 }), "earned");
    assert.equal(hunted({}), "progress");
    assert.equal(
      awardProgress(award("gold-snowshoes"), ctx(save({ monsters: [] }))).status,
      "progress",
    );
    assert.equal(awardProgress(award("gold-snowshoes"), ctx(save({}))).status, "untracked");
  });

  test("needs a gold crown on every monster with crown sizes for the King's Crown", () => {
    const crowns = { mini: 90, silver: 115, gold: 120 };
    const monsters: CrownMonster[] = [
      { name: "Rathalos", slug: "rathalos", category: "flying-wyvern", crowns },
      { name: "Rathian", slug: "rathian", category: "flying-wyvern", crowns },
      { name: "Kelbi", slug: "kelbi", category: "herbivore" },
    ];
    const p = awardProgress(
      award("kings-crown"),
      ctx(
        save({
          monsters: [
            record("Rathalos", { largest: 121, smallest: 95 }),
            record("Rathian", { largest: 116 }),
          ],
        }),
        monsters,
      ),
    );
    assert.equal(p.status, "progress");
    if (p.status !== "progress") return;
    assert.deepEqual([p.done, p.total], [1, 2]);
    assert.deepEqual(
      p.todo.map((t) => t.kind === "monster" && t.monster.name),
      ["Rathian"],
    );
  });

  test("leaves the awards the save can't show untracked", () => {
    assert.equal(
      awardProgress(award("azure-stone"), ctx(save({ clearedQuests: [] }))).status,
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
    const tracked = AWARDS.filter((a) => a.rule.kind !== "untracked").length;
    assert.equal(totals.tracked, tracked);
    // The Glove, the Gourd (its one urgent quest), the Mane Necklace, and
    // the awards whose boards have no quests here.
    assert.ok(totals.earned >= 3);
  });
});
