/**
 * Persists which weapon/armor/decoration tree nodes are collapsed, keyed by
 * `treeKey` (same key TreeScroll uses for scroll position). Static export
 * pages remount the whole tree on every navigation, so per-node React state
 * alone doesn't survive moving between siblings — this backs it with
 * sessionStorage so collapsed branches stay collapsed across the session.
 * Rows subscribe to their own node, so a branch can be opened from elsewhere
 * in the tree (an alias row revealing its weapon's first row).
 */
const PREFIX = "tree-collapsed:";

type Listener = (collapsed: boolean) => void;
const listeners = new Map<string, Set<Listener>>();
const listenerKey = (treeKey: string, slug: string) => `${treeKey}|${slug}`;

function readSet(treeKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${treeKey}`);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(treeKey: string, slugs: Set<string>): void {
  try {
    sessionStorage.setItem(`${PREFIX}${treeKey}`, JSON.stringify(Array.from(slugs)));
  } catch {
    // Ignore storage errors (e.g. private browsing quota).
  }
}

export function isNodeCollapsed(treeKey: string, slug: string): boolean {
  return readSet(treeKey).has(slug);
}

export function setNodeCollapsed(treeKey: string, slug: string, collapsed: boolean): void {
  const slugs = readSet(treeKey);
  if (collapsed) {
    slugs.add(slug);
  } else {
    slugs.delete(slug);
  }
  writeSet(treeKey, slugs);
  listeners.get(listenerKey(treeKey, slug))?.forEach((listener) => listener(collapsed));
}

/** Calls `listener` whenever the node is collapsed or expanded; returns the unsubscribe. */
export function onNodeCollapsed(treeKey: string, slug: string, listener: Listener): () => void {
  const key = listenerKey(treeKey, slug);
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}
