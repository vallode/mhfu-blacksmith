/**
 * Share links for armor sets: `/<lang>/sets/<code>/<slug>/`.
 *
 * The code (set-codec.ts) holds the whole set, its name included. The slug
 * after it is that name made readable for the address bar, and nothing reads
 * it back: a link still opens with its slug edited, cut short or left out. A
 * set with no name, or a name with no letters or digits to show, has no
 * slug (`/<lang>/sets/<code>/`).
 *
 * A link has the language, not the game: the code holds its game (set-codec.ts
 * FIELD.game), so the link can't disagree with it. The page at a share link
 * is the set builder of the code's game, in the link's language (the
 * Cloudflare Worker serves it there, src/cloudflare/worker.ts), which opens
 * the code and moves the address to the builder's. Links from before these,
 * `/<lang>/<game>/set-builder/?s=<code>`, still open; the ones from before
 * languages and games (`/sets/…`, `/set-builder/?s=…`) redirect to them
 * (scripts/generate-redirects.ts).
 *
 * Pure: shared by the Worker and the page.
 */
import { cleanName } from "./set-codec";
import { isLang, langPath, type Lang } from "./site";

/**
 * Where share links live, under the language: `/<lang>/sets/`. The Worker's
 * routes (wrangler.jsonc) and the dev server's rewrite (next.config.mjs) name
 * it too.
 */
export const SHARE_SEGMENT = "sets";

/** The longest slug, cut at a word where it can be. */
const MAX_SLUG = 60;

/**
 * A set's name as a link's slug: "Kirin's Gunner" is "kirins-gunner". Not
 * slugify (slug.ts): that one makes the site's page paths from equipment
 * names, keeping non-Latin letters and spelling out "+", and they mustn't
 * change. A slug here is only read by people, so it's plain ASCII.
 */
export function setSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= MAX_SLUG) return slug;
  const cut = slug.slice(0, MAX_SLUG + 1);
  const dash = cut.lastIndexOf("-");
  return (dash > 0 ? cut.slice(0, dash) : slug.slice(0, MAX_SLUG)).replace(/-+$/, "");
}

/**
 * A share link's path, for a code and the name it carries. The slug is made
 * from the name as the code holds it (cleanName: one line, at most MAX_NAME
 * characters), so the link the page copies and the one its embed names
 * (from the decoded name) are the same.
 */
export function sharePath(lang: Lang, code: string, name?: string | null): string {
  return langPath(lang, SHARE_SEGMENT, code, setSlug(cleanName(name ?? undefined)));
}

/** A share link's path: the language, the code, then the slug if any, with or without the trailing slash. */
const SHARE_PATH_RE = new RegExp(`^/([^/]+)/${SHARE_SEGMENT}/([A-Za-z0-9_-]+)(?:/[^/]*)?/?$`);

/** A share link's language and code, or null when the path isn't one. */
export function shareLinkOf(pathname: string): { lang: Lang; code: string } | null {
  const m = SHARE_PATH_RE.exec(pathname);
  return m && isLang(m[1]) ? { lang: m[1], code: m[2]! } : null;
}

/** The code in a share link's path, or null when the path isn't one. */
export function codeFromPath(pathname: string): string | null {
  return shareLinkOf(pathname)?.code ?? null;
}
