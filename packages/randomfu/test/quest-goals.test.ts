/**
 * The quest goals shuffle (`questGoals`), on hand-built quests and a board:
 * every goal it writes can be met by the quest's own monsters, a capture
 * only ever names a monster that can be captured, the board's copy and the
 * goal line in every language follow, and what it leaves alone stays.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuest } from "mhfu-extract/src/quests/parser.js";
import { Edits } from "../src/edits.js";
import { readBoardRecords, recordBase, readRecordText, type BoardFile } from "../src/game/board.js";
import {
  CAPTURE_FLAGS,
  GOAL_CAPTURE,
  GOAL_SLAY,
  GOALS_NEEDED,
  HUNT_FLAGS,
  setGoals,
  SLAY_FLAGS,
  TYPE_HUNT,
  TYPE_SLAY,
  type Goal,
} from "../src/game/goals.js";
import type { GameData, LoadedQuest } from "../src/game/load.js";
import { QUEST_TYPE } from "../src/game/quest-fields.js";
import { readQuestText } from "../src/game/quest-text.js";
import { readSpawns } from "../src/game/spawns.js";
import { namedMonsters } from "../src/shuffles/quest-maps.js";
import { parseQuest as parseDoc } from "mhfu-extract/src/quests/document.js";
import {
  goalLine,
  plural,
  randomizeGoals,
  wrapGoal,
  type GoalOptions,
} from "../src/shuffles/quest-goals.js";
import { Rng } from "../src/rng.js";
import { buildBoardFile, buildQuestPayload, type FixtureQuest } from "./fixtures.js";

const RATHIAN = 1;
const KUT_KU = 6;
const RATHALOS = 11;
const APTONOTH = 12;
const VELOCIPREY = 16;
const KIRIN = 33;
const BLANGO = 61;
const VESPOID = 19;

const NAMES: Record<number, string> = {
  [RATHIAN]: "Rathian",
  [KUT_KU]: "Yian Kut-Ku",
  [RATHALOS]: "Rathalos",
  [APTONOTH]: "Aptonoth",
  [VELOCIPREY]: "Velociprey",
  [KIRIN]: "Kirin",
  [BLANGO]: "Blango",
  [VESPOID]: "Vespoid",
};
const name = (em: number) => NAMES[em] ?? `em${em}`;

const base = (
  questId: number,
  goal: string,
): Pick<FixtureQuest, "questId" | "rank" | "stars" | "rewards" | "text"> => ({
  questId,
  rank: 1,
  stars: 1,
  rewards: [[{ chance: 100, itemId: 110, amount: 1 }]],
  text: { title: `Quest ${questId}`, goal, otherGoal: `Ziel ${questId}` },
});

const SPECS: FixtureQuest[] = [
  {
    // A hunt with plenty of small monsters about: it stays a hunt.
    ...base(1001, "Hunt the Rathian"),
    monsters: [RATHIAN],
    small: [
      [VELOCIPREY, 20],
      [VESPOID, 99],
    ],
    goals: [{ flags: HUNT_FLAGS, id: RATHIAN, count: 1 }],
  },
  {
    ...base(1002, "Slay the Kirin"),
    monsters: [KIRIN],
    small: [[APTONOTH, 12]],
    goals: [{ flags: SLAY_FLAGS, id: KIRIN, count: 1 }],
    questType: TYPE_SLAY,
  },
  {
    // Slay 10 of 24 Blangos, with a Kut-Ku, 20 Velociprey and endless Vespoids about.
    ...base(1003, "Slay 10 Blangos"),
    monsters: [KUT_KU],
    small: [
      [BLANGO, 12],
      [BLANGO, 12],
      [VELOCIPREY, 20],
      [VESPOID, 99],
    ],
    goals: [{ flags: SLAY_FLAGS, id: BLANGO, count: 10 }],
    questType: TYPE_SLAY,
  },
  {
    ...base(1004, "Hunt the Rathian\nand Rathalos"),
    monsters: [RATHIAN, RATHALOS],
    goals: [
      { flags: HUNT_FLAGS, id: RATHIAN, count: 1 },
      { flags: HUNT_FLAGS, id: RATHALOS, count: 1 },
    ],
  },
  {
    ...base(1005, "Deliver 2 Raw Meat"),
    monsters: [RATHIAN],
    delivery: { itemId: 140, amount: 2 },
  },
];

const BOARD_INDEX = 900;

function setup() {
  const quests = SPECS.map((spec, i): LoadedQuest => {
    const payload = buildQuestPayload(spec);
    return {
      index: i,
      path: `mission_jpn/m${spec.questId}.mib`,
      file: { payload },
      parsed: parseQuest(payload),
    } as unknown as LoadedQuest;
  });
  const data = buildBoardFile([SPECS[0]!, SPECS[2]!, SPECS[3]!]);
  const board: BoardFile = {
    index: BOARD_INDEX,
    path: "mission_jpn/level1.mib",
    data,
    records: readBoardRecords(data)!,
  };
  const game = { dataBin: { read: () => data } } as unknown as GameData;
  return { quests, board, game };
}

const plurals = new Map([[BLANGO, "Blangos"]]);

function run(seed: string, options: GoalOptions = { capture: true, small: true }) {
  const { quests, board, game } = setup();
  const edits = new Edits(game);
  const report = randomizeGoals(quests, quests, options, new Rng(seed), edits, name, [board]);
  return { quests, board, edits, report };
}

/** Each language's goal line, English first. */
function goalLines(payload: Buffer, quest: LoadedQuest): string[] {
  return readQuestText(payload, quest.parsed.header).blocks.map((b) => b.texts[1]!);
}

test("every goal the shuffle writes can be met by the quest's own monsters", () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 60; seed++) {
    const { quests, board, edits } = run(`goals${seed}`);
    for (const quest of quests) {
      const payload = edits.questNow(quest);
      const { questId } = quest.parsed.header;
      const goals = setGoals(payload);
      if (questId === 1005) {
        assert.ok(payload.equals(quest.file.payload), "a delivery keeps its goal");
        continue;
      }
      assert.equal(payload[GOALS_NEEDED], goals.length, `${questId}: every goal is needed`);
      const spawns = readSpawns(payload, quest.parsed.header);
      for (const goal of goals) {
        const large = spawns.large.filter((s) => s.monsterId === goal.id).length;
        const small = spawns.small
          .filter((s) => s.monsterId === goal.id)
          .reduce((n, s) => n + s.quantity, 0);
        assert.ok(
          large + small >= goal.count,
          `${questId}: enough ${name(goal.id)} for ${goal.count}`,
        );
        if (goal.flags & GOAL_CAPTURE) {
          // Only monsters some quest hunts can be captured: not the Kut-Ku here.
          assert.ok(
            goal.id === RATHIAN || goal.id === RATHALOS,
            `${questId}: only capturable monsters are captured`,
          );
          assert.equal(small, 0, "never a small monster");
        }
        // Kirin can't be captured: hunting it is slaying it.
        if (goal.id === KIRIN) assert.equal(goal.flags, SLAY_FLAGS);
        if (small > 0) assert.equal(goal.flags, SLAY_FLAGS);
        // Hunts stay large, and no new goal is Vespoids.
        if (questId !== 1003) assert.equal(small, 0, `${questId}: a hunt stays a large monster's`);
        assert.notEqual(goal.id, VESPOID, "never Vespoids");
        seen.add(
          `${questId}:${goal.flags & GOAL_CAPTURE ? "capture" : small > 0 ? "small" : "large"}`,
        );
      }
      const slay = goals.length === 1 && (goals[0]!.flags & GOAL_SLAY) !== 0;
      assert.equal(
        payload[QUEST_TYPE],
        slay ? TYPE_SLAY : TYPE_HUNT,
        `${questId}: its kind matches`,
      );
      if (questId === 1004) {
        assert.deepEqual(
          goals.map((g) => g.id),
          [RATHIAN, RATHALOS],
          "a two-goal quest keeps both monsters",
        );
      }
      // The goal line names the goals, the same in every language.
      const lines = goalLines(payload, quest);
      const changed = payload !== quest.file.payload;
      if (changed) {
        const expected = goalLine(goals, name, plurals);
        assert.ok(expected, "the line fits");
        for (const line of lines) assert.equal(line, expected, `${questId}: goal line`);
      }
      // The board's records carry the same goals and line.
      for (const record of board.records.filter((r) => r.questId === questId)) {
        const data = edits.dataFileNow(BOARD_INDEX);
        assert.deepEqual(setGoals(data, recordBase(record)), goals, `${questId}: board goals`);
        assert.equal(data[recordBase(record) + GOALS_NEEDED], goals.length);
        assert.equal(data[recordBase(record) + QUEST_TYPE], payload[QUEST_TYPE]);
        const { text } = readRecordText(data, board, record);
        const want = changed ? lines[0] : undefined;
        if (want)
          for (const block of text.blocks)
            assert.equal(block.texts[1], want, `${questId}: board line`);
      }
    }
  }
  for (const kind of ["1001:capture", "1002:large", "1003:large", "1003:small", "1004:capture"]) {
    assert.ok(seen.has(kind), `${kind} drawn at some seed`);
  }
});

test("without captures or small monsters, goals keep to what's asked", () => {
  for (let seed = 0; seed < 40; seed++) {
    const { quests, edits } = run(`plain${seed}`, { capture: false, small: false });
    for (const quest of quests) {
      const goals = setGoals(edits.questNow(quest));
      for (const goal of goals) assert.equal(goal.flags & GOAL_CAPTURE, 0, "no captures");
      const { questId } = quest.parsed.header;
      if (questId === 1001) assert.deepEqual(goals, [{ flags: HUNT_FLAGS, id: RATHIAN, count: 1 }]);
      // A slaying quest keeps its goal.
      if (questId === 1003) assert.deepEqual(goals, [{ flags: SLAY_FLAGS, id: BLANGO, count: 10 }]);
    }
  }
  const { report } = run("plain", { capture: false, small: false });
  assert.match(report.notes.join(" "), /changed/);
});

test("a small monster goal asks for a share of the quest's, never all of them", () => {
  let drawn = 0;
  for (let seed = 0; seed < 60; seed++) {
    const { quests, edits } = run(`share${seed}`);
    const payload = edits.questNow(quests[2]!);
    const [goal] = setGoals(payload) as [Goal];
    if (goal.id !== VELOCIPREY) continue;
    // 20 Velociprey: at least 5, at most 11 (55%).
    assert.ok(goal.count >= 5 && goal.count <= 11, `asks for ${goal.count} of 20`);
    drawn++;
  }
  assert.ok(drawn > 0, "Velociprey drawn at some seed");
});

test("goal lines are the disc's style, wrapped to the goal box", () => {
  const hunt = (id: number, flags = HUNT_FLAGS, count = 1) => ({ flags, id, count });
  assert.equal(goalLine([hunt(RATHIAN)], name, plurals), "Hunt the Rathian");
  assert.equal(goalLine([hunt(RATHIAN, CAPTURE_FLAGS)], name, plurals), "Capture the Rathian");
  assert.equal(goalLine([hunt(BLANGO, SLAY_FLAGS, 15)], name, plurals), "Slay 15 Blangos");
  assert.equal(goalLine([hunt(APTONOTH, SLAY_FLAGS, 8)], name, plurals), "Slay 8 Aptonoth");
  assert.equal(
    goalLine([hunt(RATHIAN), hunt(RATHALOS)], name, plurals),
    "Hunt the Rathian and\nRathalos",
  );
  assert.equal(
    goalLine([hunt(RATHIAN), hunt(RATHALOS, CAPTURE_FLAGS)], name, plurals),
    "Hunt the Rathian and capture\nthe Rathalos",
  );
  assert.equal(wrapGoal("one two three", 7), "one two\nthree");
  assert.equal(wrapGoal("a b c d e f", 1), null, "more than two lines");
  assert.equal(plural("Velociprey"), "Velociprey");
  assert.equal(plural("Hornetaur"), "Hornetaurs");
  assert.equal(plural("Melynx"), "Melynxes");
});

test("a quest's second goal keeps its monster on the map", () => {
  const payload = buildQuestPayload(SPECS[3]!);
  assert.deepEqual(namedMonsters(parseDoc(payload)).sort(), [RATHIAN, RATHALOS]);
});
