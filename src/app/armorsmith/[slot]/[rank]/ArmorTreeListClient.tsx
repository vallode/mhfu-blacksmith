"use client";

import Link from "next/link";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import TreeScroll from "@/components/TreeScroll";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
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
      <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
        <div>
          <Link href="/armorsmith/" aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
        <div className="ml-auto">
          <button
            className="search-trigger flex h-[52px] w-[52px] cursor-pointer items-center border-none bg-transparent p-0 text-white/60 hover:text-white [&>img]:h-full"
            aria-label="Search"
          >
            <img src="/images/binoculars.png" alt="Search" decoding="sync" />
          </button>
        </div>
      </nav>
      <BorderRule />

      <div className="split-page">
        <Card variant="weapon-tree">
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
        </Card>

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
