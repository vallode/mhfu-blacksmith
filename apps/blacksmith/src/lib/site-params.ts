/**
 * The `[lang]/[game]` route params, for pages and their metadata.
 */
import { notFound } from "next/navigation";
import { isLang, isSiteGame, sitePaths, type Site, type SitePaths } from "./site";

/** The params every page under `[lang]/[game]` has. */
export interface SiteParams {
  lang: string;
  game: string;
}

/** A page's props with its route params, `[lang]/[game]` and its own. */
export interface PageProps<P extends object = object> {
  params: Promise<SiteParams & P>;
}

/** The page's copy of the site; a 404 for a language or game the site isn't built for. */
export function siteOf(params: SiteParams): Site {
  const { lang, game } = params;
  if (!isLang(lang) || !isSiteGame(game)) notFound();
  return { lang, game };
}

/** The page's copy of the site's paths. */
export function pathsOf(params: SiteParams): SitePaths {
  return sitePaths(siteOf(params));
}
