/**
 * Share links for armor sets: `/sets/<code>/<slug>/`.
 *
 * The code (set-codec.ts) holds the whole set, its name included. The slug
 * after it is that name made readable for the address bar, and nothing reads
 * it back: a link still opens with its slug edited, cut short or left out. A
 * set with no name, or a name with no letters or digits to show, has no
 * slug (`/sets/<code>/`).
 *
 * The page at a share link is the set builder's (the Cloudflare Worker serves
 * it there, src/cloudflare/worker.ts), which opens the code and moves the
 * address to /set-builder/. Links from before these, `/set-builder/?s=<code>`,
 * still open.
 *
 * Pure: shared by the Worker and the page.
 */

/**
 * Where share links live. The Worker's routes (wrangler.jsonc) and the dev
 * server's rewrite (next.config.mjs) name it too.
 */
export const SHARE_PATH = "/sets/";

/** The longest slug, cut at a word where it can be. */
const MAX_SLUG = 60;

/** A set's name as a link's slug: "Kirin's Gunner" is "kirins-gunner". */
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

/** A share link's path, for a code and the name it carries. */
export function sharePath(code: string, name?: string | null): string {
  const slug = name ? setSlug(name) : "";
  return `${SHARE_PATH}${code}/${slug ? `${slug}/` : ""}`;
}

/** A share link's path: the code, then the slug if any, with or without the trailing slash. */
const SHARE_PATH_RE = new RegExp(`^${SHARE_PATH}([A-Za-z0-9_-]+)(?:/[^/]*)?/?$`);

/** The code in a share link's path, or null when the path isn't one. */
export function codeFromPath(pathname: string): string | null {
  return SHARE_PATH_RE.exec(pathname)?.[1] ?? null;
}
