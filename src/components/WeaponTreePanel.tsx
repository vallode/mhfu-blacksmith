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
import { cn } from "@/lib/cn";

interface Props {
  type: string;
  /** Null/undefined while the tree loads. */
  tree: WeaponTreeNode[] | null | undefined;
  activeSlug?: string;
}

// Filter bar geometry. The arrows stick out 1.2rem past the card frame,
// which stays inside the body's 1.4rem gutter beside the tree card: no
// clipped arrow and no horizontal page scroll.
//   bar inset 4px, bar height 56px, arrow 44px

/** Label and count text in the filter bar. */
const barText =
  "text-[25px] leading-none tracking-[0.08em] whitespace-nowrap text-shadow-[2px_2px_0_rgb(0_0_0/0.6)] mobile:text-[20px]";

/**
 * Previous/next button with the game's green arrow sprite (the nav's back
 * arrow); "next" is the same image mirrored.
 */
function ArrowButton({ next, label, onClick }: { next?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "group absolute top-[calc(50%-22px)] m-0 flex size-[44px] cursor-pointer items-center justify-center border-0 bg-transparent p-0",
        "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white focus-visible:outline-solid",
        next ? "right-[calc(-1*(1.2rem+4px))]" : "left-[calc(-1*(1.2rem+4px))]",
      )}
      aria-label={label}
      onClick={onClick}
    >
      <img
        className={cn(
          "pixelated h-[42px] w-auto transition-[filter] duration-100 ease-[ease] group-hover:brightness-125 group-focus-visible:brightness-125",
          next && "-scale-x-100",
        )}
        src="/images/arrow.png"
        alt=""
        aria-hidden="true"
        decoding="sync"
      />
    </button>
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
    // Takes the tree card's place in .split-page; above the card (z-1) so the
    // bar and its arrows draw over the frame.
    <div data-tree-panel className="relative z-2 flex min-h-0 min-w-0 flex-1 flex-col">
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
          {result && <div className="h-[56px]" aria-hidden="true" />}
        </TreeScroll>
      </Card>

      {result && (
        <div
          data-filter-bar
          // A flat grey rectangle, as in the game's selector: no border or frame.
          // Side padding clears the arrows, which overlap the bar's ends.
          className="absolute right-[4px] bottom-[4px] left-[4px] z-2 flex h-[56px] items-center gap-[1.6rem] bg-[rgb(96_102_94/0.78)] px-[calc(44px-1.2rem-4px+0.8rem)] py-0"
          role="group"
          aria-label="Weapon tree filter"
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            step(event.key === "ArrowLeft" ? -1 : 1);
          }}
        >
          <ArrowButton label="Previous filter" onClick={() => step(-1)} />
          <span className={cn(barText, "min-w-0 flex-auto truncate text-stat")} aria-live="polite">
            {label}
          </span>
          <span className={cn(barText, "flex-none text-white")}>
            <span aria-hidden="true">
              {result.matched}/{result.total}
            </span>
            <span className="sr-only">
              {result.matched} of {result.total} weapons
            </span>
          </span>
          <ArrowButton next label="Next filter" onClick={() => step(1)} />
        </div>
      )}
    </div>
  );
}
