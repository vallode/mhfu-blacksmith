/**
 * The weapon tree's filters: the hunter filter (All / Owned / Not owned /
 * Craftable / Within 1 material) and the element filter (one element, any,
 * any status, or none), with each row's owned and craft status for the
 * loaded hunter, whether it matches both filters, and the tree's match
 * count. Also the tree's views (the upgrade tree, or its weapons listed by
 * element or rarity; see tree-groups.ts). The decoration list uses the same
 * row status and hunter filters.
 *
 * Pure functions over the tree data and the HunterProgress lookups, so the
 * list-level hook and the rows share one definition of a row's status.
 */
import { WEAPON_TYPES } from "./constants";
import { weaponHref } from "./equipment-ref";
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

/** The elements, in the game's order. */
export const WEAPON_ELEMENTS = [
  "fire",
  "water",
  "thunder",
  "ice",
  "dragon",
  "poison",
  "paralysis",
  "sleep",
] as const;

const STATUS_ELEMENTS = new Set<string>(["poison", "paralysis", "sleep"]);

/**
 * The element filter: every weapon, any element, one element, any status
 * element (poison, paralysis or sleep), or no element.
 */
export const ELEMENT_FILTERS = [
  "all",
  "any",
  "fire",
  "water",
  "thunder",
  "ice",
  "dragon",
  "status",
  "poison",
  "paralysis",
  "sleep",
  "none",
] as const;

export type ElementFilterId = (typeof ELEMENT_FILTERS)[number];

export function isElementFilterId(value: unknown): value is ElementFilterId {
  return (ELEMENT_FILTERS as readonly unknown[]).includes(value);
}

/** A tree node's elements: none, one, or both of a dual-element weapon's. */
export function nodeElements(node: WeaponTreeNode): string[] {
  return node.elements ?? (node.element ? [node.element] : []);
}

export function matchesElementFilter(
  filter: ElementFilterId,
  elements: readonly string[],
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "any":
      return elements.length > 0;
    case "none":
      return elements.length === 0;
    case "status":
      return elements.some((e) => STATUS_ELEMENTS.has(e));
    default:
      return elements.includes(filter);
  }
}

/** How the tree card lays out its weapons: the upgrade tree, or a list by element or rarity. */
export const TREE_VIEWS = ["tree", "element", "rarity"] as const;

export type TreeViewId = (typeof TREE_VIEWS)[number];

export function isTreeViewId(value: unknown): value is TreeViewId {
  return (TREE_VIEWS as readonly unknown[]).includes(value);
}

/** The filters a row has to pass, together. */
export interface TreeFilters {
  hunter: TreeFilterId;
  element: ElementFilterId;
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
    ? weaponHref(node.type, node.slug)
    : `${basePath}${node.slug}/`;
}

/**
 * A row's key in `FilteredTree.rows`. A weapon is usually one row, keyed by its
 * slug; an alias row (the same weapon under another parent) is keyed by that
 * parent's page too, as its upgrade is from that parent.
 */
export function treeRowKey(node: WeaponTreeNode, parentHref: string | undefined): string {
  return node.alias ? `${parentHref ?? ""}>${node.slug}` : node.slug;
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
  // Weapons and decorations have recipes. A weapon is made once, and only an
  // owned tree parent can be upgraded; jewels stack, so owning one doesn't
  // stop you making more.
  const craft = !progress.active
    ? null
    : href?.startsWith("/decorations/")
      ? progress.craftCheck("decoration", node.slug, false)
      : href?.startsWith("/blacksmith/") && !owned
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
  /** Keyed by `treeRowKey`. */
  rows: Map<string, FilteredRow>;
  matched: number;
  total: number;
}

/**
 * Every node's status and match. Counts every weapon in the tree data once,
 * including rows inside collapsed branches and cross-type rows; a weapon
 * listed under several parents matches when any of its rows does. Like the
 * hunter filter, an element filter other than All rules out cross-type rows.
 */
export function filterTree(
  tree: WeaponTreeNode[],
  sectionType: string,
  basePath: string,
  progress: ProgressLookups,
  filters: TreeFilters,
): FilteredTree {
  const rows = new Map<string, FilteredRow>();
  const weapons = new Set<string>();
  const matches = new Set<string>();
  const walk = (nodes: WeaponTreeNode[], parentHref: string | undefined) => {
    for (const node of nodes) {
      const from = node.parentHref ?? parentHref;
      const status = rowStatus(node, sectionType, basePath, from, progress);
      const match =
        (filters.element === "all" ||
          (!status.external && matchesElementFilter(filters.element, nodeElements(node)))) &&
        matchesTreeFilter(filters.hunter, status);
      const weapon = `${node.type}/${node.slug}`;
      weapons.add(weapon);
      if (match) matches.add(weapon);
      rows.set(treeRowKey(node, from), { ...status, match });
      if (node.children) walk(node.children, status.href);
    }
  };
  walk(tree, undefined);
  return { rows, matched: matches.size, total: weapons.size };
}
