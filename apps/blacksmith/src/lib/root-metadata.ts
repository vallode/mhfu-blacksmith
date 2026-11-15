import type { Metadata } from "next";
import { faviconMetadata } from "./favicon";
import { DEFAULT_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./seo";
import { OG_LOCALES, type Lang } from "./site";

/** The metadata every page starts from; pages add their own. */
export function rootMetadata(lang: Lang): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: OG_LOCALES[lang],
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      images: [DEFAULT_IMAGE],
    },
    twitter: {
      card: "summary",
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      images: [DEFAULT_IMAGE],
    },
    ...faviconMetadata(),
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "MHFU Blacksmith",
    },
  };
}
