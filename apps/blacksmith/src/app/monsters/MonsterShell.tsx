"use client";

import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import MonsterNav from "@/components/MonsterNav";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "@/components/SelectorBar";
import SplitPage from "@/components/SplitPage";
import TreeScroll from "@/components/TreeScroll";
import { useLocale } from "@/context/LanguageContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { cn } from "@/lib/cn";
import { getQuests, useMonsterList } from "@/lib/client-data";
import { monsterRecordFor } from "@/lib/monster-ids";
import {
  cycleMonsterFilter,
  filterCount,
  matchesMonster,
  monsterFilters,
  type MonsterFilterId,
} from "@/lib/monster-filter";
import { prefetchManifest } from "@/lib/models";
import { filterFade, filteredOut } from "@/styles/list";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";

// Some monsters have no art; keep the layout and hide the broken-image glyph.
const hideBroken: React.ReactEventHandler<HTMLImageElement> = (e) => {
  e.currentTarget.style.visibility = "hidden";
};

/** The monster type and slug in /monsters/<category>/<slug>/, where present. */
function parseMonsterPath(pathname: string): { category?: MonsterCategory; slug?: string } {
  const [section, category, slug] = pathname.split("/").filter(Boolean);
  if (section !== "monsters") return {};
  if (!MONSTER_CATEGORIES.includes(category as MonsterCategory)) return {};
  return { category: category as MonsterCategory, slug };
}

/**
 * A row's capture or kill count, right of its name: "×3" on screen, the
 * whole "Captured 3 times" for screen readers and on hover.
 */
function CountBadge({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="ml-auto pl-4 text-muted tabular-nums" title={label}>
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The monsters of one type, down the left of the type's pages. With a hunter
 * loaded (and Hunt records on), a selector under the list picks out the
 * monsters they have captured or hunted: those show their count, and the rest
 * are dimmed in place.
 */
function MonsterSidebar({ category, slug }: { category: MonsterCategory; slug?: string }) {
  const { items: siblings } = useMonsterList(category);
  const { t, game, formatNumber } = useLocale();
  const tl = t.monsters.list;
  const { save } = useSave();
  const { showHuntRecords } = usePreferences().prefs;
  const records = showHuntRecords ? save?.monsters : undefined;
  const recordOf = (name: string) => monsterRecordFor(records, name);

  // The choice is kept while moving between types; Captured, in a type with
  // nothing to capture, reads as All there and applies again on returning.
  const [selected, setSelected] = useState<MonsterFilterId>("all");
  const anyCapturable = !!siblings?.some((m) => m.capturable);
  const filter = records && monsterFilters(anyCapturable).includes(selected) ? selected : "all";
  const rows = siblings?.map((m) => {
    const record = recordOf(m.name);
    return {
      ...m,
      match: matchesMonster(filter, m.capturable, record),
      count: filterCount(filter, record),
    };
  });
  // Captured counts out of the monsters there are to capture.
  const total = filter === "captured" ? rows?.filter((m) => m.capturable) : rows;
  const matched = rows?.filter((m) => m.match).length ?? 0;

  // Portraits are small sprites; fetch the type's ahead of a click so the
  // detail card's scroll isn't empty for a frame while one loads.
  for (const m of siblings ?? []) {
    ReactDOM.preload(`/images/monsters/${m.slug}.png`, { as: "image" });
  }
  return (
    // Above the card (z-1) so the filter bar and its arrows draw over the frame.
    <CardBox data-tree-panel={!!records || undefined}>
      <Card variant="weapon-tree">
        <TreeScroll treeKey={`monsters-${category}`} activeSlug={slug}>
          {rows?.map((m) => (
            <Link
              key={m.slug}
              id={m.slug}
              href={`/monsters/${category}/${m.slug}/`}
              aria-current={m.slug === slug ? "page" : undefined}
              // The selected monster gets the weapon tree's active row: the hover
              // glow's green, held still. Rows the filter leaves out are dimmed,
              // as in the weapon tree.
              className={cn(
                "list-row",
                filterFade,
                m.slug === slug && "bg-(image:--gradient-hover-glow)",
                !m.match && filteredOut,
              )}
            >
              {/* The 36px portrait at 28px, in the same 32px slot as other row
                icons. Any smaller and nearest-neighbour scaling starts to
                visibly drop rows of its pixels. */}
              <img
                className="mr-[6px] h-[32px] w-[32px] flex-none p-[2px] pixelated"
                src={`/images/monsters/${m.slug}.png`}
                alt=""
                decoding="sync"
                onError={hideBroken}
              />
              <p>{game.name("monster", m.name)}</p>
              {m.match && m.count !== null && (
                <CountBadge
                  label={(filter === "captured" ? tl.capturesTitle : tl.killsTitle)(
                    m.count,
                    formatNumber(m.count),
                  )}
                >
                  {tl.count(formatNumber(m.count))}
                </CountBadge>
              )}
            </Link>
          ))}
          {/* Room to scroll the last rows clear of the filter bar. */}
          {records && <div style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />}
        </TreeScroll>
      </Card>
      {records && total && (
        <SelectorBar
          label={tl.filters[filter]}
          groupLabel={tl.filterGroup}
          previousLabel={t.equipment.tree.previousFilter}
          nextLabel={t.equipment.tree.nextFilter}
          onStep={(by) => setSelected(cycleMonsterFilter(filter, by, anyCapturable))}
          count={`${matched}/${total.length}`}
          countLabel={tl.filterCount(matched, total.length)}
        />
      )}
    </CardBox>
  );
}

/**
 * The bestiary frame: page bar with the type tabs, and the list of the type's
 * monsters down the left, with the page (a monster's details, or NO DATA on
 * the type's own page) on the right. It lives in the monsters layout so it
 * stays mounted while you move between monsters (and types); only the
 * right-hand card re-renders, instead of the whole page being torn down and
 * rebuilt.
 */
export function MonsterShell({
  category,
  slug,
  children,
}: {
  category?: MonsterCategory;
  slug?: string;
  children: React.ReactNode;
}) {
  // Warm what a monster's page needs beyond its bundle (the portrait's scroll,
  // the model list for the cube button, the quests for the Quests tab), so the
  // first monster opened from a type page doesn't fill in over a few frames.
  ReactDOM.preload("/images/scroll.png", { as: "image" });
  useEffect(() => {
    prefetchManifest("monsters");
    getQuests().catch(() => {});
  }, []);

  return (
    <>
      <MonsterNav activeCategory={category} />
      {category ? (
        <SplitPage
          list={<MonsterSidebar category={category} slug={slug} />}
          closeHref={slug && `/monsters/${category}/`}
        >
          {children}
        </SplitPage>
      ) : (
        children
      )}
    </>
  );
}

/** MonsterShell for the current route (used by the monsters layout). */
export default function MonsterRouteShell({ children }: { children: React.ReactNode }) {
  const { category, slug } = parseMonsterPath(usePathname());
  return (
    <MonsterShell category={category} slug={slug}>
      {children}
    </MonsterShell>
  );
}
