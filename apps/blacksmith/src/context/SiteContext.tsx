"use client";

import { createContext, useContext, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  DEFAULT_SITE,
  sitePaths,
  toInSitePath,
  type InSitePath,
  type Site,
  type SitePaths,
} from "@/lib/site";

/** Which copy of the site (language and game) the page is in: its `[lang]/[game]` route. */
const SiteContext = createContext<Site>(DEFAULT_SITE);

export function SiteProvider({ site, children }: { site: Site; children: React.ReactNode }) {
  // A new object per render would re-render every consumer; the site is two strings.
  const value = useMemo(() => site, [site.lang, site.game]); // eslint-disable-line react-hooks/exhaustive-deps
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

/** The page's language and game. */
export function useSite(): Site {
  return useContext(SiteContext);
}

/** The page's copy of the site's paths (site.ts). */
export function usePaths(): SitePaths {
  const site = useSite();
  return useMemo(() => sitePaths(site), [site]);
}

/** The address's path inside its copy of the site ("/items/x/"), for parsing it. */
export function useInSitePathname(): InSitePath {
  return toInSitePath(usePathname());
}
