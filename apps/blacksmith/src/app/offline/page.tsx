import type { Metadata } from "next";
import OfflineFallback from "./OfflineFallback";

export const metadata: Metadata = {
  title: "Offline — MHFU Blacksmith",
};

// Precached by next-pwa as the `fallbacks.document` shell (next.config.ts).
// Not meant to be navigated to directly — see OfflineFallback.tsx.
export default function OfflinePage() {
  return <OfflineFallback />;
}
