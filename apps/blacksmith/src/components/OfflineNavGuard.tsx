"use client";

import { useEffect, useState } from "react";
import { matchOfflineRoute, renderOfflineRoute, type RouteMatch } from "@/lib/offline-routes";

/**
 * Next.js's App Router client navigation needs the destination route's RSC
 * payload. When that's not cached (we deliberately don't precache the
 * ~3800 individual weapon/armor/monster/decoration pages — see
 * src/lib/offline-cache.ts) and we're offline, the fetch fails and Next
 * falls back to a full browser navigation, which fails too and hard-resets
 * the app to "/".
 *
 * To avoid that, this intercepts clicks on internal links *while offline*,
 * before Next's own <Link> handler runs, and renders the destination
 * in-place from the cached data bundles (client-data.ts) instead of asking
 * the router to navigate at all. `history.pushState` keeps the address bar
 * (and back/forward) in sync. Once back online, next-pwa's
 * `reloadOnOnline` reloads the page and everything reverts to normal
 * Next.js routing.
 */
export default function OfflineNavGuard({ children }: { children: React.ReactNode }) {
  const [override, setOverride] = useState<RouteMatch | null>(null);

  useEffect(() => {
    function resolveHref(target: EventTarget | null): string | null {
      let el = target as HTMLElement | null;
      while (el && el.tagName !== "A") el = el.parentElement;
      const anchor = el as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) return null;
      return anchor.href;
    }

    function onClick(e: MouseEvent) {
      if (navigator.onLine) return;
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const href = resolveHref(e.target);
      if (!href) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      const match = matchOfflineRoute(url.pathname);
      if (match.kind === "unknown") return;

      e.preventDefault();
      e.stopImmediatePropagation();
      window.history.pushState(null, "", url.pathname + url.search);
      setOverride(match);
      window.scrollTo(0, 0);
    }

    function onPopState() {
      if (navigator.onLine) {
        setOverride(null);
        return;
      }
      const match = matchOfflineRoute(window.location.pathname);
      setOverride(match.kind === "unknown" ? null : match);
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  if (override) return <>{renderOfflineRoute(override)}</>;
  return <>{children}</>;
}
