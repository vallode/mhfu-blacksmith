"use client";

/**
 * The weapon tree sidebar card. With a hunter loaded it also shows the filter
 * bar at the bottom of the card, in the style of the game's "◀ Set 7  7/20 ▶"
 * selector: rows that don't match the filter are dimmed in place, so the
 * tree's lines and indentation never move.
 */
import { useState } from "react";
import Card from "./Card";
import TreeScroll from "./TreeScroll";
import WeaponTreeRow from "./WeaponTreeRow";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "./SelectorBar";
import { useVisibleTree } from "@/hooks/useVisibleTree";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { TreeFilterContext } from "@/context/TreeFilterContext";
import { cycleTreeFilter, filterTree, TREE_FILTERS, type TreeFilterId } from "@/lib/tree-filter";
import { readTreeFilter, writeTreeFilter } from "@/lib/tree-filter-store";
import type { WeaponTreeNode } from "@/lib/types";

interface Props {
  type: string;
  /** Null/undefined while the tree loads. */
  tree: WeaponTreeNode[] | null | undefined;
  activeSlug?: string;
}

export default function WeaponTreePanel({ type, tree, activeSlug }: Props) {
  const progress = useHunterProgress();
  const basePath = `/blacksmith/${type}/`;
  const treeKey = `weapon-${type}`;
  // Read on mount: nothing renders from it until a hunter is loaded, which
  // is never the case on the first (hydrating) render.
  const [filter, setFilter] = useState<TreeFilterId>(readTreeFilter);

  // The rows the hunter's quest progress (a preference) leaves in.
  const visibleTree = useVisibleTree(tree, type, basePath, activeSlug);

  // Recomputed every render: craftCheck answers null until a bundle has
  // loaded, and the provider re-renders us when it arrives.
  const result =
    progress.active && visibleTree
      ? filterTree(visibleTree, type, basePath, progress, filter)
      : null;

  const step = (by: 1 | -1) => {
    setFilter((current) => {
      const next = cycleTreeFilter(current, by);
      writeTreeFilter(next);
      return next;
    });
  };

  const label = TREE_FILTERS.find((f) => f.id === filter)?.label;

  return (
    // Takes the tree card's place in .split-page; above the card (z-1) so the
    // bar and its arrows draw over the frame.
    <div data-tree-panel className="relative z-2 flex min-h-0 min-w-0 flex-1 flex-col">
      <Card variant="weapon-tree">
        <TreeScroll treeKey={treeKey} activeSlug={activeSlug}>
          <TreeFilterContext.Provider value={result}>
            {visibleTree?.map((node) => (
              <ul key={node.slug}>
                <WeaponTreeRow
                  node={node}
                  sectionType={type}
                  basePath={basePath}
                  treeKey={treeKey}
                  activeSlug={activeSlug}
                />
              </ul>
            ))}
          </TreeFilterContext.Provider>
          {/* Room to scroll the last rows clear of the filter bar. */}
          {result && <div style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />}
        </TreeScroll>
      </Card>

      {result && (
        <SelectorBar
          label={label ?? ""}
          groupLabel="Weapon tree filter"
          previousLabel="Previous filter"
          nextLabel="Next filter"
          onStep={step}
          count={`${result.matched}/${result.total}`}
          countLabel={`${result.matched} of ${result.total} weapons`}
        />
      )}
    </div>
  );
}
