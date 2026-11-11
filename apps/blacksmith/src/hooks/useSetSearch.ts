"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadSetSearchData } from "@/lib/client-data";
import {
  DEFAULT_LIMIT,
  mergeResults,
  SEARCH_ROUNDS,
  type ArmorSet,
  type SearchData,
  type SearchQuery,
  type SearchResult,
} from "@/lib/set-search";
import type { SetSearchRequest, SetSearchResponse } from "@/workers/set-search.worker";

export interface SetSearchState {
  /** Armor, decorations and skills; null while loading. */
  data: SearchData | null;
  loadError: string | null;
  searching: boolean;
  /** Sets found so far by the running search. */
  found: number;
  result: SearchResult | null;
  /** The query behind `result` (the form may have changed since). */
  query: SearchQuery | null;
  /** The set being shown, an index into `result.sets`. */
  index: number;
  setIndex: (index: number) => void;
  error: string | null;
  search: (query: SearchQuery) => void;
  cancel: () => void;
}

/**
 * The last search, kept across visits to the page: in memory for client-side
 * navigation (back from a piece's page shows it at once), and its query in
 * sessionStorage, so a reload or a full page load reruns it.
 */
interface LastSearch {
  query: SearchQuery;
  index: number;
  result?: SearchResult;
}

const STORAGE_KEY = "set-builder-search";
let lastSearch: LastSearch | null = null;

function readLast(): LastSearch | null {
  if (lastSearch) return lastSearch;
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as LastSearch | null;
    return stored?.query ? { query: stored.query, index: stored.index ?? 0 } : null;
  } catch {
    return null;
  }
}

function writeLast(last: LastSearch | null) {
  lastSearch = last;
  try {
    if (last) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ query: last.query, index: last.index }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage blocked: the search is only kept in memory.
  }
}

/**
 * How many workers share a search: half the cores (the page and the rest of
 * the device keep the others), at most four.
 */
function workerCount(): number {
  const cores = typeof navigator === "undefined" ? 2 : navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(4, Math.floor(cores / 2)));
}

/** The running search: its query, the set to show, and each worker's part of its round. */
interface Pending {
  id: number;
  query: SearchQuery;
  index: number;
  round: number;
  parts: (SearchResult | null)[];
  found: number[];
  /** Each worker's best sets so far this round, and the last round's. */
  partial: ArmorSet[][];
  before: ArmorSet[];
  /** Its sets are on screen (until then, the last search's are): the latest. */
  shown: SearchResult | null;
}

/** Ask every worker for its shard of a round. */
function postRound(workers: Worker[], run: Pending) {
  run.parts = workers.map(() => null);
  run.found = workers.map(() => 0);
  run.partial = workers.map(() => []);
  workers.forEach((worker, index) =>
    worker.postMessage({
      type: "search",
      id: run.id,
      query: run.query,
      round: run.round,
      shard: { index, count: workers.length },
    } satisfies SetSearchRequest),
  );
}

/** Loads the set search data and runs searches in workers. */
export function useSetSearch(): SetSearchState {
  const [data, setData] = useState<SearchData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [query, setQuery] = useState<SearchQuery | null>(null);
  const [index, setIndexState] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const workersRef = useRef<Worker[]>([]);
  const searchId = useRef(0);
  const pending = useRef<Pending | null>(null);

  // Show the last search again (sessionStorage only exists in the browser).
  useEffect(() => {
    const last = readLast();
    if (!last) return;
    setQuery(last.query);
    if (last.result) {
      setResult(last.result);
      setIndexState(last.index);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSetSearchData().then(
      (d) => !cancelled && setData(d),
      (e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const post = useCallback((workers: Worker[], q: SearchQuery, showIndex = 0) => {
    const run: Pending = {
      id: ++searchId.current,
      query: q,
      index: showIndex,
      round: 0,
      parts: [],
      found: [],
      partial: [],
      before: [],
      shown: null,
    };
    pending.current = run;
    setSearching(true);
    setFound(0);
    setError(null);
    postRound(workers, run);
  }, []);

  /** Starts fresh workers (startWorkers, once it exists). */
  const restart = useRef<(() => void) | null>(null);
  /** The workers failed outside a search: start new ones for the next. */
  const failed = useRef(false);

  const stop = useCallback((message: string) => {
    searchId.current++;
    pending.current = null;
    setSearching(false);
    setError(message);
    // The other workers may still be on the search: start afresh.
    restart.current?.();
  }, []);

  const startWorkers = useCallback(
    (d: SearchData) => {
      const workers = Array.from({ length: workerCount() }, (_, shard) => {
        const worker = new Worker(new URL("../workers/set-search.worker.ts", import.meta.url));
        worker.onmessage = (event: MessageEvent<SetSearchResponse>) => {
          const msg = event.data;
          const run = pending.current;
          if (msg.id !== searchId.current || !run) return; // a cancelled search
          if (msg.type === "error") {
            stop(msg.error);
            return;
          }
          if (msg.type === "sets") {
            // Show the best sets found so far: they're real sets, and the
            // last round's are still good until this round finds better.
            run.partial[shard] = msg.sets;
            const sofar = mergeResults(
              [run.before, ...run.partial].map((sets) => ({
                sets,
                timedOut: false,
                unknownSkills: [],
                elapsedMs: 0,
              })),
              run.query.limit ?? DEFAULT_LIMIT,
              run.query.sort,
            );
            const last = Math.max(0, sofar.sets.length - 1);
            setResult(sofar);
            setQuery(run.query);
            // The set asked for (or stepped to since), not the last search's.
            setIndexState(Math.min(run.index, last));
            run.shown = sofar;
            return;
          }
          if (msg.type === "progress") {
            run.found[shard] = msg.found;
            // Each round starts counting again: show the most found so far.
            // Each worker counts up to the limit, but only that many are kept.
            const sum = run.found.reduce((a, b) => a + b, 0);
            const limit = run.query.limit ?? DEFAULT_LIMIT;
            setFound((f) => Math.max(f, Math.min(sum, limit)));
            return;
          }
          run.parts[shard] = msg.result;
          if (run.parts.some((r) => r === null)) return;
          const parts = run.parts as SearchResult[];
          const limit = run.query.limit ?? DEFAULT_LIMIT;
          // Not enough sets above this round's floor: lower it.
          const sets = parts.reduce((n, r) => n + r.sets.length, 0);
          if (sets < limit && !parts.some((r) => r.timedOut) && run.round + 1 < SEARCH_ROUNDS) {
            run.before = parts.flatMap((r) => r.sets);
            run.round++;
            postRound(workersRef.current, run);
            return;
          }
          const merged = mergeResults(parts, limit, run.query.sort);
          pending.current = null;
          for (const w of workersRef.current) {
            w.postMessage({ type: "done", id: run.id } satisfies SetSearchRequest);
          }
          const shown = Math.min(run.index, Math.max(0, merged.sets.length - 1));
          setSearching(false);
          setResult(merged);
          setQuery(run.query);
          setIndexState(shown);
          setError(null);
          writeLast({ query: run.query, index: shown, result: merged });
        };
        worker.onerror = (event) => {
          // Only the current workers count (one restart per failure), and
          // only a running search restarts them: a worker that can't even
          // load would fail again.
          if (!workersRef.current.includes(worker)) return;
          const message = event.message || "The search stopped unexpectedly.";
          if (pending.current) stop(message);
          else {
            failed.current = true;
            setError(message);
          }
        };
        worker.postMessage({ type: "init", data: d } satisfies SetSearchRequest);
        return worker;
      });
      workersRef.current = workers;
      return workers;
    },
    [stop],
  );

  useEffect(() => {
    if (!data) return;
    restart.current = () => {
      for (const w of workersRef.current) w.terminate();
      startWorkers(data);
    };
    return () => {
      restart.current = null;
    };
  }, [data, startWorkers]);

  useEffect(() => {
    if (!data) return;
    const workers = startWorkers(data);
    // A search kept from an earlier visit without its results (after a
    // reload): run it again.
    const last = readLast();
    if (last && !last.result) post(workers, last.query, last.index);
    return () => {
      // cancel() may have replaced the first workers.
      for (const w of workersRef.current) w.terminate();
      workersRef.current = [];
    };
  }, [data, startWorkers, post]);

  const search = useCallback(
    (q: SearchQuery) => {
      // Once only: if the new workers fail too, the search stops with the error.
      if (failed.current) {
        failed.current = false;
        restart.current?.();
      }
      if (workersRef.current.length > 0) post(workersRef.current, q);
    },
    [post],
  );

  const cancel = useCallback(() => {
    if (!data) return;
    // Its live results stay on screen: they're the last search now.
    const run = pending.current;
    if (run?.shown) writeLast({ query: run.query, index: run.index, result: run.shown });
    searchId.current++;
    pending.current = null;
    failed.current = false;
    for (const w of workersRef.current) w.terminate();
    startWorkers(data);
    setSearching(false);
  }, [data, startWorkers]);

  const setIndex = useCallback((i: number) => {
    setIndexState(i);
    // Stepping through live results: keep the set when the search ends.
    // Until they show, the steps are through the last search's sets.
    const run = pending.current;
    if (run?.shown) run.index = i;
    else if (lastSearch) writeLast({ ...lastSearch, index: i });
  }, []);

  return {
    data,
    loadError,
    searching,
    found,
    result,
    query,
    index,
    setIndex,
    error,
    search,
    cancel,
  };
}
