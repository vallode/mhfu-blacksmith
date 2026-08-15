const RUNTIME_CACHE = "mhfu-offline-v1";
// Matches the cacheName next-pwa's default "pages" runtime-caching rule uses
// for plain document navigations, so pages we precache here are found by it.
const PAGES_CACHE = "pages";

interface Manifest {
  version?: string;
  files?: string[];
}

export interface OfflineUrlSet {
  data: string[];
  pages: string[];
}

export async function collectOfflineUrls(): Promise<OfflineUrlSet> {
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

export function totalUrls({ data, pages }: OfflineUrlSet): number {
  return data.length + pages.length;
}

export async function countCached({ data, pages }: OfflineUrlSet): Promise<number> {
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

export async function downloadOffline(
  urls: OfflineUrlSet,
  onProgress: (done: number, total: number) => void
): Promise<number> {
  const dataCache = await caches.open(RUNTIME_CACHE);
  const pagesCache = await caches.open(PAGES_CACHE);
  const jobs = [
    ...urls.data.map((u) => ({ u, cache: dataCache })),
    ...urls.pages.map((u) => ({ u, cache: pagesCache })),
  ];

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
  for (let i = 0; i < jobs.length; i += BATCH) {
    await Promise.all(
      jobs.slice(i, i + BATCH).map(({ u, cache }) => fetchInto(u, cache))
    );
    onProgress(Math.min(i + BATCH, jobs.length), jobs.length);
  }
  return countCached(urls);
}

export function cachesSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "caches" in window
  );
}
