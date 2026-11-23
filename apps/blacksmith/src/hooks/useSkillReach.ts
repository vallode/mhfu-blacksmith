"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchData, SearchQuery } from "@/lib/set-search";
import type { ReachBase, ReachTree } from "@/lib/skill-reach";
import type { SetSearchRequest, SetSearchResponse } from "@/workers/set-search.worker";

/** A tree within reach; `pending` while it's from the last query, not yet checked for this one. */
export interface ReachRow extends ReachTree {
  pending: boolean;
}

export interface SkillReachState {
  checking: boolean;
  /** Trees checked of `total`, for this query. */
  checked: number;
  total: number;
  /** Whether a set activates the wanted skills; null until known. */
  base: ReachBase | null;
  trees: ReachRow[];
  /** The check failed (in English, for the console). */
  error: string | null;
}

interface Run {
  key: string;
  base: ReachBase | null;
  found: ReachTree[];
  checkedTrees: Set<string>;
  checked: number;
  total: number;
  done: boolean;
  error: string | null;
}

/** Finished checks by query, so stepping back to a query shows its skills at once. */
const cache = new Map<string, { base: ReachBase; trees: ReachTree[] }>();
const CACHE_SIZE = 16;

function remember(key: string, base: ReachBase, trees: ReachTree[]) {
  cache.delete(key);
  cache.set(key, { base, trees });
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}

const finished = (key: string, base: ReachBase, trees: ReachTree[]): Run => ({
  key,
  base,
  found: trees,
  checkedTrees: new Set(trees.map((t) => t.tree)),
  checked: 1,
  total: 1,
  done: true,
  error: null,
});

/**
 * The skills within reach of `query` (lib/skill-reach.ts), checked in a
 * worker of their own while `active` (the sheet is open). A new query stops
 * the check for the old one; until its trees are checked again, the old
 * query's stay listed as pending, so the list doesn't empty and refill.
 */
export function useSkillReach(
  data: SearchData | null,
  query: SearchQuery | null,
  active: boolean,
): SkillReachState {
  const key = query ? JSON.stringify(query) : null;
  const [run, setRun] = useState<Run | null>(null);
  /** The last finished check's trees, shown while the next one runs. */
  const [previous, setPrevious] = useState<ReachTree[]>([]);
  const worker = useRef<Worker | null>(null);
  const running = useRef(false);
  const ids = useRef(0);

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  // The data changed: the worker has the old one.
  useEffect(() => {
    worker.current?.terminate();
    worker.current = null;
    running.current = false;
  }, [data]);

  useEffect(() => {
    if (!active || !data || !query || !key) {
      // Closed mid-check: stop it, and check again when opened.
      if (running.current) {
        worker.current?.terminate();
        worker.current = null;
        running.current = false;
        setRun(null);
      }
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      if (running.current) {
        worker.current?.terminate();
        worker.current = null;
        running.current = false;
      }
      setRun(finished(key, cached.base, cached.trees));
      setPrevious(cached.trees);
      return;
    }
    if (run?.key === key && (run.done || running.current)) return;

    // A worker still on another query can't be interrupted: start a new one.
    if (running.current) {
      worker.current?.terminate();
      worker.current = null;
    }
    let w = worker.current;
    if (!w) {
      w = new Worker(new URL("../workers/set-search.worker.ts", import.meta.url));
      w.postMessage({ type: "init", data } satisfies SetSearchRequest);
      worker.current = w;
    }
    const id = ++ids.current;
    running.current = true;
    // This check's state, kept here and copied into `run` as it changes.
    const found: ReachTree[] = [];
    const checkedTrees = new Set<string>();
    const show = (r: Partial<Run>) =>
      setRun((prev) => ({
        ...(prev?.key === key ? prev : { base: null, checked: 0, total: 0, error: null }),
        key,
        found: [...found],
        checkedTrees: new Set(checkedTrees),
        done: false,
        ...r,
      }));
    show({ base: null, checked: 0, total: 0, error: null });
    w.onmessage = (event: MessageEvent<SetSearchResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === "reach-tree") {
        checkedTrees.add(msg.tree.tree);
        if (msg.tree.skills.length > 0) found.push(msg.tree);
        show({ base: "ok", checked: msg.checked, total: msg.total });
      } else if (msg.type === "reach-done") {
        running.current = false;
        if (msg.base !== "ok") found.length = 0;
        remember(key, msg.base, [...found]);
        setPrevious([...found]);
        show({ base: msg.base, done: true });
      } else if (msg.type === "error") {
        running.current = false;
        show({ done: true, error: msg.error });
      }
    };
    w.onerror = (event) => {
      if (worker.current !== w) return;
      running.current = false;
      worker.current = null;
      w.terminate();
      show({ done: true, error: event.message || "Worker failed" });
    };
    w.postMessage({ type: "reach", id, query } satisfies SetSearchRequest);
    // `run` is read only to skip a check already done or running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, data, key]);

  const current = run?.key === key ? run : null;
  const checking = !!current && !current.done;
  const trees: ReachRow[] = current
    ? [
        ...current.found.map((t) => ({ ...t, pending: false })),
        // Until it's done, the last check's trees this one hasn't reached yet.
        ...(current.done
          ? []
          : previous
              .filter((t) => !current.checkedTrees.has(t.tree))
              .map((t) => ({ ...t, pending: true }))),
      ]
    : previous.map((t) => ({ ...t, pending: true }));
  return {
    checking,
    checked: current?.checked ?? 0,
    total: current?.total ?? 0,
    base: current?.base ?? null,
    trees,
    error: current?.error ?? null,
  };
}
