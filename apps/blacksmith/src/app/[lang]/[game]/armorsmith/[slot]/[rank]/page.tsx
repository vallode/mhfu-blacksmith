import { notFound } from "next/navigation";
import { getArmorParams, getArmorPieces } from "@/lib/armor";
import { pageMetadata, titleCase } from "@/lib/seo";
import { ARMOR_SLOTS, ARMOR_RANKS, type ArmorSlot, type ArmorRank } from "@/lib/constants";
import type { Metadata } from "next";
import { pathsOf, type PageProps } from "@/lib/site-params";
import ArmorTreeListClient from "./ArmorTreeListClient";

type Props = PageProps<{ slot: string; rank: string }>;

export async function generateStaticParams() {
  return getArmorParams().map(({ slot, rank }) => ({ slot, rank }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slot, rank, ...site } = await params;
  const name = `${titleCase(rank)} ${titleCase(slot)}`;
  const count = getArmorPieces(slot as ArmorSlot, rank as ArmorRank).length;
  return pageMetadata({
    title: name,
    description: `${count} ${name} pieces in Monster Hunter Freedom Unite, with defense, resistances, skills and recipes.`,
    path: pathsOf(site).armor(slot, rank),
  });
}

export default async function ArmorTreePage({ params }: Props) {
  const { slot, rank } = await params;

  if (!ARMOR_SLOTS.includes(slot as ArmorSlot) || !ARMOR_RANKS.includes(rank as ArmorRank)) {
    notFound();
  }

  return <ArmorTreeListClient slot={slot as ArmorSlot} rank={rank as ArmorRank} />;
}
