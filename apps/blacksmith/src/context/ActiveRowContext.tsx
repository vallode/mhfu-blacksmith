"use client";

/**
 * The open row of a tree (the page's weapon, armor piece or jewel), handed
 * to the rows through a small store rather than a prop. Moving between items
 * then re-renders the rows whose answer changes (the old and new open rows,
 * and a collapsed branch holding the new one), not every row of a tree a few
 * hundred rows long. TreeScroll provides it.
 */
import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { WeaponTreeNode } from "@/lib/types";

interface ActiveRowStore {
  get(): string | undefined;
  /** During the provider's render: rows rendering after it read the new slug. */
  put(slug: string | undefined): void;
  /** After commit: rows that didn't render check their answer again. */
  notify(): void;
  subscribe(listener: () => void): () => void;
}

function createStore(initial: string | undefined): ActiveRowStore {
  let slug = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => slug,
    put(next) {
      slug = next;
    },
    notify() {
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
  // Set as the provider renders, so rows mounting in the same render (a new
  // tree for another weapon type) see the new open row.
  store.put(slug);
  // Before paint, so the highlight moves in the same frame as the page.
  useLayoutEffect(() => {
    store.put(slug);
    store.notify();
  }, [store, slug]);
  return <ActiveRowContext.Provider value={store}>{children}</ActiveRowContext.Provider>;
}

const noop = () => () => {};

function useActiveRowAnswer(answer: (slug: string | undefined) => boolean): boolean {
  const store = useContext(ActiveRowContext);
  const snapshot = () => answer(store?.get());
  return useSyncExternalStore(store?.subscribe ?? noop, snapshot, snapshot);
}

/** Whether `slug` is the open row; re-renders only when that answer changes. */
export function useIsActiveRow(slug: string): boolean {
  return useActiveRowAnswer((active) => active === slug);
}

/** Whether the open row is somewhere in `node`'s branch, below it. */
export function useActiveRowBelow(node: WeaponTreeNode): boolean {
  return useActiveRowAnswer((active) => !!active && hasDescendant(node, active));
}

/** Whether `slug` is the first row (not an alias row) of a weapon below `node`. */
export function hasDescendant(node: WeaponTreeNode, slug: string): boolean {
  return (node.children ?? []).some(
    (child) => (child.slug === slug && !child.alias) || hasDescendant(child, slug),
  );
}
