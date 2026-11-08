/**
 * The weapon tree's hunter filter (All / Owned / Not owned / Craftable /
 * Within 1 material): each row's owned and craft status for the loaded
 * hunter, whether it matches the chosen filter, and the tree's match count.
 *
 * Pure functions over the tree data and the HunterProgress lookups, so the
 * list-level hook and the rows share one definition of a row's status.
 */
import { WEAPON_TYPES } from "./constants";
import type { CraftCheck } from "./hunter-progress";
import type { WeaponTreeNode } from "./types";

export const TREE_FILTERS = [
  { id: "all", label: "All" },
  { id: "owned", label: "Owned" },
  { id: "not-owned", label: "Not owned" },
  { id: "craftable", label: "Craftable" },
  { id: "within-one", label: "Within 1 material" },
] as const;

export type TreeFilterId = (typeof TREE_FILTERS)[number]["id"];

export function isTreeFilterId(value: unknown): value is TreeFilterId {
  return TREE_FILTERS.some((f) => f.id === value);
}

/** The filter `step` places after (1) or before (-1) `current`, wrapping around. */
export function cycleTreeFilter(current: TreeFilterId, step: 1 | -1): TreeFilterId {
  const i = TREE_FILTERS.findIndex((f) => f.id === current);
  return TREE_FILTERS[(i + step + TREE_FILTERS.length) % TREE_FILTERS.length].id;
}

/** The lookups this module needs from HunterProgressContext. */
export interface ProgressLookups {
  active: boolean;
  isOwned: (href: string) => boolean;
  craftCheck: (type: string, slug: string, parentOwned: boolean) => CraftCheck | null;
}

export interface RowStatus {
  /** The row's page, if it has one. */
  href?: string;
  /** A weapon of another type that this tree upgrades into (grey row). */
  external: boolean;
  owned: boolean;
  /**
   * The best way to make an unowned weapon now: forged from scratch, or
   * upgraded when its tree parent is owned. null for anything else, or while
   * data loads.
   */
  craft: CraftCheck | null;
}

export function isExternalRow(node: WeaponTreeNode, sectionType: string): boolean {
  return node.type !== sectionType && (WEAPON_TYPES as readonly string[]).includes(node.type);
}

export function treeRowHref(
  node: WeaponTreeNode,
  sectionType: string,
  basePath: string,
): string | undefined {
  if (!node.rarity) return undefined;
  return isExternalRow(node, sectionType)
    ? `/blacksmith/${node.type}/${node.slug}/`
    : `${basePath}${node.slug}/`;
}

/** A row's status for the loaded hunter; `parentHref` is the enclosing row's page. */
export function rowStatus(
  node: WeaponTreeNode,
  sectionType: string,
  basePath: string,
  parentHref: string | undefined,
  progress: ProgressLookups,
): RowStatus {
  const href = treeRowHref(node, sectionType, basePath);
  const owned = href ? progress.isOwned(href) : false;
  // Only weapons have recipes, and only an owned tree parent can be upgraded.
  const craft =
    progress.active && href?.startsWith("/blacksmith/") && !owned
      ? progress.craftCheck(
          node.type,
          node.slug,
          parentHref !== undefined && progress.isOwned(parentHref),
        )
      : null;
  return { href, external: isExternalRow(node, sectionType), owned, craft };
}

export function matchesTreeFilter(filter: TreeFilterId, status: RowStatus): boolean {
  if (filter === "all") return true;
  // Rows that leave this weapon type only ever show under All.
  if (status.external) return false;
  const { owned, craft } = status;
  switch (filter) {
    case "owned":
      return owned;
    case "not-owned":
      return !owned;
    case "craftable":
      return craft?.status === "ready";
    case "within-one":
      return craft?.status === "ready" || (craft?.status === "short" && craft.missing <= 1);
  }
}

export interface FilteredRow extends RowStatus {
  match: boolean;
}

export interface FilteredTree {
  /** Keyed by node slug. */
  rows: Map<string, FilteredRow>;
  matched: number;
  total: number;
}

/**
 * Every node's status and match. Counts every weapon in the tree data,
 * including rows inside collapsed branches and cross-type rows.
 */
export function filterTree(
  tree: WeaponTreeNode[],
  sectionType: string,
  basePath: string,
  progress: ProgressLookups,
  filter: TreeFilterId,
): FilteredTree {
  const rows = new Map<string, FilteredRow>();
  let matched = 0;
  let total = 0;
  const walk = (nodes: WeaponTreeNode[], parentHref: string | undefined) => {
    for (const node of nodes) {
      const status = rowStatus(node, sectionType, basePath, parentHref, progress);
      const match = matchesTreeFilter(filter, status);
      total++;
      if (match) matched++;
      rows.set(node.slug, { ...status, match });
      if (node.children) walk(node.children, status.href);
    }
  };
  walk(tree, undefined);
  return { rows, matched, total };
}
