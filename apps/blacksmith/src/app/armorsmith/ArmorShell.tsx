"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import ArmorNav from "@/components/ArmorNav";
import ArmorTreePanel from "@/components/ArmorTreePanel";
import SplitPage from "@/components/SplitPage";
import TreeScroll, { shownRows, TreeBranch } from "@/components/TreeScroll";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import { useKeepingActive, useVisibleTree } from "@/hooks/useVisibleTree";
import { useArmorVersions, type ArmorVersionRow } from "@/lib/client-data";
import { useArmorRankFilter, type ArmorRankFilter } from "@/lib/armor-rank-filter-store";
import type { WeaponTreeNode } from "@/lib/types";
import { ARMOR_RANKS, ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "@/lib/constants";
import { prefetchManifest } from "@/lib/models";

/** The slot, rank and piece in /armorsmith/<slot>/<rank>/<slug>/, where present. */
function parseArmorPath(pathname: string): { slot?: ArmorSlot; rank?: ArmorRank; slug?: string } {
  const [section, slot, rank, slug] = pathname.split("/").filter(Boolean);
  if (section !== "armorsmith") return {};
  if (!ARMOR_SLOTS.includes(slot as ArmorSlot) || !ARMOR_RANKS.includes(rank as ArmorRank)) {
    return {};
  }
  return { slot: slot as ArmorSlot, rank: rank as ArmorRank, slug };
}

/**
 * The slot's versions tree: each piece's first version, with its other
 * versions under it, filtered by the rank bar (see armor-rank-filter-store and
 * versionsTree). Rows are keyed <rank>/<slug> under /armorsmith/<slot>/.
 */
function ArmorSidebar({ slot, rank, slug }: { slot: ArmorSlot; rank: ArmorRank; slug?: string }) {
  const filter = useArmorRankFilter(rank, slug);
  const families = useArmorVersions(slot);
  // Warm the model list so a piece's 3D button shows with the rest of its page.
  useEffect(() => prefetchManifest(`armor/${slot}`), [slot]);
  const basePath = `/armorsmith/${slot}/`;
  const treeKey = `armor-${slot}-${filter}`;
  const activeSlug = slug && `${rank}/${slug}`;
  // Each step keeps the open piece, and stays the same tree while it is in
  // it anyway, so moving between pieces leaves the rows alone.
  const tree = useKeepingActive(
    (keep) => families && versionsTree(families, filter, keep),
    [families, filter],
    activeSlug,
  );
  const prunedTree = useVisibleTree(tree, slot, basePath, activeSlug);
  // Quest progress can take every row at the filter's rank out of a piece's
  // line, leaving only its faded versions: drop those lines too.
  const visibleTree = useKeepingActive(
    (keep) =>
      filter === "all"
        ? prunedTree
        : (prunedTree?.filter((node) => hasBrightRow(node, keep)) ?? null),
    [prunedTree, filter],
    activeSlug,
  );
  return (
    <ArmorTreePanel slot={slot} rank={rank} slug={slug} filter={filter}>
      <TreeScroll treeKey={treeKey} activeSlug={activeSlug}>
        {visibleTree?.map((node) => (
          <TreeBranch key={node.slug} rows={shownRows(node, treeKey)}>
            <WeaponTreeRow node={node} sectionType={slot} basePath={basePath} treeKey={treeKey} />
          </TreeBranch>
        ))}
      </TreeScroll>
    </ArmorTreePanel>
  );
}

/**
 * The tree for one filter. A rank filter keeps the pieces with a version at
 * that rank, in that rank's list order (by rarity), and keeps their versions
 * at the other ranks too, faded, so a piece's whole line stays in reach. All
 * ranks lists pieces by their first version: rank by rank, each in its list's
 * order. The open piece's line always stays, sorted by its first version
 * when it has none at the filter's rank.
 */
function versionsTree(
  families: ArmorVersionRow[][],
  filter: ArmorRankFilter,
  activeSlug?: string,
): WeaponTreeNode[] {
  const slugOf = (v: ArmorVersionRow) => `${v.rank}/${v.node.slug}`;
  const node = (v: ArmorVersionRow): WeaponTreeNode => ({
    ...v.node,
    slug: slugOf(v),
    dimmed: filter !== "all" && v.rank !== filter ? true : undefined,
  });
  const sortKey = (f: ArmorVersionRow[]) =>
    (filter !== "all" && f.find((v) => v.rank === filter)) || f[0];
  return families
    .filter((f) => filter === "all" || f.some((v) => v.rank === filter || slugOf(v) === activeSlug))
    .toSorted((a, b) => {
      const [x, y] = [sortKey(a), sortKey(b)];
      return ARMOR_RANKS.indexOf(x.rank) - ARMOR_RANKS.indexOf(y.rank) || x.order - y.order;
    })
    .map(([first, ...rest]) => ({
      ...node(first),
      children: rest.length ? rest.map(node) : undefined,
    }));
}

/** A row in this line is at the filter's rank (not faded), or is the open piece. */
function hasBrightRow(node: WeaponTreeNode, activeSlug?: string): boolean {
  return (
    !node.dimmed ||
    node.slug === activeSlug ||
    !!node.children?.some((child) => hasBrightRow(child, activeSlug))
  );
}

/**
 * The armorsmith frame: page bar with the slot tabs, and the slot's tree at
 * the current rank down the left, with the page (a piece's details, or NO
 * DATA on the slot's own page) on the right. It lives in the armorsmith layout
 * so it stays mounted while you move between pieces, slots and ranks; only
 * the right-hand card re-renders.
 */
export function ArmorShell({
  slot,
  rank,
  slug,
  children,
}: {
  slot?: ArmorSlot;
  rank?: ArmorRank;
  slug?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <ArmorNav activeSlot={slot} rank={rank} />
      {slot && rank ? (
        <SplitPage
          list={<ArmorSidebar slot={slot} rank={rank} slug={slug} />}
          closeHref={slug && `/armorsmith/${slot}/${rank}/`}
        >
          {children}
        </SplitPage>
      ) : (
        children
      )}
    </>
  );
}

/** ArmorShell for the current route (used by the armorsmith layout). */
export default function ArmorRouteShell({ children }: { children: React.ReactNode }) {
  const { slot, rank, slug } = parseArmorPath(usePathname());
  return (
    <ArmorShell slot={slot} rank={rank} slug={slug}>
      {children}
    </ArmorShell>
  );
}
