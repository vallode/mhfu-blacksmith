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
import { useHunterProgress } from "@/context/HunterProgressContext";
import { TreeFilterContext } from "@/context/TreeFilterContext";
import { cycleTreeFilter, filterTree, TREE_FILTERS, type TreeFilterId } from "@/lib/tree-filter";
import { readTreeFilter, writeTreeFilter } from "@/lib/tree-filter-store";
import type { WeaponTreeNode } from "@/lib/types";
import styles from "./WeaponTreePanel.module.scss";

interface Props {
  type: string;
  /** Null/undefined while the tree loads. */
  tree: WeaponTreeNode[] | null | undefined;
  activeSlug?: string;
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 32 40" width="34" height="42" aria-hidden="true" focusable="false">
      <polygon points={direction === "left" ? "27,4 27,36 4,20" : "5,4 5,36 28,20"} />
    </svg>
  );
}

export default function WeaponTreePanel({ type, tree, activeSlug }: Props) {
  const progress = useHunterProgress();
  const basePath = `/blacksmith/${type}/`;
  const treeKey = `weapon-${type}`;
  // Read on mount: nothing renders from it until a hunter is loaded, which
  // is never the case on the first (hydrating) render.
  const [filter, setFilter] = useState<TreeFilterId>(readTreeFilter);

  // Recomputed every render: upgradeCheck answers null until a bundle has
  // loaded, and the provider re-renders us when it arrives.
  const result = progress.active && tree ? filterTree(tree, type, basePath, progress, filter) : null;

  const step = (by: 1 | -1) => {
    setFilter((current) => {
      const next = cycleTreeFilter(current, by);
      writeTreeFilter(next);
      return next;
    });
  };

  const label = TREE_FILTERS.find((f) => f.id === filter)?.label;

  return (
    <div className={styles.panel}>
      <Card variant="weapon-tree">
        <TreeScroll treeKey={treeKey} activeSlug={activeSlug}>
          <TreeFilterContext.Provider value={result}>
            {tree?.map((node) => (
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
          {result && <div className={styles.spacer} aria-hidden="true" />}
        </TreeScroll>
      </Card>

      {result && (
        <div
          className={styles.bar}
          role="group"
          aria-label="Weapon tree filter"
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            step(event.key === "ArrowLeft" ? -1 : 1);
          }}
        >
          <button type="button" className={styles.arrow} aria-label="Previous filter" onClick={() => step(-1)}>
            <Arrow direction="left" />
          </button>
          <span className={styles.label} aria-live="polite">
            {label}
          </span>
          <span className={styles.count}>
            <span aria-hidden="true">
              {result.matched}/{result.total}
            </span>
            <span className="sr-only">
              {result.matched} of {result.total} weapons
            </span>
          </span>
          <button type="button" className={styles.arrow} aria-label="Next filter" onClick={() => step(1)}>
            <Arrow direction="right" />
          </button>
        </div>
      )}
    </div>
  );
}
