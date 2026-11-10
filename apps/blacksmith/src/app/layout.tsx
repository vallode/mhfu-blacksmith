import type { Metadata, Viewport } from "next";
import "./globals.css";
import { faviconMetadata } from "@/lib/favicon";
import { DEFAULT_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_URL, THEME_COLOR } from "@/lib/seo";
import GlobalSearch from "@/components/GlobalSearch";
import PreloadIcons from "@/components/PreloadIcons";
// import OfflineDownload from "@/components/OfflineDownload"; // banner hidden for now
import OfflineNavGuard from "@/components/OfflineNavGuard";
import SaveSyncReconnect from "@/components/SaveSyncReconnect";
import { SaveProvider } from "@/context/SaveContext";
import { HunterProgressProvider } from "@/context/HunterProgressContext";
import { PreferencesProvider } from "@/context/PreferencesContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ToastProvider } from "@/context/ToastContext";
import { OfflineProvider } from "@/context/OfflineContext";
import { FileSyncProvider } from "@/context/FileSyncContext";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
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

export const viewport: Viewport = { themeColor: THEME_COLOR };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PreloadIcons />
        <PreferencesProvider>
          <LanguageProvider>
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
          </LanguageProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
