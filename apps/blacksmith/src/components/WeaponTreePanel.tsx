"use client";

/**
 * The weapon tree sidebar card, with the sort bar (TreeSortBar) over its
 * bottom. The bar's menu picks the view (the upgrade tree, or the weapons
 * listed by element or by rarity) and the filters: element, and with a
 * hunter loaded the hunter filter. Rows that don't match the filters are
 * dimmed in place, so the tree's lines and indentation never move.
 */
import { startTransition, useMemo, useState } from "react";
import Card from "./Card";
import CardBox from "./CardBox";
import ElementGlyph from "./ElementGlyph";
import TreeScroll, { shownRows, TreeBranch } from "./TreeScroll";
import TreeSortBar, { type SortSection } from "./TreeSortBar";
import WeaponTreeGroups from "./WeaponTreeGroups";
import WeaponTreeRow from "./WeaponTreeRow";
import { SELECTOR_BAR_HEIGHT } from "./SelectorBar";
import { useVisibleTree } from "@/hooks/useVisibleTree";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { TreeFilterContext, WeaponTreeContext } from "@/context/TreeFilterContext";
import {
  ELEMENT_FILTERS,
  filterTree,
  TREE_FILTERS,
  TREE_VIEWS,
  type ElementFilterId,
  type TreeFilterId,
  type TreeViewId,
} from "@/lib/tree-filter";
import {
  elementFilterCounts,
  groupByElement,
  groupByRarity,
  groupMatchesElementFilter,
  treeWeapons,
} from "@/lib/tree-groups";
import {
  readElementFilter,
  readTreeFilter,
  readTreeView,
  writeElementFilter,
  writeTreeFilter,
  writeTreeView,
} from "@/lib/tree-filter-store";
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
  // Read on mount: nothing renders from them until the tree's bundle has
  // loaded, which is never the case on the first (hydrating) render.
  const [view, setView] = useState<TreeViewId>(readTreeView);
  const [element, setElement] = useState<ElementFilterId>(readElementFilter);
  const [hunterFilter, setHunterFilter] = useState<TreeFilterId>(readTreeFilter);
  // The hunter filter waits, unused, while no hunter is loaded.
  const hunter = progress.active ? hunterFilter : "all";

  // The rows the hunter's quest progress (a preference) leaves in.
  const visibleTree = useVisibleTree(tree, type, basePath, activeSlug);
  const weapons = useMemo(
    () => (visibleTree ? treeWeapons(visibleTree, type, basePath) : []),
    [visibleTree, type, basePath],
  );
  const counts = useMemo(() => elementFilterCounts(weapons), [weapons]);

  // craftCheck answers null until a bundle has loaded; the provider hands us
  // a new `progress` when it arrives, which works this out again. Kept
  // otherwise, so opening a weapon leaves the rows (memoised) alone.
  const result = useMemo(
    () =>
      visibleTree ? filterTree(visibleTree, type, basePath, progress, { hunter, element }) : null,
    [visibleTree, type, basePath, progress, hunter, element],
  );

  const groups = useMemo(
    () =>
      view === "element"
        ? groupByElement(weapons).filter((g) => groupMatchesElementFilter(g, element))
        : view === "rarity"
          ? groupByRarity(weapons)
          : null,
    [view, weapons, element],
  );

  // A new view or filter re-renders the whole list: let the tap paint first,
  // and the list follow (a transition, which yields to the browser).
  const choose = (apply: () => void) => startTransition(apply);

  const sections: SortSection[] = [
    {
      title: tt.sortView,
      options: TREE_VIEWS.map((v) => ({
        key: v,
        label: t.equipment.treeViews[v],
        selected: v === view,
        choose: () => {
          writeTreeView(v);
          choose(() => setView(v));
        },
      })),
    },
    {
      title: tt.sortElement,
      // Elements this tree has none of are left out, unless chosen in another tree.
      options: ELEMENT_FILTERS.filter((f) => f === "all" || f === element || counts[f] > 0).map(
        (f) => ({
          key: f,
          label: t.equipment.treeElementFilters[f],
          glyph: <ElementGlyph filter={f} />,
          count: counts[f],
          selected: f === element,
          choose: () => {
            writeElementFilter(f);
            choose(() => setElement(f));
          },
        }),
      ),
    },
  ];
  if (progress.active) {
    sections.push({
      title: tt.sortHunter,
      options: TREE_FILTERS.map((f) => ({
        key: f.id,
        label: t.equipment.treeFilters[f.id],
        selected: f.id === hunterFilter,
        choose: () => {
          writeTreeFilter(f.id);
          choose(() => setHunterFilter(f.id));
        },
      })),
    });
  }

  const summary = tt.sortSummary(
    [
      t.equipment.treeViews[view],
      element !== "all" && t.equipment.treeElementFilters[element],
      hunter !== "all" && t.equipment.treeFilters[hunter],
    ].filter((part): part is string => !!part),
  );

  return (
    // Takes the tree card's place in .split-page.
    <CardBox data-tree-panel>
      <Card variant="weapon-tree">
        {/* Each view keeps its own scroll position. */}
        <TreeScroll
          key={view}
          treeKey={view === "tree" ? treeKey : `${treeKey}:${view}`}
          activeSlug={activeSlug}
        >
          <TreeFilterContext.Provider value={result}>
            <WeaponTreeContext.Provider value={visibleTree}>
              {groups ? (
                <WeaponTreeGroups
                  groups={groups}
                  sectionType={type}
                  basePath={basePath}
                  treeKey={treeKey}
                />
              ) : (
                visibleTree?.map((node) => (
                  <TreeBranch key={node.slug} rows={shownRows(node, treeKey)}>
                    <WeaponTreeRow
                      node={node}
                      sectionType={type}
                      basePath={basePath}
                      treeKey={treeKey}
                    />
                  </TreeBranch>
                ))
              )}
            </WeaponTreeContext.Provider>
          </TreeFilterContext.Provider>
          {/* Room to scroll the last rows clear of the sort bar. */}
          {result && <div style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />}
        </TreeScroll>
      </Card>

      {result && (
        <TreeSortBar
          sections={sections}
          summary={summary}
          count={`${result.matched}/${result.total}`}
          label={tt.sortBarLabel(summary, tt.filterCount(result.matched, result.total))}
          menuLabel={tt.sortMenu}
        />
      )}
    </CardBox>
  );
}
