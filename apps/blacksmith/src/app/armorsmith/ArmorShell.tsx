"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import ArmorNav from "@/components/ArmorNav";
import ArmorTreePanel from "@/components/ArmorTreePanel";
import SplitPage from "@/components/SplitPage";
import TreeScroll from "@/components/TreeScroll";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import { useVisibleTree } from "@/hooks/useVisibleTree";
import { useArmorTree } from "@/lib/client-data";
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

/** The slot's armor tree at one rank, with the rank selector. */
function ArmorSidebar({ slot, rank, slug }: { slot: ArmorSlot; rank: ArmorRank; slug?: string }) {
  const { tree } = useArmorTree(slot, rank);
  const basePath = `/armorsmith/${slot}/${rank}/`;
  const treeKey = `armor-${slot}-${rank}`;
  const visibleTree = useVisibleTree(tree, slot, basePath, slug);
  // Warm the model list so a piece's 3D button shows with the rest of its page.
  useEffect(() => prefetchManifest(`armor/${slot}`), [slot]);
  return (
    <ArmorTreePanel slot={slot} rank={rank}>
      <TreeScroll treeKey={treeKey} activeSlug={slug}>
        {visibleTree?.map((node) => (
          <ul key={node.slug}>
            <WeaponTreeRow
              node={node}
              sectionType={slot}
              basePath={basePath}
              treeKey={treeKey}
              activeSlug={slug}
            />
          </ul>
        ))}
      </TreeScroll>
    </ArmorTreePanel>
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
