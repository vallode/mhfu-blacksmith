"use client";

import { NoDataCard } from "@/components/DetailPanel";
import { useVisibleTree } from "@/hooks/useVisibleTree";
import type { WeaponType } from "@/lib/constants";
import { useWeaponTree } from "@/lib/client-data";
import { useT } from "@/context/LanguageContext";

interface Props {
  type: WeaponType;
}

/**
 * /blacksmith/<type>/: the tree is down the left in the blacksmith layout
 * (WeaponShell); with no weapon selected, the detail card is empty.
 */
export default function WeaponTreeListClient({ type }: Props) {
  const { tree } = useWeaponTree(type);
  const t = useT();
  const visibleTree = useVisibleTree(tree, type, `/blacksmith/${type}/`);
  // Everything on this page is out of reach at the chosen quest progress.
  const allHidden = !!tree?.length && visibleTree?.length === 0;

  return (
    <NoDataCard>
      {allHidden && <p className="whitespace-normal">{t.equipment.tree.nothingYet}</p>}
    </NoDataCard>
  );
}
