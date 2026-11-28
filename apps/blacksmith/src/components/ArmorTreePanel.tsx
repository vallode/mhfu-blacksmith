"use client";

/**
 * The armor tree sidebar card, with the rank filter at the bottom in the style
 * of the weapon tree's filter bar: All ranks, Low, High, G Rank (see
 * armor-rank-filter-store). On a piece's page it only filters the tree; on a
 * rank's list page it goes to that rank's page, so the page and tree agree.
 * On phones the armor slot bar (TypeBar) sits over its top.
 */
import { useRouter } from "next/navigation";
import Card from "./Card";
import CardBox from "./CardBox";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "./SelectorBar";
import TypeBar, { TypeBarSpace, typeBarScrollPadding } from "./TypeBar";
import { ARMOR_RANKS, ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "@/lib/constants";
import { prefetchBundle } from "@/lib/client-data";
import { useT } from "@/context/LanguageContext";
import {
  ARMOR_RANK_FILTERS,
  writeArmorRankFilter,
  type ArmorRankFilter,
} from "@/lib/armor-rank-filter-store";

interface Props {
  slot: ArmorSlot;
  rank: ArmorRank;
  /** The open piece, if any. */
  slug?: string;
  filter: ArmorRankFilter;
  /** The tree itself (a TreeScroll). */
  children: React.ReactNode;
}

export default function ArmorTreePanel({ slot, rank, slug, filter, children }: Props) {
  const router = useRouter();
  const t = useT();
  const tt = t.equipment.tree;

  const step = (by: 1 | -1) => {
    const i = ARMOR_RANK_FILTERS.indexOf(filter);
    const next =
      ARMOR_RANK_FILTERS[(i + by + ARMOR_RANK_FILTERS.length) % ARMOR_RANK_FILTERS.length];
    for (const r of ARMOR_RANKS) prefetchBundle(`armor-${slot}-${r}`);
    writeArmorRankFilter(next);
    if (slug || next === "all" || next === rank) return;
    // The panel stays mounted (armorsmith layout); keep the page where it is
    // rather than letting the router scroll to the new rank's card.
    router.push(`/armorsmith/${slot}/${next}/`, { scroll: false });
  };

  return (
    <CardBox data-tree-panel>
      <Card variant="weapon-tree" bodyClassName={typeBarScrollPadding}>
        <TypeBarSpace />
        {children}
        {/* Room to scroll the last rows clear of the rank bar. flex-none: the
            card is a flex column, and an empty item would shrink to nothing. */}
        <div className="flex-none" style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />
      </Card>
      <TypeBar
        types={ARMOR_SLOTS}
        current={slot}
        href={(option) => `/armorsmith/${option}/${rank}/`}
        name={(option) => t.common.armorSlots[option]}
        labels={{
          group: t.equipment.nav.armorSlot,
          previous: t.equipment.nav.previousArmorSlot,
          next: t.equipment.nav.nextArmorSlot,
          choose: t.equipment.nav.chooseArmorSlot,
          grid: t.equipment.nav.armorSlots,
        }}
      />
      <SelectorBar
        label={filter === "all" ? tt.allRanks : t.common.ranks[filter]}
        groupLabel={tt.rankGroup}
        previousLabel={tt.previousRank}
        nextLabel={tt.nextRank}
        onStep={step}
      />
    </CardBox>
  );
}
