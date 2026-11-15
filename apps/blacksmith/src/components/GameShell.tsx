"use client";

import AppShell from "@/components/AppShell";
import GlobalSearch from "@/components/GlobalSearch";
// import OfflineDownload from "@/components/OfflineDownload"; // banner hidden for now
import OfflineNavGuard from "@/components/OfflineNavGuard";
import SaveSyncReconnect from "@/components/SaveSyncReconnect";
import { SiteProvider } from "@/context/SiteContext";
import type { Site } from "@/lib/site";

/**
 * One copy of the site (a language and a game) around its pages: the
 * sidebar and tab bar, search and the save sync prompt. The `[game]`
 * layout puts every page in it; the offline page puts what it renders in
 * it, for the copy its address names.
 */
export default function GameShell({ site, children }: { site: Site; children: React.ReactNode }) {
  return (
    <SiteProvider site={site}>
      <AppShell>
        <OfflineNavGuard>{children}</OfflineNavGuard>
      </AppShell>
      <GlobalSearch />
      {/* Offline download banner hidden for now.
      <OfflineDownload /> */}
      <SaveSyncReconnect />
    </SiteProvider>
  );
}
