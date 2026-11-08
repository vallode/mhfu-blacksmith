import { notFound } from "next/navigation";
import { getArmorParams, getArmorPieces, getArmorTree } from "@/lib/armor";
import { pageMetadata, titleCase } from "@/lib/seo";
import { ARMOR_SLOTS, ARMOR_RANKS, type ArmorSlot, type ArmorRank } from "@/lib/constants";
import type { Metadata } from "next";
import ArmorTreeListClient from "./ArmorTreeListClient";

interface Props {
  params: Promise<{ slot: string; rank: string }>;
}

export async function generateStaticParams() {
  return getArmorParams().map(({ slot, rank }) => ({ slot, rank }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slot, rank } = await params;
  const name = `${titleCase(rank)} ${titleCase(slot)}`;
  const count = getArmorPieces(slot as ArmorSlot, rank as ArmorRank).length;
  return pageMetadata({
    title: name,
    description: `${count} ${name} pieces in Monster Hunter Freedom Unite, with defense, resistances, skills and recipes.`,
    path: `/armorsmith/${slot}/${rank}/`,
  });
}

export default async function ArmorTreePage({ params }: Props) {
  const { slot, rank } = await params;

  if (!ARMOR_SLOTS.includes(slot as ArmorSlot) || !ARMOR_RANKS.includes(rank as ArmorRank)) {
    notFound();
  }

  const tree = getArmorTree(slot as ArmorSlot, rank as ArmorRank);
  if (!tree) notFound();

  return <ArmorTreeListClient slot={slot as ArmorSlot} rank={rank as ArmorRank} />;
}
