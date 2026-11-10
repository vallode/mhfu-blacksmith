/**
 * Hides the weapons and armor a hunter can't make yet, by the quest progress
 * chosen in the preferences (see min-rank.ts for how a piece's minimum rank
 * is worked out).
 *
 * A hidden row takes its whole subtree with it: everything below it is
 * upgraded from it, so it needs at least what the row needs. The exception is
 * a row that can be made another way (forged from scratch, or upgraded from a
 * weapon elsewhere): its own minimum rank is already low enough, so it stays,
 * and moves up into the hidden row's place. It remembers the hidden row as
 * `parentHref`, so "can the hunter upgrade it?" still asks the right weapon.
 * An alias row (see WeaponTreeNode.alias) goes with its hidden parent.
 */
import { isAvailable, type Tier } from "./min-rank";
import type { WeaponTreeNode } from "./types";

export interface PruneOptions {
  /** The row the page is on stays in the tree even when it's out of reach. */
  keepSlug?: string;
  /** A row's own page, if it has one. */
  hrefOf: (node: WeaponTreeNode) => string | undefined;
}

/** Number of rows in the trees, counting every nested one. */
export function countRows(nodes: WeaponTreeNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countRows(node.children ?? []), 0);
}

export function pruneTree(
  nodes: WeaponTreeNode[],
  progress: Tier | null,
  { keepSlug, hrefOf }: PruneOptions,
): WeaponTreeNode[] {
  if (!progress) return nodes;

  const visit = (node: WeaponTreeNode, parent?: WeaponTreeNode): WeaponTreeNode[] => {
    const shown = isAvailable(node.min_rank, progress) || node.slug === keepSlug;
    const children = (node.children ?? []).flatMap((child) =>
      visit(child, shown ? undefined : node),
    );
    if (!shown) return children;
    // An alias row only says its parent leads there too: without the parent
    // it says nothing, and the weapon's first row is still in the tree.
    if (node.alias && parent) return [];

    const row: WeaponTreeNode = { ...node, children: children.length ? children : undefined };
    // Taken out from under a hidden parent: keep pointing at it.
    if (parent && !row.parentHref) row.parentHref = hrefOf(parent);
    return [row];
  };

  return nodes.flatMap((node) => visit(node));
}

/**
 * The rows enclosing a weapon's first row (not an alias row), top down: the
 * branches to open to show it. Null when it isn't in the trees.
 */
export function rowsAbove(nodes: WeaponTreeNode[], slug: string): WeaponTreeNode[] | null {
  for (const node of nodes) {
    if (node.slug === slug && !node.alias) return [];
    const below = rowsAbove(node.children ?? [], slug);
    if (below) return [node, ...below];
  }
  return null;
}
