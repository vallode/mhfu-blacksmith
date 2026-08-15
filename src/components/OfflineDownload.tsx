"use client";

import { useEffect, useState } from "react";

/**
 * Download-for-offline control.
 *
 * The service worker precaches all /data/*.json + /images/** at install time,
 * but that happens invisibly in the background. This control makes it explicit:
 * it downloads every data bundle + image into a dedicated runtime cache, *and*
 * every page document (from page-manifest.json) into the "pages" cache that
 * next-pwa's default runtime caching reads from — so navigating to any page
 * works offline right away, not just pages the visitor happened to open while
 * online. Progress is reported live, and if everything is already cached
 * (e.g. from a previous download), it reports that immediately.
 */

const RUNTIME_CACHE = "mhfu-offline-v1";
// Matches the cacheName next-pwa's default "pages" runtime-caching rule uses
// for plain document navigations, so pages we precache here are found by it.
const PAGES_CACHE = "pages";

interface Manifest {
  version?: string;
  files?: string[];
}

interface UrlSet {
  data: string[];
  pages: string[];
}

async function collectUrls(): Promise<UrlSet> {
  const manifest: Manifest = await fetch("/data/data-manifest.json").then((r) =>
    r.json()
  );
  const data = (manifest.files ?? []).map((f) => `/data/${f}`);
  // images manifest — generated alongside the data manifest
  try {
    const images: string[] = await fetch("/data/image-manifest.json").then((r) =>
      r.json()
    );
    data.push(...images);
  } catch {
    // image manifest missing; data-only offline is still useful
  }
  data.push("/search-data.json", "/weapon-data.json");

  let pages: string[] = [];
  try {
    pages = await fetch("/data/page-manifest.json").then((r) => r.json());
  } catch {
    // page manifest missing (e.g. older build); data-only offline still works
  }

  return { data, pages };
}

async function countCached({ data, pages }: UrlSet): Promise<number> {
  try {
    const dataCache = await caches.open(RUNTIME_CACHE);
    const pagesCache = await caches.open(PAGES_CACHE);
    let n = 0;
    for (const u of data) if (await dataCache.match(u)) n++;
    for (const u of pages) if (await pagesCache.match(u)) n++;
    return n;
  } catch {
    return 0;
  }
}

export default function OfflineDownload() {
  const [supported, setSupported] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [done, setDone] = useState(0);
  const [alreadyCached, setAlreadyCached] = useState<number | null>(null);
  const [state, setState] = useState<
    "idle" | "downloading" | "complete" | "error"
  >("idle");

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "caches" in window;
    setSupported(ok);
    if (!ok) return;

    let cancelled = false;
    (async () => {
      try {
        const urls = await collectUrls();
        const total = urls.data.length + urls.pages.length;
        const cached = await countCached(urls);
        if (!cancelled) {
          setTotal(total);
          setAlreadyCached(cached);
          if (cached >= total) setState("complete");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const download = async () => {
    setState("downloading");
    setDone(0);
    try {
      const urls = await collectUrls();
      const total = urls.data.length + urls.pages.length;
      setTotal(total);
      const dataCache = await caches.open(RUNTIME_CACHE);
      const pagesCache = await caches.open(PAGES_CACHE);
      let n = 0;
      // Download in small batches for progress without hammering the server.
      const BATCH = 20;
      const fetchInto = async (u: string, cache: Cache) => {
        try {
          const res = await fetch(u, { cache: "no-cache" });
          if (res.ok) await cache.put(u, res);
        } catch {
          // individual file failed; keep going
        }
      };
      const jobs = [
        ...urls.data.map((u) => ({ u, cache: dataCache })),
        ...urls.pages.map((u) => ({ u, cache: pagesCache })),
      ];
      for (let i = 0; i < jobs.length; i += BATCH) {
        await Promise.all(
          jobs.slice(i, i + BATCH).map(({ u, cache }) => fetchInto(u, cache))
        );
        n = Math.min(i + BATCH, jobs.length);
        setDone(n);
      }
      const cached = await countCached(urls);
      setAlreadyCached(cached);
      setState(cached > 0 ? "complete" : "error");
    } catch {
      setState("error");
    }
  };

  if (!supported) return null;

  const pct =
    state === "downloading" && total
      ? Math.round((done / total) * 100)
      : state === "complete"
        ? 100
        : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
        marginTop: "1rem",
        fontSize: "0.85rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background:
              state === "complete"
                ? "#4caf50"
                : state === "error"
                  ? "#c0392b"
                  : state === "downloading"
                    ? "#c9a227"
                    : "#888",
            display: "inline-block",
          }}
        />
        <span>
          {state === "complete" &&
            `Available offline — ${alreadyCached ?? total ?? 0} files cached`}
          {state === "downloading" &&
            `Downloading… ${done}/${total ?? "?"} (${pct}%)`}
          {state === "error" && "Download failed — check connection and retry"}
          {state === "idle" &&
            (alreadyCached !== null && alreadyCached > 0
              ? `Partially cached (${alreadyCached}/${total ?? "?"} files)`
              : "Not downloaded for offline use yet")}
        </span>
      </div>

      {state === "downloading" && (
        <progress
          value={done}
          max={total ?? 100}
          style={{ width: "16rem", height: "0.5rem" }}
        />
      )}

      <button
        onClick={download}
        disabled={state === "downloading"}
        style={{
          padding: "0.15rem 0.6rem",
          cursor: state === "downloading" ? "default" : "pointer",
        }}
      >
        {state === "downloading"
          ? "Downloading…"
          : state === "complete"
            ? "Re-download"
            : state === "error"
              ? "Retry"
              : "Download for offline"}
      </button>
    </div>
  );
}
