"use client";

import { useDeferredValue, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import BorderRule from "@/components/BorderRule";
import Card from "@/components/Card";
import DecorationNav from "@/components/DecorationNav";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "@/components/SelectorBar";
import TreeScroll from "@/components/TreeScroll";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { useDecorationList } from "@/lib/client-data";
import {
  cycleDecorationFilter,
  decorationFilters,
  matchesDecoration,
  type DecorationFilterId,
} from "@/lib/decoration-filter";
import { rowStatus } from "@/lib/tree-filter";
import type { Decoration } from "@/lib/types";

const BASE_PATH = "/decorations/";
import { searchInput } from "@/styles/settings";

/**
 * The decorations frame: nav, divider and the decorations down the left (one
 * flat list, in the game's crafting order), with the page (a decoration's
 * details, or NO DATA on /decorations/) on the right. A box above the list
 * filters it by name or skill, and a selector at the bottom of the card by
 * slot count or, with a hunter loaded, by what they own and can make. It
 * lives in the decorations layout so it stays mounted while you move between
 * decorations; only the right-hand card re-renders.
 */
export function DecorationShell({ slug, children }: { slug?: string; children: React.ReactNode }) {
  const { item: decorations, tree } = useDecorationList();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const listRef = useRef<HTMLUListElement>(null);
  const progress = useHunterProgress();

  // The selector's filter; the hunter ones fall back to All once the save is
  // cleared.
  const filters = decorationFilters(progress.active);
  const [selected, setSelected] = useState<DecorationFilterId>("all");
  const filter = filters.some((f) => f.id === selected) ? selected : "all";

  // Each jewel's owned and craft status for the loaded hunter, as its row shows it.
  const statusOf = (d: Decoration) =>
    progress.active
      ? rowStatus(
          { slug: d.slug, type: "decoration", name: d.name, rarity: d.rarity },
          "decoration",
          BASE_PATH,
          undefined,
          progress,
        )
      : null;

  // Opening a jewel the filter hides (from search, say) goes back to All; the
  // selector changes it without leaving the jewel.
  const active = slug ? decorations?.find((d) => d.slug === slug) : undefined;
  const [syncedTo, setSyncedTo] = useState<string | null>(null);
  if (active && active.slug !== syncedTo) {
    setSyncedTo(active.slug);
    if (!matchesDecoration(active, filter, "", statusOf(active))) setSelected("all");
  }

  // Recomputed every render: craft checks answer null until their data has
  // loaded, and the hunter provider re-renders us when it arrives.
  const matching = decorations
    ? new Set(
        decorations
          .filter((d) => matchesDecoration(d, filter, deferredQuery, statusOf(d)))
          .map((d) => d.slug),
      )
    : null;
  const shown = matching && tree?.filter((node) => matching.has(node.slug));

  const step = (by: 1 | -1) => {
    setSelected(cycleDecorationFilter(filter, by, progress.active));
    // The list's scroll container is the card's body around it.
    for (let el = listRef.current?.parentElement; el; el = el.parentElement) {
      if (getComputedStyle(el).overflowY === "auto") {
        el.scrollTo({ top: 0 });
        break;
      }
    }
  };

  return (
    <>
      <DecorationNav />
      <BorderRule />
      <div className="split-page">
        {/* Above the card (z-2) so the bar and its arrows draw over the frame.
            On a phone the detail card goes below the list, so the list
            scrolls in a box instead of running the length of the page. */}
        <div
          data-tree-panel
          className="relative z-2 flex min-h-0 min-w-0 flex-1 flex-col gap-[0.8rem] mobile:h-[50vh] mobile:flex-none"
        >
          <input
            className={searchInput}
            type="search"
            aria-label="Filter decorations by name or skill"
            placeholder="Filter by name or skill, e.g. Attack"
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Card variant="weapon-tree">
            <TreeScroll treeKey="decorations" activeSlug={slug}>
              <ul ref={listRef}>
                {shown?.map((node) => (
                  <WeaponTreeRow
                    key={node.slug}
                    node={node}
                    sectionType="decoration"
                    basePath={BASE_PATH}
                    treeKey="decorations"
                    activeSlug={slug}
                    scroll={false}
                  />
                ))}
              </ul>
              {shown?.length === 0 && <p className="px-[16px] text-muted">No decorations match.</p>}
            </TreeScroll>
            {/* Room to scroll the last rows clear of the filter bar. */}
            <div className="flex-none" style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />
          </Card>
          <SelectorBar
            label={filters.find((f) => f.id === filter)!.label}
            groupLabel="Decoration filter"
            previousLabel="Previous filter"
            nextLabel="Next filter"
            onStep={step}
            count={shown && tree ? `${shown.length}/${tree.length}` : undefined}
            countLabel={shown && tree ? `${shown.length} of ${tree.length} decorations` : undefined}
          />
        </div>
        {children}
      </div>
    </>
  );
}

/** DecorationShell for the current route (used by the decorations layout). */
export default function DecorationRouteShell({ children }: { children: React.ReactNode }) {
  const [section, slug] = usePathname().split("/").filter(Boolean);
  return (
    <DecorationShell slug={section === "decorations" ? slug : undefined}>
      {children}
    </DecorationShell>
  );
}
