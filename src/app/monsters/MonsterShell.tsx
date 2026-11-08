"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BorderRule from "@/components/BorderRule";
import Card from "@/components/Card";
import MonsterNav from "@/components/MonsterNav";
import TreeScroll from "@/components/TreeScroll";
import { cn } from "@/lib/cn";
import { useMonsterList } from "@/lib/client-data";
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

/** The other monsters of the same type, down the left of a monster page. */
function MonsterSidebar({ category, slug }: { category: MonsterCategory; slug: string }) {
  const { items: siblings } = useMonsterList(category);
  return (
    <Card variant="weapon-tree">
      <TreeScroll treeKey={`monsters-${category}`} activeSlug={slug}>
        {siblings?.map((m) => (
          <Link
            key={m.slug}
            id={m.slug}
            href={`/monsters/${category}/${m.slug}/`}
            aria-current={m.slug === slug ? "page" : undefined}
            className={cn("list-row", m.slug === slug && "bg-white/10")}
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
 * The bestiary frame: type nav, divider and, on a monster's page, the list of
 * its type down the left. It lives in the monsters layout so it stays mounted
 * while you move between monsters (and types); only the detail panel
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
  return (
    <>
      <MonsterNav activeCategory={category} />
      <BorderRule />
      {category && slug ? (
        <div className="split-page">
          <MonsterSidebar category={category} slug={slug} />
          {children}
        </div>
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
