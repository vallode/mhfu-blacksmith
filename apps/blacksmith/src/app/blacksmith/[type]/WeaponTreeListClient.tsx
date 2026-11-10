"use client";

import { NoDataCard } from "@/components/DetailPanel";
import { useVisibleTree } from "@/hooks/useVisibleTree";
import type { WeaponType } from "@/lib/constants";
import { useWeaponTree } from "@/lib/client-data";

interface Props {
  type: WeaponType;
}

/**
 * /blacksmith/<type>/: the tree is down the left in the blacksmith layout
 * (WeaponShell); with no weapon selected, the detail card is empty. Phones
 * show only the tree here.
 */
export default function WeaponTreeListClient({ type }: Props) {
  const { tree } = useWeaponTree(type);
  const visibleTree = useVisibleTree(tree, type, `/blacksmith/${type}/`);
  // Everything on this page is out of reach at the chosen quest progress.
  const allHidden = !!tree?.length && visibleTree?.length === 0;

  return (
    <NoDataCard className="mobile:hidden">
      {allHidden && (
        <p className="whitespace-normal">Nothing here is within your quest progress yet.</p>
      )}
    </NoDataCard>
  );
}
