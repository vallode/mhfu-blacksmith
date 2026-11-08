import type { Metadata } from "next";
import "./globals.scss";
import { faviconMetadata } from "@/lib/favicon";
import GlobalSearch from "@/components/GlobalSearch";
import PreloadIcons from "@/components/PreloadIcons";
// import OfflineDownload from "@/components/OfflineDownload"; // banner hidden for now
import OfflineNavGuard from "@/components/OfflineNavGuard";
import SaveSyncReconnect from "@/components/SaveSyncReconnect";
import { SaveProvider } from "@/context/SaveContext";
import { HunterProgressProvider } from "@/context/HunterProgressContext";
import { PreferencesProvider } from "@/context/PreferencesContext";
import { ToastProvider } from "@/context/ToastContext";
import { OfflineProvider } from "@/context/OfflineContext";
import { FileSyncProvider } from "@/context/FileSyncContext";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://mhfu-blacksmith.netlify.app",
  ),
  title: "MHFU Blacksmith",
  description:
    "Monster Hunter Freedom Unite — weapons, armor, decorations, monsters",
  ...faviconMetadata(),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MHFU Blacksmith",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PreloadIcons />
        <PreferencesProvider>
          <SaveProvider>
            <HunterProgressProvider>
              <ToastProvider>
                <OfflineProvider>
                  <FileSyncProvider>
                    <OfflineNavGuard>{children}</OfflineNavGuard>
                    <GlobalSearch />
                    {/* Offline download banner hidden for now.
                    <OfflineDownload /> */}
                    <SaveSyncReconnect />
                  </FileSyncProvider>
                </OfflineProvider>
              </ToastProvider>
            </HunterProgressProvider>
          </SaveProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
