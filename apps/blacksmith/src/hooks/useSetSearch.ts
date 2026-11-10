"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadSetSearchData } from "@/lib/client-data";
import type { SearchData, SearchQuery, SearchResult } from "@/lib/set-search";
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

/** Loads the set search data and runs searches in a worker. */
export function useSetSearch(): SetSearchState {
  const [data, setData] = useState<SearchData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [query, setQuery] = useState<SearchQuery | null>(null);
  const [index, setIndexState] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const searchId = useRef(0);
  /** The query of the running search, and the set to show when it's done. */
  const pending = useRef<{ query: SearchQuery; index: number } | null>(null);

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

  const post = useCallback((worker: Worker, q: SearchQuery, showIndex = 0) => {
    const id = ++searchId.current;
    pending.current = { query: q, index: showIndex };
    setSearching(true);
    setFound(0);
    setError(null);
    worker.postMessage({ type: "search", id, query: q } satisfies SetSearchRequest);
  }, []);

  const startWorker = useCallback((d: SearchData) => {
    const worker = new Worker(new URL("../workers/set-search.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<SetSearchResponse>) => {
      const msg = event.data;
      if (msg.id !== searchId.current) return; // a cancelled search
      if (msg.type === "progress") {
        setFound(msg.found);
        return;
      }
      setSearching(false);
      const done = pending.current;
      pending.current = null;
      if (msg.type === "result" && done) {
        const shown = Math.min(done.index, Math.max(0, msg.result.sets.length - 1));
        setResult(msg.result);
        setQuery(done.query);
        setIndexState(shown);
        setError(null);
        writeLast({ query: done.query, index: shown, result: msg.result });
      } else if (msg.type === "error") {
        setError(msg.error);
      }
    };
    worker.onerror = (event) => {
      setSearching(false);
      setError(event.message || "The search stopped unexpectedly.");
    };
    worker.postMessage({ type: "init", data: d } satisfies SetSearchRequest);
    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => {
    if (!data) return;
    const worker = startWorker(data);
    // A search kept from an earlier visit without its results (after a
    // reload): run it again.
    const last = readLast();
    if (last && !last.result) post(worker, last.query, last.index);
    return () => {
      // cancel() may have replaced the first worker.
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [data, startWorker, post]);

  const search = useCallback(
    (q: SearchQuery) => {
      if (workerRef.current) post(workerRef.current, q);
    },
    [post],
  );

  const cancel = useCallback(() => {
    if (!data) return;
    searchId.current++;
    pending.current = null;
    workerRef.current?.terminate();
    startWorker(data);
    setSearching(false);
  }, [data, startWorker]);

  const setIndex = useCallback((i: number) => {
    setIndexState(i);
    if (lastSearch) writeLast({ ...lastSearch, index: i });
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
