import type { Metadata } from "next";
import { LANGS } from "@/lib/site";
import OfflineFallback from "./OfflineFallback";

export const metadata: Metadata = {
  title: "Offline — MHFU Blacksmith",
};

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

// Precached by next-pwa as the `fallbacks.document` shell (next.config.mjs),
// at /<lang>/offline/ (site.ts offlinePath). Not meant to be navigated to
// directly — see OfflineFallback.tsx.
export default async function OfflinePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <OfflineFallback lang={lang} />;
}
