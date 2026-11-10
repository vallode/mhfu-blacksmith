"use client";

import { useEffect } from "react";
import ReactDOM from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Card from "@/components/Card";
import MonsterNav from "@/components/MonsterNav";
import SplitPage from "@/components/SplitPage";
import TreeScroll from "@/components/TreeScroll";
import { cn } from "@/lib/cn";
import { getQuests, useMonsterList } from "@/lib/client-data";
import { prefetchManifest } from "@/lib/models";
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

/** The monsters of one type, down the left of the type's pages. */
function MonsterSidebar({ category, slug }: { category: MonsterCategory; slug?: string }) {
  const { items: siblings } = useMonsterList(category);
  // Portraits are small sprites; fetch the type's ahead of a click so the
  // detail card's scroll isn't empty for a frame while one loads.
  for (const m of siblings ?? []) {
    ReactDOM.preload(`/images/monsters/${m.slug}.png`, { as: "image" });
  }
  return (
    <Card variant="weapon-tree">
      <TreeScroll treeKey={`monsters-${category}`} activeSlug={slug}>
        {siblings?.map((m) => (
          <Link
            key={m.slug}
            id={m.slug}
            href={`/monsters/${category}/${m.slug}/`}
            // The list stays put; don't let the router scroll the page to the
            // new detail card.
            scroll={false}
            aria-current={m.slug === slug ? "page" : undefined}
            // The selected monster gets the weapon tree's active row: the hover
            // glow's green, held still.
            className={cn("list-row", m.slug === slug && "bg-(image:--gradient-hover-glow)")}
          >
            {/* The portrait thumbnails fill their square, so they sit inside
                the same 32px slot as other row icons with 4px of padding. */}
            <img
              className="h-[32px] w-[32px] flex-none p-[4px] pixelated"
              src={`/images/monsters/${m.slug}-favicon.png`}
              alt=""
              decoding="sync"
              onError={hideBroken}
            />
            <p>{m.name}</p>
          </Link>
        ))}
      </TreeScroll>
    </Card>
  );
}

/**
 * The bestiary frame: page bar with the type tabs, and the list of the type's monsters
 * down the left, with the page (a monster's details, or NO DATA on the type's
 * own page) on the right. It lives in the monsters layout so it stays mounted
 * while you move between monsters (and types); only the right-hand card
 * re-renders, instead of the whole page being torn down and rebuilt.
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
