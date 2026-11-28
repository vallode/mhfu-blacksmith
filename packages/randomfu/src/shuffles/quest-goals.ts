/**
 * Quest goals (`questGoals`): what a Village or Guild hunting or slaying
 * quest asks for. A goal becomes another from what the quest has, after
 * every other shuffle that changes its monsters (map moves, small monster
 * species, large monster swaps):
 *
 * - **Hunt** one of its large monsters (kill or capture), or **Slay** it
 *   where it can't be captured: the disc gives "Hunt" (flag 1) only to
 *   large monsters that can be captured and "Slay" (0x201) to the rest, so
 *   a monster is capturable here if some Village or Guild quest on the
 *   disc hunts it (`capturableMonsters`).
 * - **Capture** one of them (0x101), if it's capturable: the game's kill
 *   check fails the quest when a goal with 0x100 is killed (`game/goals.ts`).
 *   No quest on the disc asks for one.
 * - **Slay N** of one of its small monsters (0x201), N about a third to a
 *   half of how many the quest has of it, as the disc's own slay goals ask
 *   (15 of 31 Blangos, 20 of 52 Genprey). Only a quest that asked for small
 *   monsters gets one: a hunt stays a large monster's. Never Vespoids
 *   (`NOT_GOALS`), which keep coming in most quests and so would be most
 *   of them.
 *
 * Which large monsters can be a goal: the goal's own, and in a quest with
 * one group of large monsters, each other one there from the start (a
 * record with no timer, quantity 1): those quests start all of theirs. A
 * quest whose large monsters come in waves (several groups: the "Hunt the
 * Tigrex" quests that send a Khezu, then a Giadrome) keeps its target. The
 * count is how many records the monster has, or the goal's own count for
 * its own monster. Quests with two goals ("Hunt the Rathalos and Rathian")
 * keep both monsters, each hunted or captured.
 *
 * Left alone: deliveries and gathering, Treasure Hunting, fortress and
 * "Survive until Time Over" quests (their scripts end the quest another
 * way), and elder dragons' slay-or-repel goals.
 *
 * The goal line is written in English for every language (as the delivery
 * shuffle does), in the disc's style ("Hunt the Rathalos", "Slay 20
 * Genprey", wrapped at 28 columns over at most two lines); plurals are
 * the disc's own, learned from its goals, else `plural`'s. The
 * quest board's records keep their own copy of the goals and the goal line,
 * and get the same. The quest's description and title are left as they are.
 */
import type { BoardFile } from "whetstone/src/game/board.js";
import { questRecords, readRecordText, recordBase } from "whetstone/src/game/board.js";
import {
  CAPTURE_FLAGS,
  GOAL_CAPTURE,
  GOAL_MONSTER,
  GOAL_SLAY,
  GOALS_NEEDED,
  HUNT_FLAGS,
  sameGoals,
  setGoals,
  SLAY_FLAGS,
  TYPE_HUNT,
  TYPE_SLAY,
  writeGoal,
  writeQuestKind,
  type Goal,
} from "../game/goals.js";
import type { LoadedQuest } from "whetstone/src/game/load.js";
import { QUEST_TYPE } from "whetstone/src/game/quest-fields.js";
import {
  readQuestText,
  STRING_FIELDS,
  writeQuestText,
  type QuestText,
} from "whetstone/src/game/quest-text.js";
import { readSpawns } from "../game/spawns.js";
import { questTier } from "whetstone/src/game/tiers.js";
import type { Edits } from "whetstone/src/edits.js";
import { questLabel, type MonsterNames } from "whetstone/src/names.js";
import type { Rng } from "../rng.js";
import { SPECIAL_COUNT } from "./quest-monsters.js";
import { PROPS } from "./small-monsters.js";
import type { Report } from "whetstone/src/report.js";

export interface GoalOptions {
  /** Goals can ask for a capture. */
  capture: boolean;
  /** Slaying quests (small monster goals) can ask for other small monsters, or a large one. */
  small: boolean;
}

/**
 * Script opcodes of the quests that end another way (mhfu-extract README,
 * "Quest script"): "Survive until Time Over" (57), forts (44, 42) and
 * Treasure Hunting (53).
 */
const OTHER_ENDINGS: ReadonlySet<number> = new Set([42, 44, 53, 57]);

/** The EU disc's goal lines are wrapped by hand at this many columns, on at most two lines. */
export const GOAL_WIDTH = 28;
const GOAL_LINES = 2;

/** A small monster goal asks for this share of how many the quest has, at random. */
const SMALL_SHARE = [0.3, 0.5] as const;
/** And never more than this share (the disc's highest is 20 of 38). */
const SMALL_MOST = 0.55;
/**
 * Small monsters no new goal asks for: Vespoids are in most quests, and
 * without end, so they'd be most small goals (41 of 83 on one seed). A
 * quest that asked for them keeps them as a choice.
 */
const NOT_GOALS: ReadonlySet<number> = new Set([19]);
/** A goal of fewer is over before it starts (the disc's fewest is 10). */
const SMALL_FEWEST = 5;
const SMALL_CAP = 30;
/** How many an endless spawn (`SPECIAL_COUNT`) counts as. */
const ENDLESS = 60;

const GOAL = STRING_FIELDS.indexOf("goal");

export type GoalKind = "hunt" | "capture" | "slay";

/** What the goal asks, as the line names it. */
export function goalKind(goal: Goal): GoalKind {
  if (goal.flags & GOAL_CAPTURE) return "capture";
  return goal.flags & GOAL_SLAY ? "slay" : "hunt";
}

/**
 * Large monsters the disc's Village and Guild quests hunt with flag 1
 * alone: the ones that can be captured (`game/goals.ts`). From the quests
 * as they are on the disc.
 */
export function capturableMonsters(quests: readonly LoadedQuest[]): Set<number> {
  const out = new Set<number>();
  for (const quest of quests) {
    if (!questTier(quest.parsed)) continue;
    const { payload } = quest.file;
    const large = new Set(readSpawns(payload, quest.parsed.header).large.map((s) => s.monsterId));
    for (const goal of setGoals(payload)) {
      if (goal.flags === HUNT_FLAGS && large.has(goal.id)) out.add(goal.id);
    }
  }
  return out;
}

/**
 * A plural for a name the disc's goals never count: the disc's text keeps
 * the herbivores' and the Raptors' as they are ("Aptonoth", "Velociprey",
 * "Cephalos") and adds an s to the rest ("Hornetaurs", "Remobras").
 */
export function plural(name: string): string {
  if (/(prey|noth|os|swine|Kelbi|Popo|Anteka)$/.test(name)) return name;
  return /x$/.test(name) ? `${name}es` : `${name}s`;
}

/** Plurals the disc's own goals use ("Slay 15 Blangos"), by emID, from the English text. */
export function learnPlurals(quests: readonly LoadedQuest[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const quest of quests) {
    const text = quest.parsed.strings?.goal;
    const m = text?.replace(/\s*\n\s*/g, " ").match(/^(?:Hunt|Slay|Capture) (\d+) (.+)$/);
    if (!m || Number(m[1]) < 2) continue;
    const goal = setGoals(quest.file.payload)[0];
    if (goal && goal.flags & GOAL_MONSTER && goal.count === Number(m[1])) out.set(goal.id, m[2]!);
  }
  return out;
}

/** Words into at most `lines` lines of `width` columns, or null if they don't fit. */
export function wrapGoal(text: string, width = GOAL_WIDTH, lines = GOAL_LINES): string | null {
  const out: string[] = [];
  for (const word of text.split(" ")) {
    if ([...word].length > width) return null;
    const last = out[out.length - 1];
    if (last !== undefined && [...`${last} ${word}`].length <= width)
      out[out.length - 1] += ` ${word}`;
    else out.push(word);
  }
  return out.length <= lines ? out.join("\n") : null;
}

const VERB: Record<GoalKind, string> = { hunt: "Hunt", capture: "Capture", slay: "Slay" };

/**
 * The goal line for `goals`, in the disc's style, or null if it can't be
 * wrapped into the box. `plurals` name a count of a monster ("Blangos"),
 * else `plural` does.
 */
export function goalLine(
  goals: readonly Goal[],
  name: MonsterNames,
  plurals: ReadonlyMap<number, string>,
): string | null {
  const part = (goal: Goal, short: boolean) => {
    const verb = VERB[goalKind(goal)];
    if (goal.count === 1) return `${verb}${short ? "" : " the"} ${name(goal.id)}`;
    return `${verb} ${goal.count} ${plurals.get(goal.id) ?? plural(name(goal.id))}`;
  };
  const tries: string[] = [];
  const [a, b] = goals;
  if (!a) return null;
  if (!b) {
    tries.push(part(a, false), part(a, true));
  } else if (goalKind(a) === goalKind(b) && a.count === 1 && b.count === 1) {
    // "Hunt the Rathalos and Rathian", as the disc has it.
    tries.push(`${part(a, false)} and ${name(b.id)}`, `${part(a, true)} and ${name(b.id)}`);
  } else {
    const lower = (s: string) => s[0]!.toLowerCase() + s.slice(1);
    tries.push(`${part(a, false)} and ${lower(part(b, false))}`);
    tries.push(`${part(a, true)} and ${lower(part(b, true))}`);
  }
  for (const line of tries) {
    const wrapped = wrapGoal(line);
    if (wrapped) return wrapped;
  }
  return null;
}

/** Every block's goal string, pointed at `line`: identical strings are stored once. */
function goalChanges(text: QuestText, line: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const block of text.blocks) {
    const ptr = block.pointers[GOAL]!;
    if (ptr !== 0) out.set(ptr, line);
  }
  return out;
}

interface Candidate {
  goals: Goal[];
  /** Which of `GoalKind`s (small "slay" apart from large) the draw picked it as. */
  pool: string;
}

/** Whether the quest's script ends it only by its goals (or time). */
function endsByGoals(payload: Buffer): boolean {
  const start = payload.readUInt32LE(0x10);
  const end = payload.readUInt32LE(0x08);
  if (start < 0x80 || end <= start || end > payload.length) return true;
  for (let at = start; at + 8 <= end; at += 8) {
    if (OTHER_ENDINGS.has(payload.readInt16LE(at))) return false;
  }
  return true;
}

/**
 * The large monsters a goal can name, and how many: in a quest with one
 * group, every one there from the start (quantity 1, no flag or timer in
 * the record's +10 and +12: the delivery quests' late arrivals have one);
 * else none.
 */
function largeTargets(payload: Buffer, quest: LoadedQuest): Map<number, number> {
  const counts = new Map<number, number>();
  const at = quest.parsed.header.largeMonPtr;
  // Groups: the large monster tables (16 bytes, until a u16 0), by their records.
  const groups = new Set<number>();
  for (let t = at; at !== 0 && t + 16 <= payload.length && payload.readUInt16LE(t) !== 0; t += 16) {
    groups.add(payload.readUInt32LE(t + 12));
    if (groups.size > 1) return counts;
  }
  const unfit = new Set<number>();
  for (const { monsterId, offset, quantity } of readSpawns(payload, quest.parsed.header).large) {
    const late =
      payload.readUInt16LE(offset + 10) !== 0 ||
      [12, 16, 20].some((d) => payload.readUInt32LE(offset + d) !== 0);
    if (quantity !== 1 || late) unfit.add(monsterId);
    counts.set(monsterId, (counts.get(monsterId) ?? 0) + 1);
  }
  for (const id of unfit) counts.delete(id);
  return counts;
}

/** How many of each small monster the quest has; endless spawns count as `ENDLESS`. */
function smallCounts(payload: Buffer, quest: LoadedQuest): Map<number, number> {
  const out = new Map<number, number>();
  for (const { monsterId, quantity } of readSpawns(payload, quest.parsed.header).small) {
    if (PROPS.has(monsterId) || quantity === 0) continue;
    const n = quantity >= SPECIAL_COUNT ? ENDLESS : quantity;
    out.set(monsterId, Math.min(ENDLESS, (out.get(monsterId) ?? 0) + n));
  }
  return out;
}

/** How many of a small monster a goal asks for, out of `have`; null if too few. */
function smallCount(have: number, rng: Rng): number | null {
  const most = Math.min(SMALL_CAP, Math.floor(have * SMALL_MOST));
  if (most < SMALL_FEWEST) return null;
  const share = SMALL_SHARE[0] + (SMALL_SHARE[1] - SMALL_SHARE[0]) * rng.float();
  let n = Math.round(have * share);
  if (n >= 10) n = Math.round(n / 5) * 5;
  return Math.max(SMALL_FEWEST, Math.min(most, n));
}

export function randomizeGoals(
  quests: readonly LoadedQuest[],
  /** The quests as they are on the disc, for what can be captured and the plurals. */
  disc: readonly LoadedQuest[],
  options: GoalOptions,
  rng: Rng,
  edits: Edits,
  monsterName: MonsterNames,
  boards: readonly BoardFile[] = [],
): Report {
  const capturable = capturableMonsters(disc);
  const plurals = learnPlurals(disc);
  const lines: Report["lines"] = [];
  const kinds = new Map<string, number>();
  let eligible = 0;
  let changed = 0;
  let noRoom = 0;
  let boardKept = 0;
  const huntOrSlay = (id: number) => (capturable.has(id) ? HUNT_FLAGS : SLAY_FLAGS);

  for (const quest of quests) {
    if (!questTier(quest.parsed)) continue;
    const now = edits.questNow(quest);
    const kind = now[QUEST_TYPE]!;
    if (kind !== TYPE_HUNT && kind !== TYPE_SLAY) continue;
    const goals = setGoals(now);
    if (goals.length === 0 || goals.length > 2 || now[GOALS_NEEDED] !== goals.length) continue;
    if (!goals.every((g) => g.flags === HUNT_FLAGS || g.flags === SLAY_FLAGS)) continue;
    if (!endsByGoals(now)) continue;
    const spawns = readSpawns(now, quest.parsed.header);
    const large = new Set(spawns.large.map((s) => s.monsterId));
    const small = smallCounts(now, quest);
    if (!goals.every((g) => large.has(g.id) || small.has(g.id))) continue;
    // Each record of the board must carry the quest's goals, to follow it.
    const records = questRecords(boards, quest.parsed.header.questId);
    const recordsMatch = records.every(({ board, record }) =>
      sameGoals(setGoals(edits.dataFileNow(board.index), recordBase(record)), goals),
    );
    eligible++;

    // Every goal the quest could have, in the order to try them.
    const candidates: Candidate[] = [];
    if (goals.length === 2) {
      // Both stay; each is hunted or captured.
      if (goals.every((g) => large.has(g.id))) {
        const each = goals.map((g) => {
          const can = options.capture && capturable.has(g.id);
          const capture = can && rng.int(2) === 1;
          return { ...g, flags: capture ? CAPTURE_FLAGS : huntOrSlay(g.id) };
        });
        candidates.push({ goals: each, pool: "two goals" });
      }
    } else {
      const [goal] = goals as [Goal];
      const pools = new Map<string, Goal[]>();
      const add = (pool: string, g: Goal) =>
        (pools.get(pool) ?? pools.set(pool, []).get(pool)!).push(g);
      // A hunt stays a large monster's; a slaying quest changes only with `small`.
      const hunt = large.has(goal.id);
      if (hunt || options.small) {
        const targets = largeTargets(now, quest);
        if (hunt) targets.set(goal.id, goal.count);
        for (const [id, count] of [...targets].sort((a, b) => a[0] - b[0])) {
          add("hunt", { flags: huntOrSlay(id), id, count });
          if (options.capture && capturable.has(id))
            add("capture", { flags: CAPTURE_FLAGS, id, count });
        }
      }
      if (!hunt && options.small) {
        for (const [id, have] of [...small].sort((a, b) => a[0] - b[0])) {
          if (large.has(id) || (NOT_GOALS.has(id) && id !== goal.id)) continue;
          // The goal's own monster keeps its own count.
          const count = id === goal.id ? goal.count : smallCount(have, rng);
          if (count !== null) add("small", { flags: SLAY_FLAGS, id, count });
        }
      }
      // A pool at random, then a goal in it; then the rest, the same way.
      while (pools.size > 0) {
        const names = [...pools.keys()];
        const pool = names[rng.int(names.length)]!;
        const list = pools.get(pool)!;
        const [picked] = list.splice(rng.int(list.length), 1);
        if (list.length === 0) pools.delete(pool);
        candidates.push({ goals: [picked!], pool });
      }
    }
    if (candidates.length === 0) continue;
    const was = goalLine(goals, monsterName, plurals)?.replace(/\n/g, " ") ?? "?";
    if (sameGoals(candidates[0]!.goals, goals)) continue;
    if (!recordsMatch) {
      lines.push({
        where: questLabel(quest),
        text: `${was}, unchanged: its board record's goals differ from the quest's`,
      });
      boardKept++;
      continue;
    }

    let done = false;
    for (const candidate of candidates) {
      if (sameGoals(candidate.goals, goals)) break;
      const line = goalLine(candidate.goals, monsterName, plurals);
      if (!line) continue;
      // Scratch copies: nothing is kept unless the line fits in the quest and every record.
      const payload = Buffer.from(now);
      let fits = false;
      try {
        const text = readQuestText(payload, quest.parsed.header);
        fits = writeQuestText(payload, text, goalChanges(text, line));
      } catch {
        fits = false;
      }
      const files = new Map<number, Buffer>();
      for (const { board, record } of records) {
        if (!fits) break;
        const data = files.get(board.index) ?? Buffer.from(edits.dataFileNow(board.index));
        files.set(board.index, data);
        const { text } = readRecordText(data, board, record);
        fits = !text.locked && writeQuestText(data, text, goalChanges(text, line));
        if (fits) writeAll(data, candidate.goals, recordBase(record));
      }
      if (!fits) {
        noRoom++;
        continue;
      }
      writeAll(payload, candidate.goals, 0);
      payload.copy(edits.quest(quest));
      for (const [index, data] of files) data.copy(edits.dataFile(index));
      const text = line.replace(/\n/g, " ");
      lines.push({ where: questLabel(quest), text: `${text} (was ${was})` });
      kinds.set(candidate.pool, (kinds.get(candidate.pool) ?? 0) + 1);
      changed++;
      done = true;
      break;
    }
    if (!done)
      lines.push({ where: questLabel(quest), text: `${was}, unchanged: no new goal line fits` });
  }

  const counted = ["hunt", "capture", "small", "two goals"]
    .filter((k) => kinds.has(k))
    .map(
      (k) =>
        `${kinds.get(k)} ${{ hunt: "hunt or slay a large monster", capture: "capture one", small: "slay small monsters", "two goals": "two goals, each hunted or captured" }[k]}`,
    );
  const notes = [
    "Each Village and Guild hunting quest asks to hunt one of its large monsters (slay, for those that can't be captured)" +
      (options.capture ? " or to capture one that can be (killing it fails the quest)" : "") +
      "; a hunt never becomes small monsters." +
      (options.small
        ? " Each slaying quest asks for a third to a half of another of its small monsters (never Vespoids), or for one of its large monsters."
        : " Slaying quests keep their goals.") +
      " Quests whose large monsters come in waves keep their target; quests with two goals keep both monsters.",
    `Capturable monsters (those the disc's quests hunt): ${capturable.size}. Plurals learned from the disc's goals: ${plurals.size}.`,
    "The goal line is rewritten in English for every language, on the quest board too; the title and description aren't changed.",
    'Deliveries, gathering, Treasure Hunting, fortress, "Survive until Time Over" and elder dragon quests keep their goals.',
    `${changed} of ${eligible} quests changed${counted.length > 0 ? ` (${counted.join(", ")})` : ""}.`,
  ];
  if (noRoom > 0)
    notes.push(`${noRoom} goals were passed over: their line had no room in the quest's text.`);
  if (boardKept > 0)
    notes.push(`${boardKept} quests kept their goals: a board record's copy differs (listed).`);
  return { title: "Quest goals", notes, lines };
}

/** Writes the goals, the quest's kind to match, and how many must be met. */
function writeAll(payload: Buffer, goals: readonly Goal[], base: number): void {
  goals.forEach((g, i) => writeGoal(payload, i, g, base));
  payload[base + GOALS_NEEDED] = goals.length;
  const slay = goals.length === 1 && (goals[0]!.flags & GOAL_SLAY) !== 0;
  writeQuestKind(payload, slay ? TYPE_SLAY : TYPE_HUNT, base);
}
