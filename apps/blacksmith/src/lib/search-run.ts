/**
 * The page's side of a set search (hooks/useSetSearch.ts): the search is
 * split across workers, each searching its shard of the sets, and run in
 * rounds (lib/set-search.ts). A SearchRun is one search's state, and each
 * function here is one thing that can happen to it, returning the new state
 * and what to show. Pure, so the hook only does what they say, and they are
 * tested on their own.
 */
import {
  DEFAULT_LIMIT,
  mergeResults,
  SEARCH_ROUNDS,
  type ArmorSet,
  type SearchQuery,
  type SearchResult,
} from "./set-search";

export interface SearchRun {
  id: number;
  query: SearchQuery;
  /** The set to show: the one asked for, or stepped to in the live results. */
  index: number;
  round: number;
  /** Each worker's result for this round, once it has sent it. */
  parts: (SearchResult | null)[];
  /** Each worker's count of sets kept so far this round. */
  found: number[];
  /** Each worker's best sets so far this round. */
  partial: ArmorSet[][];
  /** The sets the rounds before found. */
  before: ArmorSet[];
  /**
   * The live results on screen, once there are any (until then, the last
   * search's are).
   */
  shown: SearchResult | null;
}

const limitOf = (run: SearchRun) => run.query.limit ?? DEFAULT_LIMIT;

/** The highest index into `sets` up to `index`. */
const clamp = (index: number, sets: ArmorSet[]) => Math.min(index, Math.max(0, sets.length - 1));

/** A search's state for its first round. */
export function startRun(id: number, query: SearchQuery, workers: number, index = 0): SearchRun {
  return {
    id,
    query,
    index,
    round: 0,
    parts: Array.from({ length: workers }, () => null),
    found: Array.from({ length: workers }, () => 0),
    partial: Array.from({ length: workers }, () => []),
    before: [],
    shown: null,
  };
}

/**
 * A worker's best sets so far: the live results to show (real sets, with the
 * rounds before's still good until this round finds better) and the set to
 * show in them.
 */
export function withSets(
  run: SearchRun,
  shard: number,
  sets: ArmorSet[],
): { run: SearchRun; shown: SearchResult; index: number } {
  const partial = run.partial.map((p, i) => (i === shard ? sets : p));
  const shown = mergeResults(
    [run.before, ...partial].map((s) => ({
      sets: s,
      timedOut: false,
      unknownSkills: [],
      elapsedMs: 0,
    })),
    limitOf(run),
    run.query.sort,
  );
  return { run: { ...run, partial, shown }, shown, index: clamp(run.index, shown.sets) };
}

/**
 * A worker's count of sets kept: the count to show for the whole search.
 * Each worker counts up to the limit, but only that many are kept.
 */
export function withProgress(
  run: SearchRun,
  shard: number,
  found: number,
): { run: SearchRun; found: number } {
  const counts = run.found.map((f, i) => (i === shard ? found : f));
  const sum = counts.reduce((a, b) => a + b, 0);
  return { run: { ...run, found: counts }, found: Math.min(sum, limitOf(run)) };
}

/** What a worker's result for the round means for the search. */
export type RoundStep =
  /** Other workers haven't sent theirs yet. */
  | { kind: "wait"; run: SearchRun }
  /** Not enough sets above this round's floor: run the next round. */
  | { kind: "next"; run: SearchRun }
  /** The search is over: these are its sets, showing set `index`. */
  | { kind: "done"; result: SearchResult; index: number };

export function withResult(run: SearchRun, shard: number, result: SearchResult): RoundStep {
  const parts = run.parts.map((p, i) => (i === shard ? result : p));
  if (parts.some((p) => p === null)) return { kind: "wait", run: { ...run, parts } };
  const done = parts as SearchResult[];
  const sets = done.reduce((n, r) => n + r.sets.length, 0);
  if (sets < limitOf(run) && !done.some((r) => r.timedOut) && run.round + 1 < SEARCH_ROUNDS) {
    const workers = parts.length;
    return {
      kind: "next",
      run: {
        ...run,
        round: run.round + 1,
        before: done.flatMap((r) => r.sets),
        parts: Array.from({ length: workers }, () => null),
        found: Array.from({ length: workers }, () => 0),
        partial: Array.from({ length: workers }, () => []),
      },
    };
  }
  const merged = mergeResults(done, limitOf(run), run.query.sort);
  return { kind: "done", result: merged, index: clamp(run.index, merged.sets) };
}

/**
 * The search stopped before finishing (cancelled or failed): the live
 * results on screen, if any, marked as stopped early, to keep as the last
 * search.
 */
export function stoppedResult(run: SearchRun): { result: SearchResult; index: number } | null {
  if (!run.shown) return null;
  return { result: { ...run.shown, timedOut: true }, index: run.index };
}

/**
 * The user stepped to set `index` while the search runs: the new state, if
 * the steps were through its live results. Null if they were through the
 * last search's sets, still on screen.
 */
export function steppedTo(run: SearchRun, index: number): SearchRun | null {
  return run.shown ? { ...run, index } : null;
}
