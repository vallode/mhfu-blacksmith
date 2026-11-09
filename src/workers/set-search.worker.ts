/**
 * Runs the armor set search (lib/set-search.ts) off the main thread, for
 * src/hooks/useSetSearch.ts. The page sends the search data once ("init"),
 * then one message per search; it terminates the worker to cancel one.
 */
import { searchSets, type SearchData, type SearchQuery, type SearchResult } from "@/lib/set-search";

export type SetSearchRequest =
  { type: "init"; data: SearchData } | { type: "search"; id: number; query: SearchQuery };

export type SetSearchResponse =
  | { type: "progress"; id: number; found: number }
  | { type: "result"; id: number; result: SearchResult }
  /** `reason`: the data wasn't sent yet, or the search threw (`error` is its message). */
  | { type: "error"; id: number; reason: "not-loaded" | "failed"; error: string };

// The DOM lib types `self` as a Window; in a worker it's the worker scope.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SetSearchRequest>) => void) | null;
  postMessage(message: SetSearchResponse): void;
};

let data: SearchData | null = null;

scope.onmessage = ({ data: message }) => {
  if (message.type === "init") {
    data = message.data;
    return;
  }
  const { id, query } = message;
  if (!data) {
    scope.postMessage({ type: "error", id, reason: "not-loaded", error: "No search data" });
    return;
  }
  try {
    const result = searchSets(data, query, (found) =>
      scope.postMessage({ type: "progress", id, found }),
    );
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
