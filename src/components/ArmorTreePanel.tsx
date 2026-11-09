"use client";

/**
 * The armor tree sidebar card, with a rank selector at the bottom in the style
 * of the weapon tree's filter bar. Each rank is its own page, so stepping the
 * selector navigates to the same slot at the next rank.
 */
import { useRouter } from "next/navigation";
import Card from "./Card";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "./SelectorBar";
import { ARMOR_RANKS, type ArmorRank, type ArmorSlot } from "@/lib/constants";
import { prefetchBundle } from "@/lib/client-data";

export const RANK_LABELS: Record<ArmorRank, string> = {
  "low-rank": "Low Rank",
  "high-rank": "High Rank",
  "g-rank": "G Rank",
};

interface Props {
  slot: ArmorSlot;
  rank: ArmorRank;
  /** The tree itself (a TreeScroll). */
  children: React.ReactNode;
}

export default function ArmorTreePanel({ slot, rank, children }: Props) {
  const router = useRouter();

  const step = (by: 1 | -1) => {
    const i = ARMOR_RANKS.indexOf(rank);
    const next = ARMOR_RANKS[(i + by + ARMOR_RANKS.length) % ARMOR_RANKS.length];
    prefetchBundle(`armor-${slot}-${next}`);
    // The panel stays mounted (armorsmith layout); keep the page where it is
    // rather than letting the router scroll to the new rank's card.
    router.push(`/armorsmith/${slot}/${next}/`, { scroll: false });
  };

  return (
    <div data-tree-panel className="relative z-2 flex min-h-0 min-w-0 flex-1 flex-col">
      <Card variant="weapon-tree">
        {children}
        {/* Room to scroll the last rows clear of the rank bar. */}
        <div style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />
      </Card>
      <SelectorBar
        label={RANK_LABELS[rank]}
        groupLabel="Armor rank"
        previousLabel="Previous rank"
        nextLabel="Next rank"
        onStep={step}
      />
    </div>
  );
}
