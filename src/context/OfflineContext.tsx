"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  cachesSupported,
  clearOffline,
  collectOfflineUrls,
  countCached,
  downloadOffline,
  totalUrls,
} from "@/lib/offline-cache";

export type OfflineDownloadStatus =
  | "unsupported"
  | "checking"
  | "idle"
  | "downloading"
  | "complete"
  | "error";

export interface OfflineState {
  status: OfflineDownloadStatus;
  /** Files already cached, as of the last check/download. */
  cached: number;
  /** Total files the site knows how to cache for offline use. */
  total: number;
  /** 0–100, only meaningful while `status` is "downloading". */
  progress: number;
}

interface OfflineContextValue extends OfflineState {
  download: () => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DEFAULT_STATE: OfflineState = {
  status: "checking",
  cached: 0,
  total: 0,
  progress: 0,
};

const OfflineContext = createContext<OfflineContextValue>({
  ...DEFAULT_STATE,
  download: async () => {},
  clear: async () => {},
  refresh: async () => {},
});

/**
 * Single source of truth for the site's offline-caching status, shared by
 * both the dismissible "Download for offline" toast (OfflineDownload) and
 * the persistent, non-dismissable control on the options page
 * (OfflineSettings) — a context (rather than a plain hook) so a download
 * kicked off from either surface is instantly reflected in the other.
 */
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OfflineState>(DEFAULT_STATE);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const refresh = useCallback(async () => {
    if (!cachesSupported()) {
      setState((s) => ({ ...s, status: "unsupported" }));
      return;
    }
    setState((s) => ({ ...s, status: "checking" }));
    try {
      const urls = await collectOfflineUrls();
      const total = totalUrls(urls);
      const cached = await countCached(urls);
      if (!mounted.current) return;
      setState({ status: cached >= total ? "complete" : "idle", cached, total, progress: 0 });
    } catch {
      if (!mounted.current) return;
      setState((s) => ({ ...s, status: "error" }));
    }
  }, []);

  const download = useCallback(async () => {
    setState((s) => ({ ...s, status: "downloading", progress: 0 }));
    try {
      const urls = await collectOfflineUrls();
      const total = totalUrls(urls);
      const cached = await downloadOffline(urls, (done, jobTotal) => {
        if (!mounted.current) return;
        setState((s) => ({
          ...s,
          cached: done,
          total: jobTotal,
          progress: Math.round((done / jobTotal) * 100),
        }));
      });
      if (!mounted.current) return;
      setState({ status: "complete", cached, total, progress: 100 });
    } catch {
      if (!mounted.current) return;
      setState((s) => ({ ...s, status: "error" }));
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      await clearOffline();
    } finally {
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <OfflineContext.Provider value={{ ...state, download, clear, refresh }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
