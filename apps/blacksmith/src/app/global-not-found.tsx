import type { Metadata, Viewport } from "next";
import NotFound from "next/dist/client/components/builtin/not-found";
import "./globals.css";
import GameShell from "@/components/GameShell";
import RootDocument from "@/components/RootDocument";
import { rootMetadata } from "@/lib/root-metadata";
import { THEME_COLOR } from "@/lib/seo";
import { DEFAULT_SITE } from "@/lib/site";

// The 404 page (out/404.html, which the Worker serves for a missing path).
// The root layouts are per language (app/[lang]/layout.tsx), so a path
// outside them needs its own document: Next's `globalNotFound`. It's the
// default copy of the site, with Next's own 404 message, as before.

export const metadata: Metadata = rootMetadata(DEFAULT_SITE.lang);

export const viewport: Viewport = { themeColor: THEME_COLOR };

export default function GlobalNotFound() {
  return (
    <RootDocument lang={DEFAULT_SITE.lang}>
      <GameShell site={DEFAULT_SITE}>
        <NotFound />
      </GameShell>
    </RootDocument>
  );
}
