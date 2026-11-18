/**
 * Runs the armor set search (lib/set-search.ts) off the main thread, for
 * src/hooks/useSetSearch.ts. The page sends the search data once ("init"),
 * then one message per round of a search; it terminates the worker to cancel
 * one. With several workers, each searches its shard of the sets, and the
 * page decides from all of them whether another round is needed.
 */
import {
  prepareSearch,
  type ArmorSet,
  type PreparedSearch,
  type SearchData,
  type SearchOptions,
  type SearchQuery,
  type SearchResult,
} from "@/lib/set-search";

export type SetSearchRequest =
  | { type: "init"; data: SearchData }
  | {
      type: "search";
      id: number;
      query: SearchQuery;
      round: number;
      shard?: SearchOptions["shard"];
    }
  /** The search is over: let go of what it prepared. */
  | { type: "done"; id: number };

export type SetSearchResponse =
  | { type: "progress"; id: number; found: number }
  | { type: "sets"; id: number; sets: ArmorSet[] }
  | { type: "result"; id: number; result: SearchResult }
  /** `reason`: the data wasn't sent yet, or the search threw (`error` is its message). */
  | { type: "error"; id: number; reason: "not-loaded" | "failed"; error: string };

// The DOM lib types `self` as a Window; in a worker it's the worker scope.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SetSearchRequest>) => void) | null;
  postMessage(message: SetSearchResponse): void;
};

let data: SearchData | null = null;
/** The search the rounds are for, prepared on its first round. */
let current: { id: number; search: PreparedSearch } | null = null;

scope.onmessage = ({ data: message }) => {
  if (message.type === "init") {
    data = message.data;
    return;
  }
  if (message.type === "done") {
    if (current?.id === message.id) current = null;
    return;
  }
  const { id, query, round, shard } = message;
  if (!data) {
    scope.postMessage({ type: "error", id, reason: "not-loaded", error: "No search data" });
    return;
  }
  try {
    if (current?.id !== id) current = { id, search: prepareSearch(data, query) };
    const result = current.search.run(round, {
      shard,
      onProgress: (found) => scope.postMessage({ type: "progress", id, found }),
      onSets: (sets) => scope.postMessage({ type: "sets", id, sets }),
    });
    scope.postMessage({ type: "result", id, result });
  } catch (e) {
    scope.postMessage({
      type: "error",
      id,
      reason: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
