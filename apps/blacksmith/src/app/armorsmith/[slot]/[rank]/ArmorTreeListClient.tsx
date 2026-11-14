"use client";

import { NoDataCard } from "@/components/DetailPanel";
import { useVisibleTree } from "@/hooks/useVisibleTree";
import type { ArmorSlot, ArmorRank } from "@/lib/constants";
import { useArmorTree } from "@/lib/client-data";
import { useT } from "@/context/LanguageContext";

interface Props {
  slot: ArmorSlot;
  rank: ArmorRank;
}

/**
 * /armorsmith/<slot>/<rank>/: the tree is down the left in the armorsmith
 * layout (ArmorShell); with no piece selected, the detail card is empty.
 */
export default function ArmorTreeListClient({ slot, rank }: Props) {
  const { tree } = useArmorTree(slot, rank);
  const t = useT();
  const visibleTree = useVisibleTree(tree, slot, `/armorsmith/${slot}/${rank}/`);
  // Everything on this page is out of reach at the chosen quest progress.
  const allHidden = !!tree?.length && visibleTree?.length === 0;

  return (
    <NoDataCard>
      {allHidden && <p className="whitespace-normal">{t.equipment.tree.nothingYet}</p>}
    </NoDataCard>
  );
}
