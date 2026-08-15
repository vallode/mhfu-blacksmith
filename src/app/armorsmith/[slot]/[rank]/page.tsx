import Link from "next/link";
import { notFound } from "next/navigation";
import { getArmorParams, getArmorTree } from "@/lib/armor";
import { ARMOR_SLOTS, ARMOR_RANKS, type ArmorSlot, type ArmorRank } from "@/lib/constants";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import TreeScroll from "@/components/TreeScroll";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slot: string; rank: string }>;
}

export async function generateStaticParams() {
  return getArmorParams().map(({ slot, rank }) => ({ slot, rank }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slot, rank } = await params;
  const fmt = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { title: `${fmt(rank)} ${fmt(slot)} — MHFU Blacksmith` };
}

export default async function ArmorTreePage({ params }: Props) {
  const { slot, rank } = await params;

  if (!ARMOR_SLOTS.includes(slot as ArmorSlot) || !ARMOR_RANKS.includes(rank as ArmorRank)) {
    notFound();
  }

  const tree = getArmorTree(slot as ArmorSlot, rank as ArmorRank);
  if (!tree) notFound();

  const basePath = `/armorsmith/${slot}/${rank}/`;

  return (
    <>
      <nav className="flex w-full items-center justify-start max-[600px]:flex-wrap max-[600px]:justify-center">
        <div>
          <Link href="/armorsmith/" aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
        <div className="ml-auto">
          <button
            className="search-trigger flex h-[52px] w-[52px] cursor-pointer items-center border-none bg-none p-0 text-white/60 hover:text-white [&>img]:h-full"
            aria-label="Search"
          >
            <img src="/images/binoculars.png" alt="Search" />
          </button>
        </div>
      </nav>
      <hr className="border" />

      <div className="split-page">
        <Card variant="weapon-tree">
          <TreeScroll treeKey={`armor-${slot}-${rank}`}>
            {tree.map.map((node) => (
              <ul key={node.slug}>
                <WeaponTreeRow node={node} sectionType={slot} basePath={basePath} />
              </ul>
            ))}
          </TreeScroll>
        </Card>

        <Card>
          <p>Select a piece of armor from the tree.</p>
        </Card>
      </div>
    </>
  );
}
