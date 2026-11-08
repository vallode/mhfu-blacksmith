"use client";

/**
 * Hands a weapon tree's filter result (see lib/tree-filter.ts) from the tree
 * panel down to its rows. Null outside a filtered weapon tree (armor and
 * decoration trees, or no hunter loaded): rows then work out their own
 * status and are never dimmed.
 */
import { createContext, useContext } from "react";
import type { FilteredTree } from "@/lib/tree-filter";

export const TreeFilterContext = createContext<FilteredTree | null>(null);

export function useTreeFilterResult() {
  return useContext(TreeFilterContext);
}
