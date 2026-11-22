"use client";

import { useSyncExternalStore } from "react";

const loaded = () => document.readyState === "complete";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("load", onChange);
  return () => window.removeEventListener("load", onChange);
}

/**
 * Whether the page has finished loading (its `load` event has fired). False
 * while prerendering and during hydration.
 */
export function usePageLoaded(): boolean {
  return useSyncExternalStore(subscribe, loaded, () => false);
}

/**
 * A `<Link prefetch>` value that holds the link's prefetch back until the
 * page has loaded, then gives it Next's default. A route's prefetch inserts
 * that route's JS chunks as scripts, and scripts added before `load` hold it
 * back: on a slow connection, the sidebar's links to every other section
 * (only on screen at desktop widths) kept a weapon page from loading a
 * second longer on desktop than on a phone.
 */
export function useAfterLoadPrefetch(): false | undefined {
  return usePageLoaded() ? undefined : false;
}
