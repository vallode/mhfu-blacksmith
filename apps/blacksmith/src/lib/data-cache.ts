/**
 * Memoizes the server-side data loaders (weapons.ts, armor.ts, …) for the
 * life of the process. `next build` calls them for every one of the
 * thousands of detail pages (generateStaticParams, generateMetadata,
 * generateViewport), and re-reading and re-parsing the same JSON each time
 * was most of the time spent generating pages.
 *
 * `next dev` loads afresh each time, so edits to data/ show without a restart.
 */
const enabled = process.env.NODE_ENV !== "development";

export function cached<K, V>(cache: Map<K, V>, key: K, load: () => V): V {
  if (!enabled) return load();
  if (cache.has(key)) return cache.get(key) as V;
  const value = load();
  cache.set(key, value);
  return value;
}
