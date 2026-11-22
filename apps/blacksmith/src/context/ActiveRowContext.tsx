"use client";

/**
 * The open row of a tree (the page's weapon, armor piece or jewel), handed
 * to the rows through a small store rather than a prop. Moving between items
 * then re-renders the two rows whose highlight changes, not every row of a
 * tree a few hundred rows long. TreeScroll provides it.
 */
import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore } from "react";

interface ActiveRowStore {
  get(): string | undefined;
  set(slug: string | undefined): void;
  subscribe(listener: () => void): () => void;
}

function createStore(initial: string | undefined): ActiveRowStore {
  let slug = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => slug,
    set(next) {
      if (next === slug) return;
      slug = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const ActiveRowContext = createContext<ActiveRowStore | null>(null);

export function ActiveRowProvider({
  slug,
  children,
}: {
  slug: string | undefined;
  children: React.ReactNode;
}) {
  const [store] = useState(() => createStore(slug));
  // Before paint, so the highlight moves in the same frame as the page.
  useLayoutEffect(() => store.set(slug), [store, slug]);
  return <ActiveRowContext.Provider value={store}>{children}</ActiveRowContext.Provider>;
}

const noop = () => () => {};

/** The open row's slug as this row renders, without re-rendering when it changes. */
export function useActiveRowSlug(): string | undefined {
  return useContext(ActiveRowContext)?.get();
}

/** Whether `slug` is the open row; re-renders only when that answer changes. */
export function useIsActiveRow(slug: string): boolean {
  const store = useContext(ActiveRowContext);
  const isActive = () => store?.get() === slug;
  return useSyncExternalStore(store?.subscribe ?? noop, isActive, isActive);
}
