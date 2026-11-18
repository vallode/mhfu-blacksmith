"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/context/ToastContext";
import { useFileSync } from "@/context/FileSyncContext";
import { useT } from "@/context/LanguageContext";

const TOAST_ID = "save-sync-reconnect";

/**
 * Prompts (once per session) to re-grant read access to a previously
 * connected save file, via a toast rather than requiring a trip back to the
 * hunter page. One click satisfies the user-gesture requirement for
 * `requestPermission()` — no file picker, no re-uploading. Mirrors
 * OfflineDownload's toast pattern; the equivalent persistent control lives
 * on the options page (SaveSyncSettings).
 */
export default function SaveSyncReconnect() {
  const { toast, dismiss } = useToast();
  const fileSync = useFileSync();
  const t = useT().site.saveSync;
  const shown = useRef(false);

  useEffect(() => {
    const needsReconnect =
      fileSync.isSupported && fileSync.hasHandle && fileSync.permission === "prompt";

    if (needsReconnect && !shown.current) {
      shown.current = true;
      toast({
        id: TOAST_ID,
        title: t.reconnectToast.title,
        message: t.reconnectToast.message(fileSync.fileName),
        duration: null,
        actions: [
          { label: t.reconnect, onClick: () => fileSync.requestReconnect() },
          { label: t.reconnectToast.notNow, onClick: () => dismiss(TOAST_ID) },
        ],
      });
      return;
    }

    if (!needsReconnect && shown.current) {
      shown.current = false;
      dismiss(TOAST_ID);
    }
  }, [fileSync, toast, dismiss, t]);

  return null;
}
