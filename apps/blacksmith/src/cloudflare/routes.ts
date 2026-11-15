/**
 * Which response the Worker (worker.ts) gives a request, and the request it
 * makes for a share link's page. Pure and free of the Workers runtime (no
 * WebAssembly, no HTMLRewriter), so the routing is tested in Node
 * (test/worker-routes.test.ts).
 *
 * The set builder is `/<lang>/<game>/set-builder/` (site.ts), with its card
 * and oEmbed file beside it; share links are `/<lang>/sets/<code>/<slug>/`
 * (set-link.ts), and their game is the code's.
 */
import { codeGame, SHARE_PARAM } from "../lib/set-codec";
import { shareLinkOf } from "../lib/set-link";
import {
  DEFAULT_GAME,
  isSiteGame,
  parseSitePath,
  SECTIONS,
  sitePaths,
  type Lang,
  type Site,
} from "../lib/site";

/** The card and oEmbed files' names, beside the set builder's page. */
const CARD_FILE = "card.png";
const OEMBED_FILE = "oembed.json";

/** The set builder's page in a copy of the site, which share links are served. */
export const builderPath = (site: Site) => sitePaths(site).setBuilder();
export const cardPath = (site: Site) => `${builderPath(site)}${CARD_FILE}`;
export const oembedFilePath = (site: Site) => `${builderPath(site)}${OEMBED_FILE}`;

export type Route =
  /** Not the script's to answer: the static asset, as it is. */
  | { kind: "asset" }
  /** The set's card image (`cardPath?s=<code>`). */
  | { kind: "card"; code: string; site: Site }
  /** The set's oEmbed file (`oembedFilePath?s=<code>`). */
  | { kind: "oembed"; code: string; site: Site }
  /**
   * The set builder's page with the set's embed: for a share link's path
   * (`shareLink`, the page fetched from builderPath), or for the older
   * `/<lang>/<game>/set-builder/?s=<code>`.
   */
  | { kind: "page"; code: string; shareLink: boolean; site: Site };

/**
 * A share link's copy of the site: its language, and the code's game (the
 * default game for a code that doesn't open, or one for a game the site
 * isn't built for, whose page then says so).
 */
export function shareSite(lang: Lang, code: string): Site {
  const game = codeGame(code) ?? undefined;
  return { lang, game: isSiteGame(game) ? game : DEFAULT_GAME };
}

export function route(url: URL, method: string): Route {
  if (method !== "GET" && method !== "HEAD") return { kind: "asset" };
  const link = shareLinkOf(url.pathname);
  if (link) {
    return {
      kind: "page",
      code: link.code,
      shareLink: true,
      site: shareSite(link.lang, link.code),
    };
  }
  const parsed = parseSitePath(url.pathname);
  if (!parsed || parsed.rest[0] !== SECTIONS.setBuilder) return { kind: "asset" };
  const code = url.searchParams.get(SHARE_PARAM);
  if (!code) return { kind: "asset" };
  const { site, rest } = parsed;
  if (rest.length === 1) return { kind: "page", code, shareLink: false, site };
  if (rest.length === 2 && rest[1] === CARD_FILE) return { kind: "card", code, site };
  if (rest.length === 2 && rest[1] === OEMBED_FILE) return { kind: "oembed", code, site };
  return { kind: "asset" };
}

/**
 * The request for the set builder's page, which a share link's path is
 * served. A validator the browser kept for the link isn't the page file's.
 */
export function builderPage(request: Request, site: Site): Request {
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  return new Request(new URL(builderPath(site), request.url), { method: request.method, headers });
}
