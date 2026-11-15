/**
 * Redirects from the site's URLs before languages and games (`/blacksmith/…`,
 * `/sets/…`, `/data/items.json`) to the ones in site.ts
 * (`/en/mhfu/blacksmith/…`), as the static assets' `_redirects` file
 * (scripts/generate-redirects.ts writes it to public/, so the export has it).
 * Cloudflare answers these before the Worker script or the assets: an old URL
 * never reaches the script, and never 404s.
 *
 * Wildcard rules where a whole tree moved (`/blacksmith/* …/:splat`), and one
 * rule per file where files moved out of a directory that's still there
 * (`/data/items.json`). Cloudflare allows 2,000 static and 100 dynamic rules.
 *
 * Pure, so the tests check the rules (`resolveRedirect` follows them the way
 * Cloudflare does).
 */
import {
  DEFAULT_SITE,
  dataPath,
  langPath,
  offlinePath,
  oembedPath,
  searchDataPath,
  SECTION_SEGMENTS,
  setEmbedDataPath,
  sitePath,
} from "./site";
import { SHARE_SEGMENT } from "./set-link";

export interface RedirectRule {
  from: string;
  to: string;
  status: 301 | 302;
}

/** Cloudflare's limits on a `_redirects` file. */
export const MAX_STATIC_RULES = 2000;
export const MAX_DYNAMIC_RULES = 100;

/**
 * The old URLs' rules. They all go to the default copy of the site (English,
 * MHFU), the only one there was. `gameDataFiles` are the default game's
 * bundles (public/data/<game>/), which used to be in /data/ itself.
 */
export function legacyRedirects(gameDataFiles: readonly string[]): RedirectRule[] {
  const site = DEFAULT_SITE;
  const rules: RedirectRule[] = [];
  const add = (from: string, to: string, status: 301 | 302 = 301) =>
    rules.push({ from, to, status });

  // The home page opens the default copy for now (a 302: a game picker takes
  // it over when there are more games).
  add("/", sitePath(site), 302);
  add("/index.txt", `${sitePath(site)}index.txt`);
  // Each section, with and without its trailing slash, and everything under it.
  for (const section of SECTION_SEGMENTS) {
    add(`/${section}`, sitePath(site, section));
    add(`/${section}/*`, `${sitePath(site, section)}:splat`);
  }
  // The offline page and share links sit under the language only.
  add("/offline", offlinePath(site.lang));
  add("/offline/*", `${offlinePath(site.lang)}:splat`);
  add(`/${SHARE_SEGMENT}/*`, `${langPath(site.lang, SHARE_SEGMENT)}:splat`);
  // oEmbed files are at their page's path (site.ts oembedPath).
  for (const section of SECTION_SEGMENTS)
    add(
      `/embed/oembed/${section}/*`,
      `${oembedPath(sitePath(site, section)).replace(/\.json$/, "")}/:splat`,
    );
  // Files that moved into the game's directory.
  add("/embed/set-data.json", setEmbedDataPath(site.game));
  add("/search-data.json", searchDataPath(site));
  for (const file of gameDataFiles) add(`/data/${file}`, dataPath(site.game, file));
  return rules;
}

const isDynamic = (rule: RedirectRule) => rule.from.includes("*") || rule.from.includes(":");

/** The rules as a `_redirects` file. Throws past Cloudflare's limits. */
export function formatRedirects(rules: readonly RedirectRule[]): string {
  const dynamic = rules.filter(isDynamic).length;
  const fixed = rules.length - dynamic;
  if (dynamic > MAX_DYNAMIC_RULES || fixed > MAX_STATIC_RULES)
    throw new Error(`_redirects: ${fixed} static and ${dynamic} dynamic rules is over the limits`);
  // Static rules first: Cloudflare matches them before any dynamic rule
  // anyway, and finds them faster above the first splat.
  const ordered = [...rules.filter((r) => !isDynamic(r)), ...rules.filter(isDynamic)];
  const lines = [
    "# Written by scripts/generate-redirects.ts (src/lib/redirects.ts): the URLs from",
    "# before languages and games, to their pages now.",
    ...ordered.map((r) => `${r.from} ${r.to} ${r.status}`),
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Where a path redirects to, following the rules as Cloudflare does: a
 * static rule (no `*`) matches the whole path; a `/x/*` rule matches what
 * starts with `/x/`, and `:splat` is the rest. Static rules come first, then
 * dynamic ones in order. The query string is kept. Null when no rule matches.
 */
export function resolveRedirect(
  rules: readonly RedirectRule[],
  pathname: string,
): { to: string; status: number } | null {
  for (const r of rules)
    if (!isDynamic(r) && r.from === pathname) return { to: r.to, status: r.status };
  for (const r of rules) {
    if (!r.from.endsWith("/*")) continue;
    const prefix = r.from.slice(0, -1);
    if (pathname.startsWith(prefix))
      return { to: r.to.replace(":splat", pathname.slice(prefix.length)), status: r.status };
  }
  return null;
}
