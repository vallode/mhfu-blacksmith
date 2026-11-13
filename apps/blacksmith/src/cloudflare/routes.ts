/**
 * Which response the Worker (worker.ts) gives a request, and the request it
 * makes for a share link's page. Pure and free of the Workers runtime (no
 * WebAssembly, no HTMLRewriter), so the routing is tested in Node
 * (test/worker-routes.test.ts).
 */
import { SHARE_PARAM } from "../lib/set-codec";
import { codeFromPath } from "../lib/set-link";

/** The set builder's page, which share links are served. */
export const BUILDER_PATH = "/set-builder/";
export const CARD_PATH = "/set-builder/card.png";
export const OEMBED_PATH = "/set-builder/oembed.json";

export type Route =
  /** Not the script's to answer: the static asset, as it is. */
  | { kind: "asset" }
  /** The set's card image (`CARD_PATH?s=<code>`). */
  | { kind: "card"; code: string }
  /** The set's oEmbed file (`OEMBED_PATH?s=<code>`). */
  | { kind: "oembed"; code: string }
  /**
   * The set builder's page with the set's embed: for a share link's path
   * (`shareLink`, the page fetched from BUILDER_PATH), or for the older
   * `/set-builder/?s=<code>`.
   */
  | { kind: "page"; code: string; shareLink: boolean };

export function route(url: URL, method: string): Route {
  if (method !== "GET" && method !== "HEAD") return { kind: "asset" };
  const pathCode = codeFromPath(url.pathname);
  if (pathCode) return { kind: "page", code: pathCode, shareLink: true };
  const code = url.searchParams.get(SHARE_PARAM);
  if (!code) return { kind: "asset" };
  if (url.pathname === CARD_PATH) return { kind: "card", code };
  if (url.pathname === OEMBED_PATH) return { kind: "oembed", code };
  return { kind: "page", code, shareLink: false };
}

/**
 * The request for the set builder's page, which a share link's path is
 * served. A validator the browser kept for the link isn't the page file's.
 */
export function builderPage(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  return new Request(new URL(BUILDER_PATH, request.url), { method: request.method, headers });
}
