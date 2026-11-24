"use client";

import { useMemo } from "react";
import { usePreferences } from "@/context/PreferencesContext";
import { treeRowHref } from "@/lib/tree-filter";
import { pruneTree, rowsAbove } from "@/lib/tree-visibility";
import type { WeaponTreeNode } from "@/lib/types";

/**
 * Something worked out from a tree that keeps the open row in it
 * (`build(activeSlug)`), but stays the same object while the open row is
 * in it anyway (`build(undefined)`), as it is on most pages. Moving between
 * items then hands the rows (memoised) the nodes they already have, instead
 * of a copy of the whole tree.
 */
export function useKeepingActive<T extends WeaponTreeNode[] | null | undefined>(
  build: (keep: string | undefined) => T,
  deps: React.DependencyList,
  activeSlug: string | undefined,
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => build(undefined), deps);
  return useMemo(
    () => (activeSlug && base && rowsAbove(base, activeSlug) === null ? build(activeSlug) : base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, activeSlug],
  );
}

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
  return useKeepingActive(
    (keepSlug) =>
      tree
        ? pruneTree(tree, questProgress, {
            keepSlug,
            hrefOf: (node) => treeRowHref(node, sectionType, basePath),
          })
        : null,
    [tree, questProgress, sectionType, basePath],
    activeSlug,
  );
}
