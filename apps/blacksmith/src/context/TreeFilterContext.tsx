"use client";

/**
 * Hands a weapon tree's filter result (see lib/tree-filter.ts), and the tree
 * itself, from the tree panel down to its rows. Null outside a filtered weapon tree (armor and
 * decoration trees, or no hunter loaded): rows then work out their own
 * status and are never dimmed.
 */
import { createContext, useContext } from "react";
import type { FilteredTree } from "@/lib/tree-filter";
import type { WeaponTreeNode } from "@/lib/types";

export const TreeFilterContext = createContext<FilteredTree | null>(null);

export function useTreeFilterResult() {
  return useContext(TreeFilterContext);
}

/**
 * The weapon tree as shown (after quest-progress pruning), for rows that need
 * to look beyond their own branch. Null outside a weapon tree.
 */
export const WeaponTreeContext = createContext<WeaponTreeNode[] | null>(null);

export function useWeaponTree() {
  return useContext(WeaponTreeContext);
}
