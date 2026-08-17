import {
  WEAPON_TYPES,
  ARMOR_SLOTS,
  ARMOR_RANKS,
  MONSTER_CATEGORIES,
} from "./constants";

const RUNTIME_CACHE = "mhfu-offline-v1";
// Matches the `cacheName: "pages"` runtime-caching rule in next.config.ts —
// writing directly into it means these documents are indistinguishable from
// ones next-pwa cached itself by ordinary browsing.
const PAGES_CACHE = "pages";

interface Manifest {
  version?: string;
  files?: string[];
}

/**
 * Offline downloads only cover the compact data bundles + images — the raw
 * material every page renders from client-side (see src/lib/client-data.ts).
 * We deliberately don't precache individual page documents here: with ~3800
 * weapon/armor/monster/decoration routes, that meant thousands of near-
 * identical HTML/RSC fetches for pages whose actual content is just this
 * same data rendered client-side, which was slow and mostly redundant bytes.
 * Pages you actually visit still get cached for offline reuse automatically
 * by next-pwa's normal runtime caching (the "pages"/"pages-rsc" rules in
 * next.config.ts) — this button just guarantees the underlying data is there
 * up front so search, the calculator, and any page you do open work offline.
 */
export async function collectOfflineUrls(): Promise<string[]> {
  const manifest: Manifest = await fetch("/data/data-manifest.json").then((r) =>
    r.json()
  );
  const urls = (manifest.files ?? []).map((f) => `/data/${f}`);
  try {
    const images: string[] = await fetch("/data/image-manifest.json").then((r) =>
      r.json()
    );
    urls.push(...images);
  } catch {
    // image manifest missing; data-only offline is still useful
  }
  urls.push("/search-data.json", "/weapon-data.json");
  return urls;
}

/**
 * The finite set of list/tree pages (weapon types, armor slot+rank, monster
 * categories, top-level nav) — unlike the ~3800 individual weapon/armor/
 * monster/decoration pages, there are only a few dozen of these, so we just
 * cache the real documents instead of relying on the generic offline shell.
 * Detail pages still fall back to src/app/offline at runtime.
 */
export function collectStaticPageUrls(): string[] {
  const urls = [
    "/",
    "/blacksmith/",
    "/armorsmith/",
    "/monsters/",
    "/decorations/",
    "/calculator/",
    "/hunter/",
    "/options/",
  ];
  for (const type of WEAPON_TYPES) urls.push(`/blacksmith/${type}/`);
  for (const slot of ARMOR_SLOTS) {
    for (const rank of ARMOR_RANKS) urls.push(`/armorsmith/${slot}/${rank}/`);
  }
  for (const category of MONSTER_CATEGORIES) urls.push(`/monsters/${category}/`);
  return urls;
}

export async function countCached(urls: string[]): Promise<number> {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    let n = 0;
    for (const u of urls) if (await cache.match(u)) n++;
    return n;
  } catch {
    return 0;
  }
}

const FETCH_TIMEOUT_MS = 15000;

export async function downloadOffline(
  urls: string[],
  onProgress: (done: number, total: number) => void
): Promise<number> {
  const cache = await caches.open(RUNTIME_CACHE);

  // Download in small batches for progress without hammering the server.
  // Each fetch is time-boxed so one stalled request can't freeze the whole
  // download — it just counts as failed and the batch moves on.
  const BATCH = 20;
  const fetchInto = async (u: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(u, { cache: "no-cache", signal: controller.signal });
      if (res.ok) await cache.put(u, res);
    } catch {
      // individual file failed or timed out; keep going
    } finally {
      clearTimeout(timer);
    }
  };
  for (let i = 0; i < urls.length; i += BATCH) {
    await Promise.all(urls.slice(i, i + BATCH).map(fetchInto));
    onProgress(Math.min(i + BATCH, urls.length), urls.length);
  }

  // Bonus: also grab the handful of static list/tree pages so they work
  // offline regardless of browsing history. Doesn't count towards the
  // reported total/progress above — those track the data bundles.
  try {
    const pagesCache = await caches.open(PAGES_CACHE);
    await Promise.all(
      collectStaticPageUrls().map(async (u) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
          const res = await fetch(u, { cache: "no-cache", signal: controller.signal });
          if (res.ok) await pagesCache.put(u, res);
        } catch {
          // best-effort; the offline shell fallback still covers navigation
        } finally {
          clearTimeout(timer);
        }
      })
    );
  } catch {
    // caches API hiccup; data/images above are the important part
  }

  return countCached(urls);
}

export async function clearOffline(): Promise<void> {
  await Promise.all([caches.delete(RUNTIME_CACHE), caches.delete(PAGES_CACHE)]);
}

export function cachesSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "caches" in window
  );
}
