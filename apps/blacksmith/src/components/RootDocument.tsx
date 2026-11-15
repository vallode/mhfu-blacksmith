import PreloadIcons from "@/components/PreloadIcons";
import { SaveProvider } from "@/context/SaveContext";
import { HunterProgressProvider } from "@/context/HunterProgressContext";
import { PreferencesProvider } from "@/context/PreferencesContext";
import { ToastProvider } from "@/context/ToastContext";
import { OfflineProvider } from "@/context/OfflineContext";
import { FileSyncProvider } from "@/context/FileSyncContext";
import type { Lang } from "@/lib/site";

/**
 * The document every page is in: `<html lang>`, and the providers for the
 * visitor's own state (preferences, save, offline). The `[lang]` root
 * layout renders it, and so does the 404 page (app/global-not-found.tsx).
 */
export default function RootDocument({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return (
    <html lang={lang}>
      <body>
        <PreloadIcons />
        <PreferencesProvider>
          <SaveProvider>
            <HunterProgressProvider>
              <ToastProvider>
                <OfflineProvider>
                  <FileSyncProvider>{children}</FileSyncProvider>
                </OfflineProvider>
              </ToastProvider>
            </HunterProgressProvider>
          </SaveProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
