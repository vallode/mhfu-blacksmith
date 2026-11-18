/**
 * Writes the bookshelf guides chosen in the settings in one repack, so
 * they share their room: the Bestiary gets what it needs first (it has
 * the least to spare), the Almanac the rest, each shrinking itself to fit
 * (`GuidePlan.fit`). Runs after every shuffle.
 */
import type { ParsedQuest } from "mhfu-extract/src/quests/parser.js";
import type { Edits } from "../edits.js";
import type { GameData } from "../game/load.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import { planAlmanac } from "./almanac.js";
import { planBestiary } from "./bestiary.js";
import { shelfRoom, textBytes, writeShelf, type GuidePlan } from "./bookshelf.js";

/**
 * Shares `room` bytes between the plans, in order: each takes what it
 * needs, leaving the later ones their smallest.
 */
export function fitGuides(
  plans: readonly Pick<GuidePlan, "fit">[],
  room: number,
): ReturnType<GuidePlan["fit"]>[] {
  const smallest = plans.map((p) => textBytes(p.fit(0).texts));
  let left = room;
  return plans.map((plan, i) => {
    const later = smallest.slice(i + 1).reduce((n, b) => n + b, 0);
    const book = plan.fit(left - later);
    left -= textBytes(book.texts);
    return book;
  });
}

export function writeGuides(
  game: GameData,
  quests: readonly ParsedQuest[],
  seed: string,
  edits: Edits,
  which: { bestiary: boolean; almanac: boolean },
): ShuffleReport[] {
  const plans: GuidePlan[] = [];
  if (which.bestiary) plans.push(planBestiary(game, quests, seed, edits));
  if (which.almanac) plans.push(planAlmanac(game, quests, seed, edits));
  if (plans.length === 0) return [];
  const notWritten = (problem: string) =>
    plans.map((p) => ({ title: p.title, notes: [`Not written: ${problem}.`], lines: [] }));

  const check = shelfRoom(
    game,
    edits,
    plans.map((p) => p.articles),
  );
  if ("problem" in check) return notWritten(check.problem);

  const books = fitGuides(plans, check.room);
  const problem = writeShelf(
    game,
    edits,
    plans.map((p, i) => ({ articles: p.articles, texts: books[i]!.texts })),
  );
  if (problem) return notWritten(problem);
  return books.map((b) => b.report);
}
