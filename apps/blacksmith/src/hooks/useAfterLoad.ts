"use client";

import { useSyncExternalStore } from "react";

/**
 * How long after hydration to stop waiting for `load`: a stalled image or
 * font can hold it back for as long as the connection does.
 */
const GIVE_UP_MS = 8000;
let gaveUp = false;

const loaded = () => gaveUp || document.readyState === "complete";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("load", onChange);
  const timer = gaveUp
    ? undefined
    : setTimeout(() => {
        gaveUp = true;
        onChange();
      }, GIVE_UP_MS);
  return () => {
    window.removeEventListener("load", onChange);
    clearTimeout(timer);
  };
}

/**
 * Whether the page has finished loading (its `load` event has fired), or
 * GIVE_UP_MS have passed without it. False while prerendering and during
 * hydration.
 */
export function usePageLoaded(): boolean {
  return useSyncExternalStore(subscribe, loaded, () => false);
}
