import type { Metadata } from "next";
import "modern-normalize/modern-normalize.css";
import "./globals.scss";
import GlobalSearch from "@/components/GlobalSearch";
import { SaveProvider } from "@/context/SaveContext";
import { PreferencesProvider } from "@/context/PreferencesContext";

export const metadata: Metadata = {
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
            {children}
            <GlobalSearch />
          </SaveProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
