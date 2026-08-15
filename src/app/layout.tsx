import type { Metadata } from "next";
import "modern-normalize/modern-normalize.css";
import "./globals.scss";
import GlobalSearch from "@/components/GlobalSearch";
import OfflineDownload from "@/components/OfflineDownload";
import { SaveProvider } from "@/context/SaveContext";
import { PreferencesProvider } from "@/context/PreferencesContext";
import { ToastProvider } from "@/context/ToastContext";
import { OfflineProvider } from "@/context/OfflineContext";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://mhfu-blacksmith.netlify.app",
  ),
  title: "MHFU Blacksmith",
  description:
    "Monster Hunter Freedom Unite — weapons, armor, decorations, monsters",
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
        <PreferencesProvider>
          <SaveProvider>
            <ToastProvider>
              <OfflineProvider>
                {children}
                <GlobalSearch />
                <OfflineDownload />
              </OfflineProvider>
            </ToastProvider>
          </SaveProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
