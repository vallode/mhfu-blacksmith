"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { matchOfflineRoute, renderOfflineRoute, type RouteMatch } from "@/lib/offline-routes";

/**
 * Served by the service worker (see `fallbacks.document` in next.config.ts)
 * in place of a network error for a *cold* offline navigation (typed URL,
 * bookmark, or reload) that isn't cached. The browser's address bar still
 * shows the URL that was actually requested, so we read it directly off
 * `window.location` and render the matching view from the cached data
 * bundles — the same thing OfflineNavGuard does for in-app link clicks.
 */
export default function OfflineFallback() {
  const [match, setMatch] = useState<RouteMatch | null>(null);

  useEffect(() => {
    setMatch(matchOfflineRoute(window.location.pathname));
  }, []);

  if (!match) return null;

  const rendered = renderOfflineRoute(match);
  if (rendered) return <>{rendered}</>;

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <p>This page hasn&apos;t been saved for offline use.</p>
      <p>Reconnect and open it once, and it&apos;ll be available offline from then on.</p>
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </div>
  );
}
