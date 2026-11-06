/**
 * Persists which weapon/armor/decoration tree nodes are collapsed, keyed by
 * `treeKey` (same key TreeScroll uses for scroll position). Static export
 * pages remount the whole tree on every navigation, so per-node React state
 * alone doesn't survive moving between siblings — this backs it with
 * sessionStorage so collapsed branches stay collapsed across the session.
 */
const PREFIX = "tree-collapsed:";

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
}
