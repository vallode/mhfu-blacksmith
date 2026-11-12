/**
 * The page's side of a set search split across workers and rounds
 * (lib/search-run.ts): when to run another round, what live results to
 * show, what a stopped search keeps, and which set stays shown.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  startRun,
  steppedTo,
  stoppedResult,
  withProgress,
  withResult,
  withSets,
  type SearchRun,
} from "../src/lib/search-run";
import {
  SEARCH_ROUNDS,
  type ArmorSet,
  type Piece,
  type SearchQuery,
  type SearchResult,
} from "../src/lib/set-search";

/** A set told apart by its one piece's id, ranked by its defence. */
const set = (id: number, defence: number, freeSlots = 0): ArmorSet => ({
  pieces: [{ id } as Piece],
  alternatives: [[]],
  decorations: [],
  defence,
  res: [0, 0, 0, 0, 0],
  totals: {},
  skills: [],
  freeSlots,
});

const result = (sets: ArmorSet[], timedOut = false): SearchResult => ({
  sets,
  timedOut,
  unknownSkills: [],
  elapsedMs: 0,
});

const query: SearchQuery = {
  skills: ["Attack Up (Small)"],
  hunterType: "Blademaster",
  sex: "Male",
  rank: "g-rank",
  weaponSlots: 0,
  allowBadSkills: false,
  limit: 3,
};

const defences = (r: SearchResult) => r.sets.map((s) => s.defence);

/** Both workers' results for the run's round, in order. */
function finishRound(run: SearchRun, a: SearchResult, b: SearchResult) {
  const first = withResult(run, 0, a);
  assert.equal(first.kind, "wait");
  return withResult((first as { run: SearchRun }).run, 1, b);
}

describe("search run", () => {
  test("starts with a slot per worker", () => {
    const run = startRun(7, query, 2, 4);
    assert.equal(run.id, 7);
    assert.equal(run.index, 4);
    assert.equal(run.round, 0);
    assert.deepEqual(run.parts, [null, null]);
    assert.deepEqual(run.found, [0, 0]);
    assert.deepEqual(run.partial, [[], []]);
    assert.equal(run.shown, null);
  });

  test("waits for every worker, then runs another round when too few sets", () => {
    const run = startRun(1, query, 2);
    const step = finishRound(run, result([set(1, 50)]), result([set(2, 40)]));
    assert.equal(step.kind, "next");
    const next = (step as { run: SearchRun }).run;
    assert.equal(next.round, 1);
    assert.deepEqual(
      next.before.map((s) => s.defence),
      [50, 40],
    );
    assert.deepEqual(next.parts, [null, null]);
    assert.deepEqual(next.found, [0, 0]);
    // The run it came from is unchanged.
    assert.deepEqual(run.parts, [null, null]);
  });

  test("ends with the best sets when there are enough", () => {
    const run = startRun(1, query, 2, 5);
    const step = finishRound(
      run,
      result([set(1, 50), set(2, 30)]),
      result([set(3, 60), set(4, 40), set(1, 50)]),
    );
    assert.equal(step.kind, "done");
    const { result: done, index } = step as { result: SearchResult; index: number };
    // Best first, each set once, cut to the limit.
    assert.deepEqual(defences(done), [60, 50, 40]);
    // The set asked for, within the sets there are.
    assert.equal(index, 2);
  });

  test("ends when a worker runs out of time, or after the last round", () => {
    const run = startRun(1, query, 2);
    const timedOut = finishRound(run, result([set(1, 50)], true), result([]));
    assert.equal(timedOut.kind, "done");
    assert.equal((timedOut as { result: SearchResult }).result.timedOut, true);

    const last = { ...run, round: SEARCH_ROUNDS - 1 };
    assert.equal(finishRound(last, result([set(1, 50)]), result([])).kind, "done");
  });

  test("shows live results merged with the rounds before's", () => {
    let run: SearchRun = { ...startRun(1, query, 2, 4), before: [set(9, 45)] };
    const first = withSets(run, 0, [set(1, 50), set(9, 45)]);
    assert.deepEqual(defences(first.shown), [50, 45]);
    assert.equal(first.index, 1);
    run = first.run;
    const second = withSets(run, 1, [set(2, 70), set(3, 20)]);
    assert.deepEqual(defences(second.shown), [70, 50, 45]);
    assert.equal(second.run.shown, second.shown);
    // Worker 0's sets are kept while worker 1's arrive.
    assert.deepEqual(
      second.run.partial[0].map((s) => s.defence),
      [50, 45],
    );
  });

  test("counts sets across workers up to the limit", () => {
    let run = startRun(1, query, 2);
    const a = withProgress(run, 0, 2);
    assert.equal(a.found, 2);
    run = a.run;
    assert.equal(withProgress(run, 1, 2).found, 3);
  });

  test("a stopped search keeps its live results, marked as stopped early", () => {
    const run = startRun(1, query, 2, 1);
    assert.equal(stoppedResult(run), null);
    const live = withSets(run, 0, [set(1, 50), set(2, 40)]).run;
    const kept = stoppedResult(live);
    assert.ok(kept);
    assert.equal(kept.result.timedOut, true);
    assert.deepEqual(defences(kept.result), [50, 40]);
    assert.equal(kept.index, 1);
  });

  test("steps move the search's set only once its live results show", () => {
    const run = startRun(1, query, 2);
    // Still the last search's sets on screen: not this search's.
    assert.equal(steppedTo(run, 3), null);
    const live = withSets(run, 0, [set(1, 50), set(2, 40)]).run;
    const stepped = steppedTo(live, 1);
    assert.equal(stepped?.index, 1);
    // ...and that's the set shown when it ends.
    const step = finishRound(stepped!, result([set(1, 50), set(2, 40)]), result([set(3, 30)]));
    assert.equal((step as { index: number }).index, 1);
  });
});
