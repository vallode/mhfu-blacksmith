"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/context/ToastContext";
import {
  cachesSupported,
  collectOfflineUrls,
  countCached,
  downloadOffline,
  totalUrls,
} from "@/lib/offline-cache";

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
 * Prompts (once) to download data + pages for offline use, via a toast rather
 * than an always-on homepage control. Sticky until the user downloads or
 * dismisses; not shown again after either.
 *
 * Caches both the data/image bundles (into "mhfu-offline-v1") and every page
 * document (into the "pages" cache next-pwa's default runtime caching reads
 * from), so navigating to any page works offline right after downloading —
 * not just pages the visitor happened to open while online.
 */
export default function OfflineDownload() {
  const { toast, update, dismiss } = useToast();
  const prompted = useRef(false);

  useEffect(() => {
    if (prompted.current) return;
    if (!cachesSupported()) return;
    if (remembered()) return;
    prompted.current = true;

    let cancelled = false;

    (async () => {
      try {
        const urls = await collectOfflineUrls();
        const total = totalUrls(urls);
        const cached = await countCached(urls);
        if (cancelled) return;
        if (cached >= total) {
          remember("complete");
          return;
        }

        const startDownload = async () => {
          update(TOAST_ID, {
            message: "Downloading…",
            progress: 0,
            actions: [],
            duration: null,
          });
          try {
            const freshUrls = await collectOfflineUrls();
            const freshTotal = totalUrls(freshUrls);
            const cachedCount = await downloadOffline(freshUrls, (done, jobTotal) => {
              const pct = Math.round((done / jobTotal) * 100);
              update(TOAST_ID, {
                message: `Downloading… ${done}/${jobTotal} (${pct}%)`,
                progress: pct,
                duration: null,
              });
            });
            remember("complete");
            update(TOAST_ID, {
              title: "Ready offline",
              message: `${cachedCount} of ${freshTotal} files cached — the smithy works without a connection.`,
              progress: 100,
              actions: [],
              duration: 4500,
            });
          } catch {
            update(TOAST_ID, {
              title: "Download failed",
              message: "Check your connection and try again.",
              progress: undefined,
              actions: [
                { label: "Retry", onClick: startDownload },
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
        };

        toast({
          id: TOAST_ID,
          title: "Download for offline",
          message:
            cached > 0
              ? `Partially cached (${cached}/${total}). Finish downloading so the smithy works without a connection.`
              : "Save weapons, armor, monsters, and pages so the smithy works without a connection.",
          duration: null,
          actions: [
            { label: "Download", onClick: startDownload },
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
      } catch {
        // manifest unreachable — skip the prompt
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [toast, update, dismiss]);

  return null;
}
