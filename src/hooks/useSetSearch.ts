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
  error: string | null;
  search: (query: SearchQuery) => void;
  cancel: () => void;
}

/** Loads the set search data and runs searches in a worker. */
export function useSetSearch(): SetSearchState {
  const [data, setData] = useState<SearchData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const searchId = useRef(0);

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
      if (msg.type === "result") {
        setResult(msg.result);
        setError(null);
      } else {
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
    startWorker(data);
    return () => {
      // cancel() may have replaced the first worker.
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [data, startWorker]);

  const search = useCallback((query: SearchQuery) => {
    const worker = workerRef.current;
    if (!worker) return;
    const id = ++searchId.current;
    setSearching(true);
    setFound(0);
    setError(null);
    worker.postMessage({ type: "search", id, query } satisfies SetSearchRequest);
  }, []);

  const cancel = useCallback(() => {
    if (!data) return;
    searchId.current++;
    workerRef.current?.terminate();
    startWorker(data);
    setSearching(false);
  }, [data, startWorker]);

  return { data, loadError, searching, found, result, error, search, cancel };
}
