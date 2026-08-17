"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/context/ToastContext";
import { useOffline } from "@/context/OfflineContext";

const TOAST_ID = "offline-download";
const STORAGE_KEY = "mhfu_offline_prompt";

function remember(status: "dismissed" | "complete") {
  try {
    localStorage.setItem(STORAGE_KEY, status);
  } catch {
    // storage blocked
  }
}

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Prompts (once) to download the site's data for offline use, via a toast
 * rather than an always-on homepage control. Sticky until the user downloads
 * or dismisses; not shown again after either. A persistent, non-dismissable
 * equivalent lives on the options page (OfflineSettings) for anyone who
 * dismissed this or wants to re-download later — both share the caching
 * logic via OfflineContext so they never disagree about what's cached.
 */
export default function OfflineDownload() {
  const { toast, update, dismiss } = useToast();
  const offline = useOffline();
  const shown = useRef(false);

  // Decide whether to show the initial prompt once the first cache check settles.
  useEffect(() => {
    if (shown.current) return;
    if (offline.status === "checking" || offline.status === "unsupported") return;
    if (remembered()) return;

    if (offline.status === "complete") {
      remember("complete");
      return;
    }
    if (offline.status === "error") return; // manifest unreachable — try again next visit

    shown.current = true;
    toast({
      id: TOAST_ID,
      title: "Download for offline",
      message:
        offline.cached > 0
          ? `Partially cached (${offline.cached}/${offline.total}). Finish downloading so the smithy works without a connection.`
          : "Save weapon, armor, and monster data so search, the calculator, and browsing work without a connection.",
      duration: null,
      actions: [
        { label: "Download", onClick: () => offline.download() },
        {
          label: "Not now",
          onClick: () => {
            remember("dismissed");
            dismiss(TOAST_ID);
          },
        },
      ],
      onDismiss: () => {
        if (remembered() !== "complete") remember("dismissed");
      },
    });
    // Only the values read at prompt-time matter; re-running this effect on
    // every progress tick would re-open a dismissed toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline.status]);

  // Reflect download progress/outcome into the already-open toast.
  useEffect(() => {
    if (!shown.current) return;

    if (offline.status === "downloading") {
      update(TOAST_ID, {
        message: `Downloading… ${offline.cached}/${offline.total} (${offline.progress}%)`,
        progress: offline.progress,
        actions: [],
        duration: null,
      });
    } else if (offline.status === "complete") {
      remember("complete");
      update(TOAST_ID, {
        title: "Ready offline",
        message: `${offline.cached} of ${offline.total} files cached — the smithy works without a connection.`,
        progress: 100,
        actions: [],
        duration: 4500,
      });
    } else if (offline.status === "error") {
      update(TOAST_ID, {
        title: "Download failed",
        message: "Check your connection and try again.",
        progress: undefined,
        actions: [
          { label: "Retry", onClick: () => offline.download() },
          {
            label: "Not now",
            onClick: () => {
              remember("dismissed");
              dismiss(TOAST_ID);
            },
          },
        ],
        duration: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline.status, offline.progress]);

  return null;
}
