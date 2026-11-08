"use client";

import WeaponTreeRow from "@/components/WeaponTreeRow";
import TreeScroll from "@/components/TreeScroll";
import Card from "@/components/Card";
import ArmorNav from "@/components/ArmorNav";
import ArmorTreePanel from "@/components/ArmorTreePanel";
import { useVisibleTree } from "@/hooks/useVisibleTree";
import type { ArmorSlot, ArmorRank } from "@/lib/constants";
import { useArmorTree } from "@/lib/client-data";
import BorderRule from "@/components/BorderRule";

interface Props {
  slot: ArmorSlot;
  rank: ArmorRank;
}

export default function ArmorTreeListClient({ slot, rank }: Props) {
  const { tree, loading } = useArmorTree(slot, rank);
  const basePath = `/armorsmith/${slot}/${rank}/`;
  const visibleTree = useVisibleTree(tree, slot, basePath);
  // Everything on this page is out of reach at the chosen quest progress.
  const allHidden = !!tree?.length && visibleTree?.length === 0;

  return (
    <>
      <ArmorNav activeSlot={slot} rank={rank} />
      <BorderRule />

      <div className="split-page">
        <ArmorTreePanel slot={slot} rank={rank}>
          <TreeScroll treeKey={`armor-${slot}-${rank}`}>
            {!loading &&
              visibleTree?.map((node) => (
                <ul key={node.slug}>
                  <WeaponTreeRow
                    node={node}
                    sectionType={slot}
                    basePath={basePath}
                    treeKey={`armor-${slot}-${rank}`}
                  />
                </ul>
              ))}
          </TreeScroll>
        </ArmorTreePanel>

        <Card>
          <p className="leading-[1.2] whitespace-normal">
            {loading
              ? "Loading…"
              : allHidden
                ? "Nothing here is within your quest progress yet."
                : "Select a piece of armor from the tree."}
          </p>
        </Card>
      </div>
    </>
  );
}
