/**
 * The weapon tree's list views: its weapons listed flat under element or
 * rarity headers instead of along their upgrade paths. Pure functions over
 * the tree data, like tree-filter.ts.
 */
import {
  ELEMENT_FILTERS,
  isExternalRow,
  matchesElementFilter,
  nodeElements,
  treeRowHref,
  WEAPON_ELEMENTS,
  type ElementFilterId,
} from "./tree-filter";
import type { WeaponTreeNode } from "./types";

/** A weapon of the tree's own type, at its own row (not an alias row). */
export interface TreeWeapon {
  node: WeaponTreeNode;
  /** The page of the weapon it is upgraded from, if any: its tree parent. */
  parentHref?: string;
}

/** Each of the tree's own weapons once, in tree order; cross-type and alias rows left out. */
export function treeWeapons(
  tree: WeaponTreeNode[],
  sectionType: string,
  basePath: string,
): TreeWeapon[] {
  const out: TreeWeapon[] = [];
  const walk = (nodes: WeaponTreeNode[], parentHref: string | undefined) => {
    for (const node of nodes) {
      const from = node.parentHref ?? parentHref;
      if (node.rarity && !node.alias && !isExternalRow(node, sectionType)) {
        out.push({ node, parentHref: from });
      }
      if (node.children) walk(node.children, treeRowHref(node, sectionType, basePath));
    }
  };
  walk(tree, undefined);
  return out;
}

/** How many of the weapons each element filter matches. */
export function elementFilterCounts(weapons: TreeWeapon[]): Record<ElementFilterId, number> {
  const counts = Object.fromEntries(ELEMENT_FILTERS.map((f) => [f, 0])) as Record<
    ElementFilterId,
    number
  >;
  for (const { node } of weapons) {
    const elements = nodeElements(node);
    for (const f of ELEMENT_FILTERS) if (matchesElementFilter(f, elements)) counts[f]++;
  }
  return counts;
}

export interface TreeGroup {
  key: string;
  /** Element groups: the element, or null for weapons without one. */
  element?: string | null;
  /** Rarity groups: the rarity. */
  rarity?: number;
  weapons: TreeWeapon[];
}

/**
 * One group per element, in the game's order, then weapons with no element.
 * A dual-element weapon is listed under both of its elements. Empty groups
 * are left out.
 */
export function groupByElement(weapons: TreeWeapon[]): TreeGroup[] {
  const groups: TreeGroup[] = [...WEAPON_ELEMENTS, null].map((element) => ({
    key: element ?? "none",
    element,
    weapons: weapons.filter(({ node }) => {
      const elements = nodeElements(node);
      return element ? elements.includes(element) : elements.length === 0;
    }),
  }));
  return groups.filter((g) => g.weapons.length > 0);
}

/** One group per rarity, lowest first. */
export function groupByRarity(weapons: TreeWeapon[]): TreeGroup[] {
  const rarities = [...new Set(weapons.map(({ node }) => node.rarity!))].sort((a, b) => a - b);
  return rarities.map((rarity) => ({
    key: `rarity-${rarity}`,
    rarity,
    weapons: weapons.filter(({ node }) => node.rarity === rarity),
  }));
}

/** Whether an element group can hold weapons the element filter matches. */
export function groupMatchesElementFilter(group: TreeGroup, filter: ElementFilterId): boolean {
  if (group.element === undefined) return true;
  return matchesElementFilter(filter, group.element ? [group.element] : []);
}
