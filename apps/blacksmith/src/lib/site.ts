/**
 * The site's URLs: `/<lang>/<game>/<section>/<english-slug>/`, e.g.
 * `/en/mhfu/blacksmith/great-sword/buster-sword/`. Every internal link,
 * metadata path, canonical URL, oEmbed and embed URL is built here; nothing
 * else spells out a section's path.
 *
 * - Every language is prefixed, English included. Slugs stay English and
 *   ASCII in every language.
 * - Game codes are game-data's (`mhf1`, `mhf2`, `mhfu`).
 * - The pages generated are LANGS × SITE_GAMES; for now `en` × `mhfu`.
 * - Share links (`/<lang>/sets/<code>/<slug>/`, set-link.ts) and the offline
 *   page (`/<lang>/offline/`) sit under the language only: a share code
 *   carries its game, and the offline page serves every game.
 *
 * The URLs from before (`/blacksmith/…`) redirect here: see
 * `scripts/generate-redirects.ts`.
 *
 * Pure (no fs), so the client, the Worker and the build scripts share it.
 */
import { DATA_GAMES, GAME_CODES, type DataGameCode, type GameCode } from "game-data/games";

/** The languages the site is built in. */
export const LANGS = ["en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";

/** Each language's Open Graph locale. */
export const OG_LOCALES: Record<Lang, string> = { en: "en_US" };

/** The games the site is built for: those with data. */
export const SITE_GAMES: readonly DataGameCode[] = DATA_GAMES;
export const DEFAULT_GAME: DataGameCode = "mhfu";

/** A language and a game: which copy of the site a page is in. */
export interface Site {
  lang: Lang;
  game: DataGameCode;
}

export const DEFAULT_SITE: Site = { lang: DEFAULT_LANG, game: DEFAULT_GAME };

export const isLang = (s: string | undefined): s is Lang =>
  (LANGS as readonly string[]).includes(s!);
export const isSiteGame = (s: string | undefined): s is DataGameCode =>
  (SITE_GAMES as readonly string[]).includes(s!);
export const isGameCode = (s: string | undefined): s is GameCode =>
  (GAME_CODES as readonly string[]).includes(s!);

/** Every language and game the site is built for, for generateStaticParams. */
export const SITES: readonly Site[] = LANGS.flatMap((lang) =>
  SITE_GAMES.map((game) => ({ lang, game })),
);

/** The site's sections: the first segment after the game. */
export const SECTIONS = {
  weapons: "blacksmith",
  armor: "armorsmith",
  monsters: "monsters",
  decorations: "decorations",
  quests: "quests",
  items: "items",
  veggieElder: "veggie-elder",
  setBuilder: "set-builder",
  wishlist: "wishlist",
  hunter: "hunter",
  options: "options",
} as const;
export type Section = keyof typeof SECTIONS;
/** The sections' path segments, as in URLs from before the language and game prefix. */
export const SECTION_SEGMENTS: readonly string[] = Object.values(SECTIONS);

const join = (segments: (string | number | undefined | null)[]): string =>
  segments
    .filter((s): s is string | number => s !== undefined && s !== null && s !== "")
    .map((s) => `${s}/`)
    .join("");

/** A path under a language: `/en/<segments>/`. */
export function langPath(lang: Lang, ...segments: (string | number | undefined | null)[]): string {
  return `/${lang}/${join(segments)}`;
}

/** A path in one copy of the site: `/en/mhfu/<segments>/`. */
export function sitePath(site: Site, ...segments: (string | number | undefined | null)[]): string {
  return `/${site.lang}/${site.game}/${join(segments)}`;
}

/**
 * A path inside a copy of the site, without its `/<lang>/<game>` in front:
 * "/blacksmith/great-sword/buster-sword/". Links that data carries (an
 * item's sources, a quest's monsters, the set builder's pieces) are these,
 * so cached data doesn't depend on the language; a page turns one into its
 * own copy's path with `sitePaths(site).at(path)`.
 */
export type InSitePath = string;

const inSitePath = (
  section: Section,
  ...rest: (string | number | undefined | null)[]
): InSitePath => `/${SECTIONS[section]}/${join(rest)}`;

/** In-site paths (InSitePath), by section. Leave the trailing arguments out for a section's list. */
export const inSite = {
  section: (section: Section) => inSitePath(section),
  weapons: (type?: string, slug?: string) => inSitePath("weapons", type, type && slug),
  armor: (slot?: string, rank?: string, slug?: string) =>
    inSitePath("armor", slot, slot && rank, slot && rank && slug),
  monsters: (category?: string, slug?: string) =>
    inSitePath("monsters", category, category && slug),
  decorations: (slug?: string) => inSitePath("decorations", slug),
  quests: (hub?: string, id?: number | string) => inSitePath("quests", hub, hub && id),
  items: (slug?: string) => inSitePath("items", slug),
  veggieElder: () => inSitePath("veggieElder"),
  setBuilder: () => inSitePath("setBuilder"),
  wishlist: () => inSitePath("wishlist"),
  hunter: () => inSitePath("hunter"),
  options: () => inSitePath("options"),
};

/** The paths of one copy of the site: inSite's, with the copy's `/<lang>/<game>` in front. */
export function sitePaths(site: Site) {
  const prefix = `/${site.lang}/${site.game}`;
  /** An in-site path in this copy of the site. */
  const at = (path: InSitePath): string => {
    if (!path.startsWith("/") || parseSitePath(path))
      throw new Error(`not an in-site path: ${path}`);
    return `${prefix}${path}`;
  };
  const wrap =
    <A extends unknown[]>(f: (...args: A) => InSitePath) =>
    (...args: A) =>
      at(f(...args));
  return {
    site,
    at,
    /** The copy's home: it opens the weapon type last viewed. */
    home: () => sitePath(site),
    section: wrap(inSite.section),
    weapons: wrap(inSite.weapons),
    armor: wrap(inSite.armor),
    monsters: wrap(inSite.monsters),
    decorations: wrap(inSite.decorations),
    quests: wrap(inSite.quests),
    items: wrap(inSite.items),
    veggieElder: wrap(inSite.veggieElder),
    setBuilder: wrap(inSite.setBuilder),
    wishlist: wrap(inSite.wishlist),
    hunter: wrap(inSite.hunter),
    options: wrap(inSite.options),
  };
}
export type SitePaths = ReturnType<typeof sitePaths>;

/** The offline fallback page the service worker serves for a page it hasn't cached. */
export const offlinePath = (lang: Lang = DEFAULT_LANG) => langPath(lang, "offline");

/**
 * A site path's copy of the site and the segments after the game, or null
 * for a path outside one (`/en/offline/`, a share link, an old URL).
 */
export function parseSitePath(pathname: string): { site: Site; rest: string[] } | null {
  const [lang, game, ...rest] = pathname.split("/").filter(Boolean);
  if (!isLang(lang) || !isSiteGame(game)) return null;
  return { site: { lang, game }, rest };
}

/**
 * The copy of the site a path is in: its own, or the default game in the
 * path's language (the offline page, a share link), or the default copy.
 */
export function siteOfPath(pathname: string): Site {
  return (
    parseSitePath(pathname)?.site ?? { lang: langOf(pathname) ?? DEFAULT_LANG, game: DEFAULT_GAME }
  );
}

/** A site path's in-site path ("/en/mhfu/items/x/" → "/items/x/"); other paths as they are. */
export function toInSitePath(pathname: string): InSitePath {
  const parsed = parseSitePath(pathname);
  return parsed ? `/${join(parsed.rest)}` : pathname;
}

/** A path's language, when it has one. */
export function langOf(pathname: string): Lang | null {
  const lang = pathname.split("/").filter(Boolean)[0];
  return isLang(lang) ? lang : null;
}

/** The same page in each language, for hreflang alternates. */
export function languageAlternates(path: string): Record<string, string> {
  const parsed = parseSitePath(path);
  if (!parsed) return {};
  return Object.fromEntries(
    LANGS.map((lang) => [lang, sitePath({ ...parsed.site, lang }, ...parsed.rest)]),
  );
}

/** Where a page's oEmbed file lives: "/en/mhfu/blacksmith/x/y/" → "/embed/oembed/en/mhfu/blacksmith/x/y.json". */
export const oembedPath = (path: string): string => `/embed/oembed${path.replace(/\/$/, "")}.json`;

/**
 * A game's data bundles: `/data/<game>/<file>` (scripts/generate-data.ts).
 * What every game shares (the image manifest) stays in `/data/`.
 */
export const dataPath = (game: DataGameCode, file: string): string => `/data/${game}/${file}`;

/** The search index of one copy of the site: its game's names in its language. */
export const searchDataPath = (site: Site): string =>
  dataPath(site.game, `search-${site.lang}.json`);

/** The pieces and decorations a game's share codes name, for the Worker (set-embed.ts). */
export const setEmbedDataPath = (game: DataGameCode): string => `/embed/${game}/set-data.json`;
