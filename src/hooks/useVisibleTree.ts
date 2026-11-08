"use client";

import { useMemo } from "react";
import { usePreferences } from "@/context/PreferencesContext";
import { treeRowHref } from "@/lib/tree-filter";
import { pruneTree } from "@/lib/tree-visibility";
import type { WeaponTreeNode } from "@/lib/types";

/**
 * A weapon or armor tree without the rows the hunter's quest progress (a
 * preference) rules out. Null while the tree loads; the same tree when the
 * preference shows everything.
 */
export function useVisibleTree(
  tree: WeaponTreeNode[] | null | undefined,
  sectionType: string,
  basePath: string,
  activeSlug?: string,
): WeaponTreeNode[] | null {
  const { questProgress } = usePreferences().prefs;
  return useMemo(
    () =>
      tree
        ? pruneTree(tree, questProgress, {
            keepSlug: activeSlug,
            hrefOf: (node) => treeRowHref(node, sectionType, basePath),
          })
        : null,
    [tree, questProgress, sectionType, basePath, activeSlug],
  );
}
