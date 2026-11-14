"use client";

/**
 * The weapon tree sidebar card. With a hunter loaded it also shows the filter
 * bar at the bottom of the card, in the style of the game's "◀ Set 7  7/20 ▶"
 * selector: rows that don't match the filter are dimmed in place, so the
 * tree's lines and indentation never move.
 */
import { useState } from "react";
import Card from "./Card";
import CardBox from "./CardBox";
import TreeScroll from "./TreeScroll";
import WeaponTreeRow from "./WeaponTreeRow";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "./SelectorBar";
import { useVisibleTree } from "@/hooks/useVisibleTree";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { TreeFilterContext, WeaponTreeContext } from "@/context/TreeFilterContext";
import { cycleTreeFilter, filterTree, type TreeFilterId } from "@/lib/tree-filter";
import { readTreeFilter, writeTreeFilter } from "@/lib/tree-filter-store";
import type { WeaponTreeNode } from "@/lib/types";
import { useT } from "@/context/LanguageContext";

interface Props {
  type: string;
  /** Null/undefined while the tree loads. */
  tree: WeaponTreeNode[] | null | undefined;
  activeSlug?: string;
}

export default function WeaponTreePanel({ type, tree, activeSlug }: Props) {
  const progress = useHunterProgress();
  const t = useT();
  const tt = t.equipment.tree;
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

  return (
    // Takes the tree card's place in .split-page; above the card (z-1) so the
    // bar and its arrows draw over the frame.
    <CardBox data-tree-panel>
      <Card variant="weapon-tree">
        <TreeScroll treeKey={treeKey} activeSlug={activeSlug}>
          <TreeFilterContext.Provider value={result}>
            <WeaponTreeContext.Provider value={visibleTree}>
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
            </WeaponTreeContext.Provider>
          </TreeFilterContext.Provider>
          {/* Room to scroll the last rows clear of the filter bar. */}
          {result && <div style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />}
        </TreeScroll>
      </Card>

      {result && (
        <SelectorBar
          label={t.equipment.treeFilters[filter]}
          groupLabel={tt.filterGroup}
          previousLabel={tt.previousFilter}
          nextLabel={tt.nextFilter}
          onStep={step}
          count={`${result.matched}/${result.total}`}
          countLabel={tt.filterCount(result.matched, result.total)}
        />
      )}
    </CardBox>
  );
}
