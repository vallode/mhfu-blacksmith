"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GameShell from "@/components/GameShell";
import { matchOfflineRoute, renderOfflineRoute, type RouteMatch } from "@/lib/offline-routes";
import { legacyRedirects, resolveRedirect } from "@/lib/redirects";
import { DEFAULT_GAME, DEFAULT_LANG, isLang, siteOfPath, sitePaths, type Site } from "@/lib/site";

/**
 * Served by the service worker (see `fallbacks.document` in next.config.mjs)
 * in place of a network error for a *cold* offline navigation (typed URL,
 * bookmark, or reload) that isn't cached. The browser's address bar still
 * shows the URL that was actually requested, so we read it directly off
 * `window.location` and render the matching view from the cached data
 * bundles — the same thing OfflineNavGuard does for in-app link clicks.
 *
 * The page sits outside the copies of the site (`/<lang>/offline/`), so it
 * puts what it renders in the shell of the copy the address names (site.ts
 * siteOfPath): the default game in the page's language until it has read
 * the address.
 */
/** The old URLs' rules (src/lib/redirects.ts); data files don't matter to a page. */
const LEGACY_REDIRECTS = legacyRedirects([]);

export default function OfflineFallback({ lang }: { lang: string }) {
  const [site, setSite] = useState<Site>({
    lang: isLang(lang) ? lang : DEFAULT_LANG,
    game: DEFAULT_GAME,
  });
  const [match, setMatch] = useState<RouteMatch | null>(null);

  useEffect(() => {
    // An address from before languages and games (a bookmark, an old
    // install's start page) moves to its page now, as _redirects does online.
    const moved = resolveRedirect(LEGACY_REDIRECTS, window.location.pathname);
    if (moved) {
      window.history.replaceState(window.history.state, "", moved.to + window.location.search);
    }
    setSite(siteOfPath(window.location.pathname));
    setMatch(matchOfflineRoute(window.location.pathname));
  }, []);

  return (
    <GameShell site={site}>
      <OfflineContent site={site} match={match} />
    </GameShell>
  );
}

function OfflineContent({ site, match }: { site: Site; match: RouteMatch | null }) {
  if (!match) return null;

  const rendered = renderOfflineRoute(match);
  if (rendered) return <>{rendered}</>;

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <p>This page hasn&apos;t been saved for offline use.</p>
      <p>Reconnect and open it once, and it&apos;ll be available offline from then on.</p>
      <p>
        <Link href={sitePaths(site).home()}>Back to home</Link>
      </p>
    </div>
  );
}
