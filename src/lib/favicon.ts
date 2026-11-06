import type { Metadata } from "next";

export const DEFAULT_FAVICON = "felyne";

/**
 * Per-section favicon (weapon type, monster category, or the felyne default).
 *
 * Safari is picky: it ignores/caches PNG <link rel="icon"> tags unless a
 * /favicon.ico exists at the site root (public/favicon.ico), and it uses
 * apple-touch-icon (ideally 180x180) for pinned tabs and bookmarks.
 */
export function faviconMetadata(name: string = DEFAULT_FAVICON): Metadata {
  return {
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: `/images/favicons/${name}-favicon.png`, type: "image/png", sizes: "60x60" },
      ],
      shortcut: "/favicon.ico",
      apple: { url: `/images/favicons/${name}-apple-touch-icon.png`, sizes: "180x180" },
    },
  };
}
