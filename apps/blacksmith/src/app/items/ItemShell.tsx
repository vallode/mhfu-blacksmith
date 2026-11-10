"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BorderRule from "@/components/BorderRule";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import QuestNav from "@/components/QuestNav";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "@/components/SelectorBar";
import TreeScroll from "@/components/TreeScroll";
import { cn } from "@/lib/cn";
import { getItemSources, useItems } from "@/lib/client-data";
import { ITEM_CATEGORIES, itemCategory, type ItemCategorySlug } from "@/lib/item-categories";
import { normalizeItemName } from "@/lib/items";
import { searchInput } from "@/styles/settings";

/** The item slug in /items/<slug>/, where present. */
function activeItemSlug(pathname: string): string | undefined {
  const [section, slug] = pathname.split("/").filter(Boolean);
  return section === "items" ? slug : undefined;
}

/**
 * The items frame: one category's items, in the game's order (item ID), down
 * the left, with a selector at the bottom of the card that steps through the
 * categories and a box above it that filters every item by name; the page
 * (an item's sources, or NO DATA on /items/) is on the right. It lives in the
 * items layout so the list stays mounted while you move between items.
 */
export function ItemShell({ slug, children }: { slug?: string; children: React.ReactNode }) {
  const { items, error } = useItems();
  const [query, setQuery] = useState("");
  const filter = normalizeItemName(useDeferredValue(query));
  const listRef = useRef<HTMLDivElement>(null);

  // The category shown. Opening an item switches to its category; the
  // selector changes it without leaving the item.
  const active = slug ? items?.bySlug(slug) : undefined;
  const [category, setCategory] = useState<ItemCategorySlug>(ITEM_CATEGORIES[0].slug);
  const [syncedTo, setSyncedTo] = useState<number | null>(null);
  if (active && active.id !== syncedTo) {
    setSyncedTo(active.id);
    const c = itemCategory(active.id);
    if (c !== "other") setCategory(c);
  }

  const shown = items?.list.filter((it) =>
    filter ? normalizeItemName(it.name).includes(filter) : itemCategory(it.id) === category,
  );

  // Warm the drop and reward index, so the first item opened fills in at once.
  useEffect(() => {
    getItemSources().catch(() => {});
  }, []);

  const index = ITEM_CATEGORIES.findIndex((c) => c.slug === category);
  const step = (by: 1 | -1) => {
    const n = ITEM_CATEGORIES.length;
    setCategory(ITEM_CATEGORIES[(index + by + n) % n]!.slug);
    setQuery("");
    // The list's scroll container is the card around it.
    for (let el = listRef.current?.parentElement; el; el = el.parentElement) {
      if (getComputedStyle(el).overflowY === "auto") {
        el.scrollTo({ top: 0 });
        break;
      }
    }
  };

  return (
    <>
      <QuestNav back="/" />
      <BorderRule />
      <div className="split-page">
        {/* Above the card (z-2) so the bar and its arrows draw over the frame.
            On a phone the detail card goes below the list, so the list
            scrolls in a box instead of running the length of a category. */}
        <div
          data-tree-panel
          className="relative z-2 flex min-h-0 min-w-0 flex-1 flex-col gap-[0.8rem] mobile:h-[50vh] mobile:flex-none"
        >
          <input
            className={searchInput}
            type="search"
            aria-label="Filter every item by name"
            placeholder="Filter all items, e.g. Rathalos"
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Card variant="weapon-tree" className="min-h-0">
            <TreeScroll treeKey={filter ? "items-filter" : `items-${category}`} activeSlug={slug}>
              <div ref={listRef} className="flex flex-col">
                {error && <p className="px-[16px] text-negative">Couldn&apos;t load items.</p>}
                {shown?.length === 0 && <p className="px-[16px] text-muted">No items match.</p>}
                {shown?.map((it) => (
                  <Link
                    key={it.id}
                    id={it.slug}
                    href={`/items/${it.slug}/`}
                    // The list stays put; don't scroll the page to the detail card.
                    scroll={false}
                    aria-current={it.slug === slug ? "page" : undefined}
                    className={cn(
                      "list-row",
                      it.slug === slug && "bg-(image:--gradient-hover-glow)",
                    )}
                  >
                    <Icon type={it.type} color={it.color} />
                    <p className="truncate">{it.name}</p>
                  </Link>
                ))}
              </div>
            </TreeScroll>
            {/* Room to scroll the last rows clear of the category bar. */}
            <div className="flex-none" style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />
          </Card>
          <SelectorBar
            label={filter ? "All categories" : ITEM_CATEGORIES[index]!.label}
            groupLabel="Item category"
            previousLabel="Previous category"
            nextLabel="Next category"
            onStep={step}
            count={filter ? `${shown?.length ?? 0}` : `${index + 1}/${ITEM_CATEGORIES.length}`}
            countLabel={
              filter
                ? `${shown?.length ?? 0} items match`
                : `Category ${index + 1} of ${ITEM_CATEGORIES.length}`
            }
          />
        </div>
        {children}
      </div>
    </>
  );
}

/** ItemShell for the current route (used by the items layout). */
export default function ItemRouteShell({ children }: { children: React.ReactNode }) {
  return <ItemShell slug={activeItemSlug(usePathname())}>{children}</ItemShell>;
}
