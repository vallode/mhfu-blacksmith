/**
 * Quest terms: the contract fee, reward and penalty (zenny) and the time
 * limit in each Village and Guild quest's header (`readTerms`). The quest
 * board files keep their own copy of that part of the header, which the
 * board and the Quest Details screen read (`game/board.ts`), so each of a
 * quest's board records gets the same terms. No quest text repeats them.
 *
 * On the disc the penalty is a fixed share of the reward (a third, mostly)
 * and the reward a multiple of the fee (12x in the Guild, 6x in the
 * Village). The reward and penalty share one factor, so that share stays;
 * the fee gets its own, and never costs more than the reward pays.
 *
 * Time limits stay within the shortest and longest on the disc (20 and 50
 * minutes on the EU disc): longer ones have never been shown by the game.
 */
import type { LoadedQuest } from "../game/load.js";
import { boardName, questRecords, recordBase, type BoardFile } from "../game/board.js";
import {
  readTerms,
  sameTerms,
  TICKS_PER_MINUTE,
  writeTerms,
  type QuestTerms,
} from "../game/quest-fields.js";
import { questTier } from "../game/tiers.js";
import type { Edits } from "../edits.js";
import { questLabel } from "../names.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport } from "./shuffle.js";

export interface TermsSlot {
  quest: LoadedQuest;
  terms: QuestTerms;
}

export function collectTermsSlots(quests: readonly LoadedQuest[]): TermsSlot[] {
  return quests
    .filter((q) => questTier(q.parsed) !== null)
    .map((quest) => ({ quest, terms: readTerms(quest.file.payload) }));
}

export interface TermsOptions {
  /** How far money moves (0.5 = 50% to 150%), or null to leave it. */
  moneySpread: number | null;
  /** How far time limits move, or null to leave them. */
  timeSpread: number | null;
}

const ZENNY_STEP = 10;

function scaleZenny(value: number, factor: number): number {
  if (value === 0) return 0;
  return Math.max(ZENNY_STEP, Math.round((value * factor) / ZENNY_STEP) * ZENNY_STEP);
}

const minutes = (ticks: number) => Math.round(ticks / TICKS_PER_MINUTE);

export function randomizeTerms(
  slots: readonly TermsSlot[],
  options: TermsOptions,
  rngs: { money: Rng; time: Rng },
  edits: Edits,
  boards: readonly BoardFile[] = [],
): ShuffleReport {
  const factor = (rng: Rng, spread: number) => 1 - spread + rng.float() * 2 * spread;
  const limits = slots.map((s) => minutes(s.terms.timeLimit)).filter((m) => m > 0);
  const shortest = Math.min(...limits);
  const longest = Math.max(...limits);
  let boardRecords = 0;
  let boardKept = 0;

  const lines = slots.flatMap(({ quest, terms }) => {
    const next = { ...terms };
    const parts: string[] = [];
    if (options.moneySpread !== null) {
      const pay = factor(rngs.money, options.moneySpread);
      const fee = factor(rngs.money, options.moneySpread);
      next.reward = scaleZenny(terms.reward, pay);
      next.penalty = scaleZenny(terms.penalty, pay);
      next.fee = scaleZenny(terms.fee, fee);
      if (next.reward > 0) next.fee = Math.min(next.fee, next.reward);
      parts.push(
        `reward ${next.reward}z (was ${terms.reward}z)`,
        `fee ${next.fee}z (was ${terms.fee}z)`,
        `penalty ${next.penalty}z (was ${terms.penalty}z)`,
      );
    }
    if (options.timeSpread !== null && minutes(terms.timeLimit) > 0) {
      const scaled = Math.round(minutes(terms.timeLimit) * factor(rngs.time, options.timeSpread));
      const limit = Math.min(longest, Math.max(shortest, scaled));
      next.timeLimit = limit * TICKS_PER_MINUTE;
      parts.push(`${limit} min (was ${minutes(terms.timeLimit)})`);
    }
    if (parts.length === 0) return [];
    const where = questLabel(quest);
    if (sameTerms(next, terms)) return [{ where, text: parts.join(", ") }];
    // A copy that doesn't match the quest isn't one this knows how to read,
    // and the board and the quest must agree, so the quest keeps its terms.
    const records = questRecords(boards, quest.parsed.header.questId);
    const differs = records.find(
      ({ board, record }) =>
        !sameTerms(readTerms(edits.dataFileNow(board.index), recordBase(record)), terms),
    );
    if (differs) {
      boardKept++;
      return [
        {
          where,
          text: `unchanged: its board record (${boardName(differs.board)}) has different terms from the quest's`,
        },
      ];
    }
    writeTerms(edits.quest(quest), next);
    for (const { board, record } of records) {
      writeTerms(edits.dataFile(board.index), next, recordBase(record));
      boardRecords++;
    }
    return [{ where, text: parts.join(", ") }];
  });

  const notes: string[] = [];
  if (options.moneySpread !== null) {
    const s = options.moneySpread;
    notes.push(
      `Rewards and penalties move together, to ${Math.round((1 - s) * 100)}% to ${Math.round((1 + s) * 100)}% of the usual; fees move on their own, in steps of 10z, and never exceed the reward.`,
    );
  }
  if (options.timeSpread !== null) {
    notes.push(
      `Time limits vary by up to ${Math.round(options.timeSpread * 100)}%, in whole minutes, from ${shortest} to ${longest} minutes (the shortest and longest on the disc).`,
    );
  }
  notes.push(
    boards.length > 0
      ? `The quest board's copies, which the board and Quest Details screen show, change with them: ${boardRecords} records in level*.mib.${boardKept > 0 ? ` ${boardKept} quests keep their terms because a board record's copy doesn't match the quest's (listed).` : ""}`
      : "No quest board file (level*.mib) could be read, so the board and Quest Details screen show the old terms.",
    "Training School, Treasure Hunting and unused quests are unchanged.",
  );
  return { title: "Quest terms", notes, lines };
}
