import type { Metadata } from "next";

export const DEFAULT_FAVICON = "felyne";

/** Per-section favicon (weapon type, monster category, or the felyne default). */
export function faviconMetadata(name: string = DEFAULT_FAVICON): Metadata {
  const href = `/images/favicons/${name}-favicon.png`;
  return {
    icons: { icon: { url: href, type: "image/png" }, apple: href },
  };
}
