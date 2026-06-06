import { notFound } from "next/navigation";
import { getArmorParams, getArmorTree } from "@/lib/armor";
import { ARMOR_SLOTS, ARMOR_RANKS, type ArmorSlot, type ArmorRank } from "@/lib/constants";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import Card from "@/components/Card";
import styles from "@/styles/weapon-tree.module.scss";
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
      <nav className="weapon-navigation">
        <div>
          <a href="/armorsmith/">
            <div className="icon icon--nav">
              <img src="/images/arrow.png" alt="Back" />
            </div>
          </a>
        </div>
        <div className="search-trigger-wrap">
          <button className="search-trigger" aria-label="Search">
            <img src="/images/binoculars.png" alt="Search" />
          </button>
        </div>
      </nav>
      <hr className="border" />

      <div className="weapon-tree-page">
        <Card variant="weapon-tree">
          <div className={styles["weapon-tree"]}>
            {tree.map.map((node) => (
              <ul key={node.slug}>
                <WeaponTreeRow node={node} sectionType={slot} basePath={basePath} />
              </ul>
            ))}
          </div>
        </Card>
        <Card className="weapon-card">
          <p>Select a piece of armor from the tree.</p>
        </Card>
      </div>
    </>
  );
}
